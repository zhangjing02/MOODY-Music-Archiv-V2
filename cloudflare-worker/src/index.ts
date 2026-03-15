import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database
  BUCKET: R2Bucket
}

const app = new Hono<{ Bindings: Bindings }>()

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
      prefix: 'settings/welcome-images/'
    })

    const images = list.objects
      .filter((obj) => obj.key.match(/\.(jpg|jpeg|png|webp|gif)$/i))
      .map((obj) => `/storage/${obj.key}`)

    // Shuffle and pick up to 10 images smoothly
    const shuffled = images.sort(() => 0.5 - Math.random())
    const selected = shuffled.slice(0, 10)

    if (selected.length === 0) {
      // Fallback if no images found
      selected.push('/assets/images/placeholder.jpg')
    }

    return c.json(selected)
  } catch (error: any) {
    console.error('Welcome images error:', error)
    return c.json({ error: 'Failed to fetch welcome images' }, 500)
  }
})

// ==========================================
// 3. Artists Skeleton List
// Equivalant to Go's /api/skeleton
// ==========================================
app.get('/api/skeleton', async (c) => {
  try {
    const groupFilter = c.req.query('group')
    let query = 'SELECT id, name, region, photo_url FROM artists ORDER BY name ASC'

    const { results } = await c.env.DB.prepare(query).all()

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
        avatar: row.photo_url || '/src/assets/images/avatars/default.png'
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

    for (const row of results as any[]) {
      if (!row.artist_id) continue

      if (!artistMap.has(row.artist_id)) {
        artistMap.set(row.artist_id, {
          id: `db_${row.artist_id}`,
          name: row.artist_name,
          category: row.region || '华语',
          avatar: row.photo_url || '/src/assets/images/avatars/default.png',
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
            cover: row.cover_url || '/src/assets/images/vinyl_default.png',
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

    const stmtArtists = c.env.DB.prepare('SELECT id, name, region FROM artists WHERE name LIKE ?').bind(likeQuery)
    const stmtAlbums = c.env.DB.prepare('SELECT id, title, artist_id as ArtistID, cover_url as CoverURL FROM albums WHERE title LIKE ?').bind(likeQuery)
    const stmtSongs = c.env.DB.prepare('SELECT id, title, artist_id as ArtistID, album_id as Album_ID, file_path as FilePath FROM songs WHERE title LIKE ?').bind(likeQuery)

    // Run searches concurrently in D1
    const [resArtists, resAlbums, resSongs] = await c.env.DB.batch([stmtArtists, stmtAlbums, stmtSongs])

    const results = {
      artists: resArtists.results || [],
      albums: resAlbums.results || [],
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
// Legacy / Test API checks
// ==========================================
app.get('/api/test/db', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT COUNT(*) as count FROM artists').all()
    return c.json({ success: true, count: results[0].count })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default app
