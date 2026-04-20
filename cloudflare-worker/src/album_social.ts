import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import type { Bindings } from './types'
import { fail, serverError } from './error'

type AppType = { Bindings: Bindings; Variables: { user: any; token: string } }

/**
 * 专辑社交功能 (基于 Supabase 存储)
 */
export function registerAlbumSocialRoutes(app: Hono<AppType>, authMiddleware: any) {
  
  const getSupabase = (env: Bindings) => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)

  // 1. 获取专辑评论列表
  app.get('/api/v1/albums/:id/comments', async (c) => {
    try {
      const albumId = c.req.param('id')
      const supabase = getSupabase(c.env)

      const { data, error } = await supabase
        .from('album_comments')
        .select(`
          id,
          content,
          created_at,
          user_profiles:user_id (id, username, avatar_url)
        `)
        .eq('album_id', albumId)
        .order('created_at', { ascending: false })

      if (error) throw error

      return c.json({
        code: 200,
        message: 'success',
        data: data
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // 2. 发表评论 (需认证)
  app.post('/api/v1/albums/:id/comments', authMiddleware, async (c) => {
    try {
      const albumId = c.req.param('id')
      const user = c.get('user')
      const { content } = await c.req.json() as { content: string }

      if (!content || content.trim().length === 0) {
        return fail(c, 'MISSING_PARAMETER', { message: '评论内容不能为空' })
      }

      const supabase = getSupabase(c.env)

      // 写入 Supabase
      const { data, error } = await supabase
        .from('album_comments')
        .insert([
          { 
            album_id: albumId, 
            user_id: user.supabase_uid, // 使用 Supabase UID 关联
            content: content.trim() 
          }
        ])
        .select()

      if (error) throw error

      // 触发 JPush 实时刷新信号 (可选)
      if (c.env.JPUSH_APP_KEY && c.env.JPUSH_MASTER_SECRET) {
        c.executionCtx.waitUntil(
          fetch('https://api.jpush.cn/v3/push', {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(`${c.env.JPUSH_APP_KEY}:${c.env.JPUSH_MASTER_SECRET}`)}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              platform: 'all',
              audience: { tag: [`album_${albumId}`] },
              message: {
                msg_content: 'refresh_comments',
                extras: { album_id: albumId, action: 'FETCH_NEW' }
              },
              options: { time_to_live: 60 }
            })
          }).catch(err => console.error('JPush error:', err))
        )
      }

      return c.json({
        code: 200,
        message: '评论成功',
        data: data?.[0]
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // 3. 删除自己的评论 (需认证)
  app.delete('/api/v1/comments/:id', authMiddleware, async (c) => {
    try {
      const commentId = c.req.param('id')
      const user = c.get('user')
      const supabase = getSupabase(c.env)

      const { error } = await supabase
        .from('album_comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', user.supabase_uid) // 权限校验：只能删除自己的

      if (error) throw error

      return c.json({
        code: 200,
        message: '删除成功'
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })
}
