import { Hono, type MiddlewareHandler } from 'hono'
import { neon } from '@neondatabase/serverless'
import type { Bindings } from './types'

type AppEnv = {
  Bindings: Bindings
  Variables: {
    user: any
    token: string
  }
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MAX_POST_LENGTH = 2000
const MAX_COMMENT_LENGTH = 1000

function getNeonClient(env: Bindings) {
  if (!env.NEON_DATABASE_URL) {
    throw new Error('NEON_DATABASE_URL is missing')
  }
  return neon(env.NEON_DATABASE_URL)
}

function parseIntSafe(value: string | undefined): number | null {
  if (!value) return null
  const num = Number(value)
  if (!Number.isInteger(num)) return null
  return num
}

function clampLimit(value: string | undefined) {
  const parsed = parseIntSafe(value)
  if (!parsed || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

function getCurrentUser(c: any) {
  const user = c.get('user')
  if (!user) return null
  return {
    uid: user.supabase_uid || String(user.id),
    name: user.username || 'unknown',
  }
}

export function registerCommunityRoutes(
  app: Hono<AppEnv>,
  authMiddleware: MiddlewareHandler<AppEnv>
) {
  app.get('/api/community/health', async (c) => {
    try {
      const sql = getNeonClient(c.env)
      await sql`select 1 as ok`
      return c.json({ code: 200, message: 'success', data: { neon: 'ok' } })
    } catch (error: any) {
      return c.json({ code: 500, message: `Neon unavailable: ${error.message}` }, 500)
    }
  })

  app.post('/api/community/posts', authMiddleware, async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        return c.json({ code: 401, message: '未登录' }, 401)
      }

      const body = await c.req.json()
      const content = String(body.content ?? '').trim()
      if (!content || content.length > MAX_POST_LENGTH) {
        return c.json({ code: 400, message: '帖子内容长度需在 1-2000 之间' }, 400)
      }

      const albumId = body.album_id === undefined || body.album_id === null
        ? null
        : Number(body.album_id)
      if (albumId !== null && !Number.isInteger(albumId)) {
        return c.json({ code: 400, message: 'album_id 必须是整数' }, 400)
      }

      const sql = getNeonClient(c.env)
      const rows = await sql`
        insert into posts (author_uid, author_name, album_id, content)
        values (${user.uid}, ${user.name}, ${albumId}, ${content})
        returning id, author_uid, author_name, album_id, content, status, created_at
      `

      return c.json({
        code: 200,
        message: '发帖成功',
        data: rows[0] ?? null,
      })
    } catch (error: any) {
      return c.json({ code: 500, message: error.message }, 500)
    }
  })

  app.get('/api/community/posts', async (c) => {
    try {
      const albumId = parseIntSafe(c.req.query('albumId'))
      const cursor = parseIntSafe(c.req.query('cursor'))
      const limit = clampLimit(c.req.query('limit'))
      if (c.req.query('albumId') && albumId === null) {
        return c.json({ code: 400, message: 'albumId 必须是整数' }, 400)
      }
      if (c.req.query('cursor') && cursor === null) {
        return c.json({ code: 400, message: 'cursor 必须是整数' }, 400)
      }

      const sql = getNeonClient(c.env)
      let rows: any[] = []

      if (albumId !== null && cursor !== null) {
        rows = await sql`
          select
            p.id, p.author_uid, p.author_name, p.album_id, p.content, p.status, p.created_at,
            (select count(*)::int from comments c where c.post_id = p.id and c.status = 'active') as comment_count
          from posts p
          where p.status = 'active'
            and p.album_id = ${albumId}
            and p.id < ${cursor}
          order by p.id desc
          limit ${limit}
        `
      } else if (albumId !== null) {
        rows = await sql`
          select
            p.id, p.author_uid, p.author_name, p.album_id, p.content, p.status, p.created_at,
            (select count(*)::int from comments c where c.post_id = p.id and c.status = 'active') as comment_count
          from posts p
          where p.status = 'active'
            and p.album_id = ${albumId}
          order by p.id desc
          limit ${limit}
        `
      } else if (cursor !== null) {
        rows = await sql`
          select
            p.id, p.author_uid, p.author_name, p.album_id, p.content, p.status, p.created_at,
            (select count(*)::int from comments c where c.post_id = p.id and c.status = 'active') as comment_count
          from posts p
          where p.status = 'active'
            and p.id < ${cursor}
          order by p.id desc
          limit ${limit}
        `
      } else {
        rows = await sql`
          select
            p.id, p.author_uid, p.author_name, p.album_id, p.content, p.status, p.created_at,
            (select count(*)::int from comments c where c.post_id = p.id and c.status = 'active') as comment_count
          from posts p
          where p.status = 'active'
          order by p.id desc
          limit ${limit}
        `
      }

      const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null
      return c.json({
        code: 200,
        message: 'success',
        data: {
          items: rows,
          next_cursor: nextCursor,
        },
      })
    } catch (error: any) {
      return c.json({ code: 500, message: error.message }, 500)
    }
  })

  app.post('/api/community/posts/:id/comments', authMiddleware, async (c) => {
    try {
      const user = getCurrentUser(c)
      if (!user) {
        return c.json({ code: 401, message: '未登录' }, 401)
      }

      const postId = Number(c.req.param('id'))
      if (!Number.isInteger(postId) || postId <= 0) {
        return c.json({ code: 400, message: '非法 post id' }, 400)
      }

      const body = await c.req.json()
      const content = String(body.content ?? '').trim()
      if (!content || content.length > MAX_COMMENT_LENGTH) {
        return c.json({ code: 400, message: '评论内容长度需在 1-1000 之间' }, 400)
      }

      const sql = getNeonClient(c.env)
      const postRows = await sql`
        select id from posts where id = ${postId} and status = 'active' limit 1
      `
      if (!postRows.length) {
        return c.json({ code: 404, message: '帖子不存在或已删除' }, 404)
      }

      const rows = await sql`
        insert into comments (post_id, author_uid, author_name, content)
        values (${postId}, ${user.uid}, ${user.name}, ${content})
        returning id, post_id, author_uid, author_name, content, status, created_at
      `

      return c.json({
        code: 200,
        message: '评论成功',
        data: rows[0] ?? null,
      })
    } catch (error: any) {
      return c.json({ code: 500, message: error.message }, 500)
    }
  })

  app.get('/api/community/posts/:id/comments', async (c) => {
    try {
      const postId = Number(c.req.param('id'))
      if (!Number.isInteger(postId) || postId <= 0) {
        return c.json({ code: 400, message: '非法 post id' }, 400)
      }

      const cursor = parseIntSafe(c.req.query('cursor'))
      const limit = clampLimit(c.req.query('limit'))
      if (c.req.query('cursor') && cursor === null) {
        return c.json({ code: 400, message: 'cursor 必须是整数' }, 400)
      }

      const sql = getNeonClient(c.env)
      let rows: any[] = []
      if (cursor !== null) {
        rows = await sql`
          select id, post_id, author_uid, author_name, content, status, created_at
          from comments
          where post_id = ${postId}
            and status = 'active'
            and id < ${cursor}
          order by id desc
          limit ${limit}
        `
      } else {
        rows = await sql`
          select id, post_id, author_uid, author_name, content, status, created_at
          from comments
          where post_id = ${postId}
            and status = 'active'
          order by id desc
          limit ${limit}
        `
      }

      const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null
      return c.json({
        code: 200,
        message: 'success',
        data: {
          items: rows,
          next_cursor: nextCursor,
        },
      })
    } catch (error: any) {
      return c.json({ code: 500, message: error.message }, 500)
    }
  })
}
