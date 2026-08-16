import { Hono } from 'hono'
import type {
  Bindings,
  HomeFeedData,
  HomeBlock,
  SaveHomeFeedRequest
} from './types'
import { fail, serverError } from './error'

type AppType = { Bindings: Bindings; Variables: { user: any; token: string } }

/**
 * 内置高质量默认首页切片流（确保在 D1/R2 未配置或初次启动时，任何情况下请求都不为空）
 */
export const DEFAULT_HOME_FEED: HomeFeedData = {
  version: '1.0.0',
  updatedAt: '2026-08-16T16:00:00.000Z',
  items: [
    {
      id: 'block_hero_banner_main',
      type: 'hero_banner',
      title: '今日焦点',
      subtitle: '精选专题与唱片故事',
      sortOrder: 1,
      visible: true,
      autoPlay: true,
      intervalMs: 5000,
      items: [
        {
          id: 'hero_1',
          title: '叶惠美 · 二十周年特别志',
          subtitle: '古典交响与嘻哈重塑千禧流行黄金时代',
          badge: '经典重温',
          coverUrl: '/storage/covers/jay_yehuimei.jpg',
          actionType: 'album',
          actionTarget: 'db_1',
          bgColor: '#1a1c23'
        },
        {
          id: 'hero_2',
          title: '李宗盛 · 感性与理性作品音乐会',
          subtitle: '年少不听李宗盛，听懂已是不惑年',
          badge: '岁月留声',
          coverUrl: '/storage/covers/jonathan_rational.jpg',
          actionType: 'artist',
          actionTarget: 'db_2',
          bgColor: '#2d1e18'
        },
        {
          id: 'hero_3',
          title: '黑胶唱片架里的时光印记',
          subtitle: '收录 80-00 年代华语流行黄金唱片',
          badge: '专题企划',
          coverUrl: '/storage/covers/vinyl_collection.jpg',
          actionType: 'playlist',
          actionTarget: 'classic_vinyl',
          bgColor: '#18232c'
        }
      ]
    },
    {
      id: 'block_category_tabs_main',
      type: 'category_tabs',
      title: '分类导航',
      sortOrder: 2,
      visible: true,
      items: [
        { id: 'tab_all', label: '全部精选', icon: 'sparkles', categoryKey: 'all' },
        { id: 'tab_mandopop', label: '华语流行', icon: 'music_note', categoryKey: 'mandopop' },
        { id: 'tab_nostalgia', label: '千禧记忆', icon: 'history', categoryKey: 'nostalgia' },
        { id: 'tab_folk', label: '城市民谣', icon: 'acoustic', categoryKey: 'folk' },
        { id: 'tab_rock', label: '摇滚现场', icon: 'electric_bolt', categoryKey: 'rock' },
        { id: 'tab_soundtrack', label: '时代原声', icon: 'movie', categoryKey: 'soundtrack' },
        { id: 'tab_instrumental', label: '纯音器乐', icon: 'piano', categoryKey: 'instrumental' }
      ]
    },
    {
      id: 'block_sec_artists_title',
      type: 'section_title',
      title: '时光音乐人',
      subtitle: '跨越岁月的经典歌者与时代声音',
      actionText: '查看全部',
      actionType: 'navigate',
      actionTarget: '/artists',
      sortOrder: 3,
      visible: true
    },
    {
      id: 'block_artist_grid_main',
      type: 'artist_grid',
      title: '推荐歌手',
      sortOrder: 4,
      visible: true,
      layout: 'grid',
      items: [
        {
          id: 'db_1',
          name: '周杰伦',
          avatarUrl: '/src/assets/images/jay/avatar.jpg',
          countText: '14 张专辑 · 140+ 首曲目',
          tag: '华语天王',
          category: '华语'
        },
        {
          id: 'db_2',
          name: '李宗盛',
          avatarUrl: '/src/assets/images/avatars/jonathan.jpg',
          countText: '传奇制作人 · 历年精选',
          tag: '华语教父',
          category: '华语'
        },
        {
          id: 'db_3',
          name: '张学友',
          avatarUrl: '/src/assets/images/avatars/jacky.jpg',
          countText: '歌神经典 · 世纪典藏',
          tag: '歌神',
          category: '华语'
        },
        {
          id: 'db_4',
          name: '王菲',
          avatarUrl: '/src/assets/images/avatars/faye.jpg',
          countText: '天籁空灵 · 时代传奇',
          tag: '传奇歌后',
          category: '华语'
        }
      ]
    },
    {
      id: 'block_essay_card_fantasy',
      type: 'essay_card',
      title: '唱片故事 · 《范特西》的黄金幻想',
      subtitle: '从《爱在西元前》到《安静》，一场划时代的音乐冒险',
      author: 'MOODY 选乐志',
      publishDate: '2001-09-20',
      excerpt: '2001年的秋天，《范特西》横空出世，以无与伦比的天马行空重塑了华语流行音乐的黄金轮廓。巴比伦泥板上的誓言，美索不达米亚平原的风，都被谱写进属于千禧年代的青春旋律里...',
      coverUrl: '/storage/covers/fantasy.jpg',
      albumId: 'db_1',
      artistName: '周杰伦',
      tag: '深度品鉴',
      actionUrl: '/album/db_1',
      sortOrder: 5,
      visible: true
    },
    {
      id: 'block_sec_tracks_title',
      type: 'section_title',
      title: '今日私享单曲',
      subtitle: '岁月留声，一键开启静心聆听',
      actionText: '全部曲库',
      actionType: 'navigate',
      actionTarget: '/songs',
      sortOrder: 6,
      visible: true
    },
    {
      id: 'block_track_list_main',
      type: 'track_list',
      title: '精选单曲推荐',
      sortOrder: 7,
      visible: true,
      items: [
        {
          id: 1,
          title: '晴天',
          artistName: '周杰伦',
          albumTitle: '叶惠美',
          coverUrl: '/storage/covers/jay_yehuimei.jpg',
          filePath: 'music/周杰伦/叶惠美/晴天.mp3',
          duration: 269,
          badge: '精选'
        },
        {
          id: 2,
          title: '山丘',
          artistName: '李宗盛',
          albumTitle: '山丘',
          coverUrl: '/storage/covers/shantiq.jpg',
          filePath: 'music/李宗盛/山丘/山丘.mp3',
          duration: 405,
          badge: '经典'
        },
        {
          id: 3,
          title: '遥远的她',
          artistName: '张学友',
          albumTitle: '遥远的她AMOUR',
          coverUrl: '/storage/covers/yaoyuan.jpg',
          filePath: 'music/张学友/遥远的她/遥远的她.mp3',
          duration: 257,
          badge: '留声'
        },
        {
          id: 4,
          title: '红豆',
          artistName: '王菲',
          albumTitle: '唱游',
          coverUrl: '/storage/covers/changyou.jpg',
          filePath: 'music/王菲/唱游/红豆.mp3',
          duration: 258,
          badge: '回忆'
        }
      ]
    },
    {
      id: 'block_album_row_main',
      type: 'album_row',
      title: '经典唱片回顾',
      subtitle: '不可错过的传世黑胶',
      sortOrder: 8,
      visible: true,
      items: [
        {
          id: 'db_1',
          title: '叶惠美',
          artistName: '周杰伦',
          coverUrl: '/storage/covers/jay_yehuimei.jpg',
          releaseDate: '2003-07-31',
          songCount: 11,
          tag: '传世金曲'
        },
        {
          id: 'db_2',
          title: '范特西',
          artistName: '周杰伦',
          coverUrl: '/storage/covers/fantasy.jpg',
          releaseDate: '2001-09-20',
          songCount: 10,
          tag: '时代风暴'
        },
        {
          id: 'db_3',
          title: '感性与理性作品音乐会',
          artistName: '李宗盛',
          coverUrl: '/storage/covers/jonathan_rational.jpg',
          releaseDate: '2007-03-09',
          songCount: 28,
          tag: '现场经典'
        }
      ]
    }
  ]
}

/**
 * 资源 URL 归一化函数
 */
function normalizeResourceUrl(path: string | null | undefined, baseUrl: string, type: 'avatar' | 'cover' | 'mp3' | 'lrc'): string {
  if (!path) {
    if (type === 'avatar') return '/src/assets/images/avatars/default.png'
    if (type === 'cover') return '/src/assets/images/vinyl_default.png'
    return ''
  }

  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (path.startsWith('/src/')) return path

  let finalPath = path
  if (!path.startsWith('/storage/')) {
    finalPath = `/storage/${path.startsWith('/') ? path.slice(1) : path}`
  }

  return baseUrl + finalPath
}

/**
 * 归一化首页切片流中的所有资源链接为完整可用 URL
 */
export function normalizeHomeFeedUrls(feedData: HomeFeedData, baseUrl: string): HomeFeedData {
  const normalizedItems = (feedData.items || []).map((rawBlock) => {
    const block = { ...rawBlock } as HomeBlock

    switch (block.type) {
      case 'hero_banner':
        if (Array.isArray(block.items)) {
          block.items = block.items.map((item) => ({
            ...item,
            coverUrl: normalizeResourceUrl(item.coverUrl, baseUrl, 'cover')
          }))
        }
        break

      case 'artist_grid':
        if (Array.isArray(block.items)) {
          block.items = block.items.map((item) => ({
            ...item,
            avatarUrl: normalizeResourceUrl(item.avatarUrl, baseUrl, 'avatar')
          }))
        }
        break

      case 'essay_card':
        if (block.coverUrl) {
          block.coverUrl = normalizeResourceUrl(block.coverUrl, baseUrl, 'cover')
        }
        break

      case 'track_list':
        if (Array.isArray(block.items)) {
          block.items = block.items.map((item) => ({
            ...item,
            coverUrl: normalizeResourceUrl(item.coverUrl, baseUrl, 'cover'),
            audioUrl: item.filePath ? normalizeResourceUrl(item.filePath, baseUrl, 'mp3') : undefined
          }))
        }
        break

      case 'album_row':
        if (Array.isArray(block.items)) {
          block.items = block.items.map((item) => ({
            ...item,
            coverUrl: normalizeResourceUrl(item.coverUrl, baseUrl, 'cover')
          }))
        }
        break

      default:
        // Generic block fallback
        if ('coverUrl' in block && typeof block.coverUrl === 'string') {
          block.coverUrl = normalizeResourceUrl(block.coverUrl, baseUrl, 'cover')
        }
        if ('avatarUrl' in block && typeof block.avatarUrl === 'string') {
          block.avatarUrl = normalizeResourceUrl(block.avatarUrl, baseUrl, 'avatar')
        }
        break
    }

    return block
  })

  return {
    version: feedData.version || '1.0.0',
    updatedAt: feedData.updatedAt || new Date().toISOString(),
    items: normalizedItems
  }
}

/**
 * 确保 D1 app_settings 表存在
 */
async function ensureAppSettingsTable(db: D1Database): Promise<void> {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run()
  } catch (e) {
    console.warn('ensureAppSettingsTable notice:', e)
  }
}

/**
 * 校验前端提交的切片数组格式
 */
function validateFeedItems(rawItems: any[]): { valid: boolean; error?: string; items?: HomeBlock[] } {
  if (!Array.isArray(rawItems)) {
    return { valid: false, error: 'items 必须是一个数组' }
  }

  const items: HomeBlock[] = []
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i]
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `第 ${i + 1} 个切片必须为有效对象` }
    }

    if (!item.id || typeof item.id !== 'string' || !item.id.trim()) {
      return { valid: false, error: `第 ${i + 1} 个切片缺少有效的 id 字段` }
    }

    if (!item.type || typeof item.type !== 'string' || !item.type.trim()) {
      return { valid: false, error: `第 ${i + 1} 个切片缺少有效的 type 字段` }
    }

    // 格式化与填充默认值
    const sanitized: HomeBlock = {
      ...item,
      id: String(item.id).trim(),
      type: String(item.type).trim(),
      sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : i + 1,
      visible: typeof item.visible === 'boolean' ? item.visible : true
    }

    items.push(sanitized)
  }

  return { valid: true, items }
}

/**
 * 注册首页切片流路由
 */
export function registerHomeFeedRoutes(app: Hono<AppType>) {

  // ==========================================
  // 1. GET /api/home/feed (公开接口：拉取首页切片流)
  // ==========================================
  app.get('/api/home/feed', async (c) => {
    try {
      const baseUrl = new URL(c.req.url).origin
      let loadedFeed: HomeFeedData | null = null

      // 1. 尝试从 D1 app_settings 表读取
      try {
        await ensureAppSettingsTable(c.env.DB)
        const row = await c.env.DB.prepare(
          'SELECT value, updated_at FROM app_settings WHERE key = ?'
        ).bind('home_feed').first<{ value: string; updated_at?: string }>()

        if (row && row.value) {
          const parsed = JSON.parse(row.value) as HomeFeedData
          if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
            loadedFeed = {
              version: parsed.version || '1.0.0',
              updatedAt: parsed.updatedAt || row.updated_at || new Date().toISOString(),
              items: parsed.items
            }
          }
        }
      } catch (d1Err) {
        console.warn('D1 fetch home_feed warning:', d1Err)
      }

      // 2. 若 D1 未读取到，尝试从 R2 备份 (config/home_feed.json) 读取
      if (!loadedFeed && c.env.BUCKET) {
        try {
          const r2Obj = await c.env.BUCKET.get('config/home_feed.json')
          if (r2Obj) {
            const text = await r2Obj.text()
            const parsed = JSON.parse(text) as HomeFeedData
            if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
              loadedFeed = {
                version: parsed.version || '1.0.0',
                updatedAt: parsed.updatedAt || new Date().toISOString(),
                items: parsed.items
              }
            }
          }
        } catch (r2Err) {
          console.warn('R2 fetch home_feed warning:', r2Err)
        }
      }

      // 3. 若均未配置，则回退到内置的高质量默认切片数据
      if (!loadedFeed) {
        loadedFeed = DEFAULT_HOME_FEED
      }

      // 4. 资源 URL 归一化并下发
      const data = normalizeHomeFeedUrls(loadedFeed, baseUrl)

      return c.json({
        code: 200,
        message: 'success',
        data
      })
    } catch (error: any) {
      console.error('Get home feed error:', error)
      return serverError(c, error)
    }
  })

  // ==========================================
  // 2. POST /api/admin/home/feed (管理员/控制台保存首页切片流)
  //    支持 PUT /api/admin/home/feed 同等处理
  // ==========================================
  const handleSaveHomeFeed = async (c: any) => {
    try {
      const body = await c.req.json().catch(() => null)
      if (!body || typeof body !== 'object') {
        return fail(c, 'INVALID_REQUEST_BODY')
      }

      const rawItems = Array.isArray(body) ? body : body.items
      const validation = validateFeedItems(rawItems)
      if (!validation.valid || !validation.items) {
        return fail(c, 'INVALID_PARAMETER', { message: validation.error || '切片数据不合法' })
      }

      const now = new Date().toISOString()
      const version = typeof body.version === 'string' && body.version.trim()
        ? body.version.trim()
        : `v${Date.now()}`

      const feedData: HomeFeedData = {
        version,
        updatedAt: now,
        items: validation.items
      }

      const jsonStr = JSON.stringify(feedData)

      // 1. 保存到 D1 数据库
      await ensureAppSettingsTable(c.env.DB)
      await c.env.DB.prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('home_feed', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).bind(jsonStr, now).run()

      // 2. 同步备份到 R2 存储桶 (config/home_feed.json)
      if (c.env.BUCKET) {
        try {
          await c.env.BUCKET.put('config/home_feed.json', jsonStr, {
            httpMetadata: {
              contentType: 'application/json; charset=utf-8'
            }
          })
        } catch (r2Err) {
          console.warn('R2 backup home_feed warning:', r2Err)
        }
      }

      return c.json({
        code: 200,
        message: 'success',
        data: {
          version: feedData.version,
          updatedAt: feedData.updatedAt,
          count: feedData.items.length
        }
      })
    } catch (error: any) {
      console.error('Save home feed error:', error)
      return serverError(c, error)
    }
  }

  app.post('/api/admin/home/feed', handleSaveHomeFeed)
  app.put('/api/admin/home/feed', handleSaveHomeFeed)

  // ==========================================
  // 3. POST /api/admin/home/feed/reset (重置首页切片流为内置默认)
  //    支持 DELETE /api/admin/home/feed
  // ==========================================
  const handleResetHomeFeed = async (c: any) => {
    try {
      // 1. 从 D1 清理
      await ensureAppSettingsTable(c.env.DB)
      await c.env.DB.prepare('DELETE FROM app_settings WHERE key = ?').bind('home_feed').run()

      // 2. 从 R2 清理
      if (c.env.BUCKET) {
        try {
          await c.env.BUCKET.delete('config/home_feed.json')
        } catch (r2Err) {
          console.warn('R2 delete home_feed warning:', r2Err)
        }
      }

      const baseUrl = new URL(c.req.url).origin
      return c.json({
        code: 200,
        message: '已成功重置首页切片为默认配置',
        data: normalizeHomeFeedUrls(DEFAULT_HOME_FEED, baseUrl)
      })
    } catch (error: any) {
      console.error('Reset home feed error:', error)
      return serverError(c, error)
    }
  }

  app.post('/api/admin/home/feed/reset', handleResetHomeFeed)
  app.delete('/api/admin/home/feed', handleResetHomeFeed)
}
