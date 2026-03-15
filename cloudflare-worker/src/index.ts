import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database
  BUCKET: R2Bucket
}

const app = new Hono<{ Bindings: Bindings }>()

/**
 * Normalizes resource URLs to be absolute and correctly prefixed
 */
function normalizeResourceUrl(path: string | null | undefined, baseUrl: string, type: 'avatar' | 'cover' | 'mp3' | 'lrc'): string {
  if (!path) {
    if (type === 'avatar') return '/src/assets/images/avatars/default.png';
    if (type === 'cover') return '/src/assets/images/vinyl_default.png';
    return '';
  }

  if (path.startsWith('http')) return path;
  if (path.startsWith('/src/')) return path;

  // Ensure absolute path from Worker origin
  let finalPath = path;
  if (!path.startsWith('/storage/')) {
    // If it's a raw R2 key, prefix with /storage/
    finalPath = `/storage/${path.startsWith('/') ? path.slice(1) : path}`;
  }
  
  return baseUrl + finalPath;
}

// Global CORS for all routes (API and Storage)
app.use('/*', cors())

app.get('/', (c) => c.text('MOODY API Edge Worker is running!'))

// ==========================================
// 1. Storage Proxy (R2 Direct Access & CDN Cache)
// Equivalent to Go's /storage/* proxy
// ==========================================
app.get('/storage/*', async (c) => {
  const pathPrefix = '/storage/'
  // e.g. /storage/music/Artist/Album/Song.mp3 -> music/Artist/Album/Song.mp3
  const key = decodeURIComponent(c.req.path.slice(pathPrefix.length))
  
  if (!key) {
    return c.json({ error: 'Missing object key' }, 400)
  }

  // Check cache first (Cloudflare CDN Cache)
  const cacheUrl = new URL(c.req.url)
  const cacheKey = new Request(cacheUrl.toString(), c.req)
  const cache = caches.default
  
  let response = await cache.match(cacheKey)
  if (response) {
    // Return cached response
    return response
  }

  const object = await c.env.BUCKET.get(key)
  if (object === null) {
    return c.json({ error: 'Object not found' }, 404)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  // Cache the media objects at the Edge for 30 days
  headers.set('Cache-Control', 'public, max-age=2592000') 

  response = new Response(object.body, { headers })
  
  // Cache it in the background
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
  
  return response
})

// ==========================================
// 2. Welcome Images
// Equivalent to Go's /api/welcome-images
// ==========================================
app.get('/api/welcome-images', async (c) => {
  try {
    const list = await c.env.BUCKET.list({
      prefix: 'welcome_covers/'
    })

    const images = list.objects
      .filter((obj) => obj.key.match(/\.(jpg|jpeg|png|webp|gif)$/i))
      .map((obj) => {
        // Return only the filename as expected by app.js getWelcomeBackground
        return obj.key.split('/').pop() || ''
      })
      .filter(name => name !== '')

    // Shuffle and pick up to 10 images smoothly
    const shuffled = images.sort(() => 0.5 - Math.random())
    const selected = shuffled.slice(0, 10)

    if (selected.length === 0) {
      // Internal fallback
      selected.push('landing_cover.png')
    }

    return c.json({
      code: 200,
      message: 'success',
      data: selected
    })
  } catch (error: any) {
    console.error('Welcome images error:', error)
    return c.json({ code: 500, message: error.message }, 500)
  }
})

// ==========================================
// 3. Artists Skeleton List
// Equivalant to Go's /api/skeleton
// ==========================================
app.get('/api/skeleton', async (c) => {
  try {
    const groupFilter = c.req.query('group')
    // V3.0: Join with albums to get counts
    const query = `
      SELECT 
        a.id, a.name, a.region, a.photo_url,
        (SELECT COUNT(*) FROM albums WHERE artist_id = a.id) as album_count
      FROM artists a
      ORDER BY a.name ASC
    `
    const { results } = await c.env.DB.prepare(query).all()
    const baseUrl = new URL(c.req.url).origin

    let artists = results.map((row: any) => {
      let groupChar = '#'
      if (row.name && row.name.length > 0) {
        groupChar = row.name.charAt(0).toUpperCase()
      }
      
      return {
        id: `db_${row.id}`,
        name: row.name,
        group: groupChar,
        category: row.region || '华语',
        avatar: normalizeResourceUrl(row.photo_url, baseUrl, 'avatar'),
        albumCount: row.album_count || 0
      }
    })

    if (groupFilter) {
      artists = artists.filter(a => a.group.toLowerCase() === groupFilter.toLowerCase())
    }

    return c.json({
      code: 200,
      message: 'success',
      data: { artists }
    })
  } catch (error: any) {
    return c.json({ code: 500, message: error.message }, 500)
  }
})

// ==========================================
// 4. Nested Songs Tree
// Equivalant to Go's /api/songs
// ==========================================
app.get('/api/songs', async (c) => {
  try {
    const queryArtistId = c.req.query('artistId')
    const queryArtistName = c.req.query('artist')
    const queryAlbum = c.req.query('album')

    // Building a base flat query
    let sql = `
      SELECT 
        a.id AS artist_id, a.name AS artist_name, a.region, a.photo_url,
        al.id AS album_id, al.title AS album_title, al.release_date, al.cover_url,
        s.title AS song_title, s.file_path, s.lrc_path, s.track_index
      FROM artists a
      LEFT JOIN albums al ON a.id = al.artist_id
      LEFT JOIN songs s ON al.id = s.album_id
      WHERE 1=1
    `
    const params: any[] = []

    if (queryArtistId) {
      sql += ` AND a.id = ?`
      params.push(queryArtistId.replace('db_', ''))
    } else if (queryArtistName) {
      sql += ` AND a.name LIKE ?`
      params.push(`%${queryArtistName}%`)
    }

    if (queryAlbum) {
      sql += ` AND al.title LIKE ?`
      params.push(`%${queryAlbum}%`)
    }

    sql += ` ORDER BY a.name ASC, al.release_date ASC, s.track_index ASC`

    const { results } = await c.env.DB.prepare(sql).bind(...params).all()

    // Process flat rows into hierarchical structure
    const artistMap = new Map<number, any>()
    const baseUrl = new URL(c.req.url).origin

    for (const row of results as any[]) {
      if (!row.artist_id) continue

      if (!artistMap.has(row.artist_id)) {
        artistMap.set(row.artist_id, {
          id: `db_${row.artist_id}`,
          name: row.artist_name,
          category: row.region || '华语',
          avatar: normalizeResourceUrl(row.photo_url, baseUrl, 'avatar'),
          group: row.artist_name ? row.artist_name.charAt(0).toUpperCase() : '#',
          albums: new Map<number, any>()
        })
      }

      const artist = artistMap.get(row.artist_id)

      if (row.album_id) {
        if (!artist.albums.has(row.album_id)) {
          artist.albums.set(row.album_id, {
            title: row.album_title,
            year: row.release_date || '未知',
            cover: normalizeResourceUrl(row.cover_url, baseUrl, 'cover'),
            songs: []
          })
        }

        if (row.song_title) {
          const album = artist.albums.get(row.album_id)
          album.songs.push({
            title: row.song_title,
            path: row.file_path,
            lrc_path: row.lrc_path,
            TrackIndex: row.track_index
          })
        }
      }
    }

    // Convert Maps to Arrays
    const library = Array.from(artistMap.values()).map(artist => ({
      ...artist,
      albums: Array.from(artist.albums.values())
    }))

    return c.json({
      code: 200,
      message: 'success',
      data: library
    })
  } catch (error: any) {
    return c.json({ code: 500, message: error.message }, 500)
  }
})

// ==========================================
// 5. Global Search
// Equivalant to Go's /api/search
// ==========================================
app.get('/api/search', async (c) => {
  try {
    const q = c.req.query('q')
    if (!q) {
      return c.json({ code: 400, message: "missing query parameter 'q'" }, 400)
    }
    const likeQuery = `%${q}%`

    const stmtArtists = c.env.DB.prepare(`
      SELECT 
        id, name, region, photo_url,
        (SELECT COUNT(*) FROM albums WHERE artist_id = artists.id) as album_count
      FROM artists 
      WHERE name LIKE ?
    `).bind(likeQuery)
    const stmtAlbums = c.env.DB.prepare('SELECT id, title, artist_id as ArtistID, cover_url as CoverURL FROM albums WHERE title LIKE ?').bind(likeQuery)
    const stmtSongs = c.env.DB.prepare('SELECT id, title, artist_id as ArtistID, album_id as Album_ID, file_path as FilePath FROM songs WHERE title LIKE ?').bind(likeQuery)

    // Run searches concurrently in D1
    const [resArtists, resAlbums, resSongs] = await c.env.DB.batch([stmtArtists, stmtAlbums, stmtSongs])

    const baseUrl = new URL(c.req.url).origin
    const results = {
      artists: (resArtists.results || []).map((a: any) => ({
        ...a,
        photo_url: normalizeResourceUrl(a.photo_url, baseUrl, 'avatar'),
        albumCount: a.album_count || 0
      })),
      albums: (resAlbums.results || []).map((al: any) => ({
        ...al,
        CoverURL: normalizeResourceUrl(al.CoverURL, baseUrl, 'cover')
      })),
      songs: resSongs.results || []
    }

    return c.json({
      code: 200,
      message: `找到 ${results.artists.length + results.albums.length + results.songs.length} 条相关结果`,
      data: results
    })
  } catch (error: any) {
    return c.json({ code: 500, message: error.message }, 500)
  }
})

// ==========================================
// 6. Debug: List R2 Objects
// ==========================================
app.get('/api/debug/r2', async (c) => {
  try {
    let allMp3s: string[] = []
    let truncated = true
    let cursor: string | undefined = undefined
    let totalObjects = 0

    // Scan up to 5000 objects to get a better picture
    for (let i = 0; i < 5 && truncated; i++) {
        const list = await c.env.BUCKET.list({ limit: 1000, cursor })
        totalObjects += list.objects.length
        
        const mp3s = list.objects
          .filter(obj => obj.key.toLowerCase().endsWith('.mp3'))
          .map(obj => obj.key)
        
        allMp3s = allMp3s.concat(mp3s)
        truncated = list.truncated
        cursor = list.truncated ? list.cursor : undefined
    }

    // Get prefix statistics
    const prefixes = new Map<string, number>()
    allMp3s.forEach(key => {
        const parts = key.split('/')
        if (parts.length > 1) {
            const prefix = parts[0]
            prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1)
        } else {
            prefixes.set('(root)', (prefixes.get('(root)') || 0) + 1)
        }
    })

    return c.json({
      scanned_objects: totalObjects,
      total_mp3_found: allMp3s.length,
      is_truncated: truncated,
      prefixes: Object.fromEntries(prefixes),
      keys: allMp3s
    })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// ==========================================
// 7. Debug: List D1 Paths
// ==========================================
// ==========================================
// 8. Debug: Full Audit (D1 vs R2)
// ==========================================
app.get('/api/debug/audit', async (c) => {
  try {
    // 1. Get all MP3 keys from R2
    let allR2Keys = new Set<string>()
    let truncated = true
    let cursor: string | undefined = undefined
    
    for (let i = 0; i < 10 && truncated; i++) {
        const list = await c.env.BUCKET.list({ limit: 1000, cursor })
        list.objects.forEach(obj => {
          if (obj.key.toLowerCase().endsWith('.mp3')) {
            allR2Keys.add(obj.key)
          }
        })
        truncated = list.truncated
        cursor = list.truncated ? list.cursor : undefined
    }

    // 2. Get all file_paths from D1
    const { results: songs } = await c.env.DB.prepare('SELECT id, title, file_path FROM songs WHERE file_path IS NOT NULL AND file_path != ""').all()
    
    // 3. Compare
    const audit = (songs as any[]).map(song => {
      const path = song.file_path
      // We know R2 has "music/" prefix
      const expectedKey = path.startsWith('music/') ? path : `music/${path}`
      const exists = allR2Keys.has(expectedKey)
      
      return {
        id: song.id,
        title: song.title,
        db_path: path,
        expected_r2_key: expectedKey,
        found_in_r2: exists
      }
    })

    const summary = {
      total_db_songs_with_path: songs.length,
      total_r2_mp3s: allR2Keys.size,
      matched: audit.filter(a => a.found_in_r2).length,
      missing_in_r2: audit.filter(a => !a.found_in_r2).length,
      sample_matched: audit.filter(a => a.found_in_r2).slice(0, 10),
      sample_missing: audit.filter(a => !a.found_in_r2).slice(0, 20)
    }

    return c.json(summary)
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// ==========================================
// 9. Admin: Stats
// ==========================================
app.get('/api/admin/stats', async (c) => {
  try {
    const stmtArtists = c.env.DB.prepare('SELECT COUNT(*) as count FROM artists')
    const stmtAlbums = c.env.DB.prepare('SELECT COUNT(*) as count FROM albums')
    const stmtSongs = c.env.DB.prepare('SELECT COUNT(*) as count FROM songs')
    
    const [resArtists, resAlbums, resSongs] = await c.env.DB.batch([stmtArtists, stmtAlbums, stmtSongs])
    
    return c.json({
      code: 200,
      message: 'success',
      data: {
        artists: (resArtists.results?.[0] as any)?.count || 0,
        albums: (resAlbums.results?.[0] as any)?.count || 0,
        tracks: (resSongs.results?.[0] as any)?.count || 0
      }
    })
  } catch (error: any) {
    return c.json({ code: 500, message: error.message }, 500)
  }
})

// ==========================================
// 10. Admin: Self-healing Fix Paths
// ==========================================
app.post('/api/admin/fix-paths', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      UPDATE songs 
      SET file_path = 'music/' || file_path 
      WHERE file_path NOT LIKE 'music/%' 
      AND file_path IS NOT NULL 
      AND file_path != ''
    `).run()
    
    return c.json({
      code: 200,
      message: `成功对齐 ${result.meta.changes} 条音频路径前缀`,
      meta: result.meta
    })
  } catch (error: any) {
    return c.json({ code: 500, message: error.message }, 500)
  }
})

// ==========================================
// 11. Admin: Cleanup Duplicates
// ==========================================
app.post('/api/admin/cleanup-duplicates', async (c) => {
  try {
    // Identify duplicate albums (same artist_id and title)
    // We want to keep the one that has more songs with paths
    const query = `
      SELECT a.id, a.artist_id, a.title, COUNT(s.id) as song_count
      FROM albums a
      LEFT JOIN songs s ON a.id = s.album_id AND s.file_path IS NOT NULL AND s.file_path != ''
      GROUP BY a.id, a.artist_id, a.title
    `
    const { results } = await c.env.DB.prepare(query).all()
    
    const albumGroups = new Map<string, any[]>()
    for (const row of results as any[]) {
      const key = `${row.artist_id}|${row.title}`
      if (!albumGroups.has(key)) albumGroups.set(key, [])
      albumGroups.get(key)!.push(row)
    }
    
    let deletedAlbums = 0
    let deletedSongs = 0
    const stmts: D1PreparedStatement[] = []
    
    for (const [key, group] of albumGroups.entries()) {
      if (group.length > 1) {
        // Sort by song_count descending
        group.sort((a, b) => b.song_count - a.song_count)
        
        // Keep the first one (most lit-up), delete others
        const toKeep = group[0].id
        const toDeleteIds = group.slice(1).map(a => a.id)
        
        for (const id of toDeleteIds) {
          stmts.push(c.env.DB.prepare('DELETE FROM songs WHERE album_id = ?').bind(id))
          stmts.push(c.env.DB.prepare('DELETE FROM albums WHERE id = ?').bind(id))
          deletedAlbums++
        }
      }
    }
    
    if (stmts.length > 0) {
      await c.env.DB.batch(stmts)
    }
    
    return c.json({
      code: 200,
      message: `清理完成：回收了 ${deletedAlbums} 个冗余专辑占位符`,
      data: { deletedAlbums }
    })
  } catch (error: any) {
    return c.json({ code: 500, message: error.message }, 500)
  }
})

export default app
