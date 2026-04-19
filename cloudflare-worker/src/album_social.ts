import { Hono, type MiddlewareHandler } from 'hono'
import { createClient } from '@supabase/supabase-js'
import type { Bindings } from './types'

type AppEnv = {
  Bindings: Bindings
  Variables: {
    user: any
    token: string
  }
}

// ─────────────────────────────────────────────
// Supabase client (service role, bypasses RLS)
// ─────────────────────────────────────────────
function getSupabase(env: Bindings) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
}

// ─────────────────────────────────────────────
// JPush 透传推送（设计文档 §4.1）
// 触发所有正在浏览该专辑+班级的用户静默刷新
//
// Tag 命名规则：album_{albumId}_class_{classId}
// 安卓端进入专辑详情页时绑定此 tag，离开时解绑
// ─────────────────────────────────────────────
async function sendAlbumPush(
  env: Bindings,
  albumId: string,
  classId: string
): Promise<void> {
  const { JPUSH_APP_KEY, JPUSH_MASTER_SECRET } = env
  if (!JPUSH_APP_KEY || !JPUSH_MASTER_SECRET) {
    console.warn('[album_social] JPush credentials missing, skip push')
    return
  }

  const auth = btoa(`${JPUSH_APP_KEY}:${JPUSH_MASTER_SECRET}`)
  const tag = `album_${albumId}_class_${classId}`

  // 透传消息结构 — 对齐设计文档 §4.1
  const payload = {
    platform: 'android',
    audience: {
      tag: [tag]
    },
    message: {
      msg_content: '有新评论到达',
      content_type: 'text',
      title: 'refresh_comments',
      extras: {
        album_id: albumId,
        action: 'FETCH_NEW'
      }
    }
  }

  try {
    const res = await fetch('https://api.jpush.cn/v3/push', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const err = await res.text()
      console.error(`[album_social] JPush error ${res.status}:`, err)
    } else {
      console.log(`[album_social] Push sent to tag: ${tag}`)
    }
  } catch (err) {
    console.error('[album_social] Push fetch threw:', err)
  }
}

// ─────────────────────────────────────────────
// 从 student_roster 取当前用户所在班级 (year_code)
// ─────────────────────────────────────────────
async function getClassId(
  db: D1Database,
  profileId: number
): Promise<string | null> {
  const row = await db
    .prepare('SELECT year_code FROM student_roster WHERE profile_id = ? LIMIT 1')
    .bind(profileId)
    .first<{ year_code: string }>()
  return row?.year_code ?? null
}

// ─────────────────────────────────────────────
// 批量获取 D1 中的用户信息（username + avatar_url）
// ─────────────────────────────────────────────
async function fetchUserMap(
  db: D1Database,
  supabaseUids: string[]
): Promise<Record<string, { username: string; avatar_url: string | null }>> {
  if (supabaseUids.length === 0) return {}
  const placeholders = supabaseUids.map(() => '?').join(',')
  const { results } = await db
    .prepare(
      `SELECT supabase_uid, username, avatar_url
       FROM user_profiles
       WHERE supabase_uid IN (${placeholders})`
    )
    .bind(...supabaseUids)
    .all<{ supabase_uid: string; username: string; avatar_url: string | null }>()

  const map: Record<string, { username: string; avatar_url: string | null }> = {}
  for (const u of results) {
    map[u.supabase_uid] = { username: u.username, avatar_url: u.avatar_url }
  }
  return map
}

// ─────────────────────────────────────────────
// 路由注册
// ─────────────────────────────────────────────
export function registerAlbumSocialRoutes(
  app: Hono<AppEnv>,
  authMiddleware: MiddlewareHandler<AppEnv>
) {

  // ══════════════════════════════════════════
  // GET /api/albums/:id/social_content
  // 获取该专辑下、当前用户班级的社交内容
  // （主贴 + 全部回复，树形，一次性返回）
  // ══════════════════════════════════════════
  app.get('/api/albums/:id/social_content', authMiddleware, async (c) => {
    try {
      const albumId = c.req.param('id')
      const user = c.get('user') as any

      const classId = await getClassId(c.env.DB, user.id)
      if (!classId) {
        return c.json({ code: 403, message: '无法获取您的班级信息，请联系管理员' }, 403)
      }

      const supabase = getSupabase(c.env)

      // 查该专辑+班级的根帖（唯一约束保证最多 1 条）
      const { data: rootPosts, error: rootErr } = await supabase
        .from('album_comments')
        .select('id, album_id, user_id, class_id, content, parent_id, root_id, created_at')
        .eq('album_id', albumId)
        .eq('class_id', classId)
        .is('parent_id', null)
        .limit(1)

      if (rootErr) throw rootErr

      if (!rootPosts || rootPosts.length === 0) {
        return c.json({ code: 200, message: 'success', data: null })
      }

      const rootPost = rootPosts[0]

      // 查该根帖的全部回复
      const { data: replies, error: repliesErr } = await supabase
        .from('album_comments')
        .select('id, album_id, user_id, class_id, content, parent_id, root_id, created_at')
        .eq('root_id', rootPost.id)
        .order('created_at', { ascending: true })

      if (repliesErr) throw repliesErr

      // 聚合用户信息（批量查 D1，避免 N+1）
      const allUids = [rootPost.user_id, ...(replies ?? []).map((r: any) => r.user_id)]
      const userMap = await fetchUserMap(c.env.DB, [...new Set<string>(allUids)])

      const result = {
        ...rootPost,
        author: userMap[rootPost.user_id] ?? { username: 'Unknown', avatar_url: null },
        replies: (replies ?? []).map((r: any) => ({
          ...r,
          author: userMap[r.user_id] ?? { username: 'Unknown', avatar_url: null }
        }))
      }

      return c.json({ code: 200, message: 'success', data: result })

    } catch (err: any) {
      console.error('[album_social] GET social_content error:', err)
      return c.json({ code: 500, message: err.message }, 500)
    }
  })

  // ══════════════════════════════════════════
  // POST /api/albums/:id/posts
  // 发表主贴（每个专辑每班级唯一一条）
  // ══════════════════════════════════════════
  app.post('/api/albums/:id/posts', authMiddleware, async (c) => {
    try {
      const albumId = c.req.param('id')
      const user = c.get('user') as any
      const body = await c.req.json()
      const content = typeof body.content === 'string' ? body.content.trim() : ''

      if (!content) {
        return c.json({ code: 400, message: '内容不能为空' }, 400)
      }
      if (content.length > 2000) {
        return c.json({ code: 400, message: '内容不能超过 2000 字' }, 400)
      }

      const classId = await getClassId(c.env.DB, user.id)
      if (!classId) {
        return c.json({ code: 403, message: '无法获取您的班级信息，请联系管理员' }, 403)
      }

      const supabase = getSupabase(c.env)

      const { data, error } = await supabase
        .from('album_comments')
        .insert({
          album_id: albumId,
          user_id: user.supabase_uid,
          class_id: classId,
          content,
          parent_id: null,
          root_id: null
        })
        .select()
        .single()

      if (error) {
        // Postgres unique_violation
        if (error.code === '23505') {
          return c.json({ code: 409, message: '本班级在该专辑下已存在主贴，请直接参与讨论' }, 409)
        }
        throw error
      }

      // 触发透传推送（后台执行，不阻塞响应）
      c.executionCtx.waitUntil(sendAlbumPush(c.env, albumId, classId))

      return c.json({ code: 200, message: '发帖成功', data })

    } catch (err: any) {
      console.error('[album_social] POST post error:', err)
      return c.json({ code: 500, message: err.message }, 500)
    }
  })

  // ══════════════════════════════════════════
  // POST /api/albums/posts/:post_id/comments
  // 发表回复（回复某条主贴）
  // ══════════════════════════════════════════
  app.post('/api/albums/posts/:post_id/comments', authMiddleware, async (c) => {
    try {
      const postId = c.req.param('post_id')
      const user = c.get('user') as any
      const body = await c.req.json()
      const content = typeof body.content === 'string' ? body.content.trim() : ''

      if (!content) {
        return c.json({ code: 400, message: '内容不能为空' }, 400)
      }
      if (content.length > 1000) {
        return c.json({ code: 400, message: '回复内容不能超过 1000 字' }, 400)
      }

      const classId = await getClassId(c.env.DB, user.id)
      if (!classId) {
        return c.json({ code: 403, message: '无法获取您的班级信息，请联系管理员' }, 403)
      }

      const supabase = getSupabase(c.env)

      // 校验主贴存在且属于同班级
      const { data: rootPost, error: rootErr } = await supabase
        .from('album_comments')
        .select('id, album_id, class_id')
        .eq('id', postId)
        .is('parent_id', null)    // 确保是根帖，防止回复回复
        .single()

      if (rootErr || !rootPost) {
        return c.json({ code: 404, message: '主贴不存在' }, 404)
      }

      if (rootPost.class_id !== classId) {
        return c.json({ code: 403, message: '您不属于该帖子所在班级' }, 403)
      }

      const { data, error } = await supabase
        .from('album_comments')
        .insert({
          album_id: rootPost.album_id,
          user_id: user.supabase_uid,
          class_id: classId,
          content,
          parent_id: postId,
          root_id: postId
        })
        .select()
        .single()

      if (error) throw error

      // 触发透传推送
      c.executionCtx.waitUntil(
        sendAlbumPush(c.env, rootPost.album_id, classId)
      )

      return c.json({ code: 200, message: '评论成功', data })

    } catch (err: any) {
      console.error('[album_social] POST comment error:', err)
      return c.json({ code: 500, message: err.message }, 500)
    }
  })
}
