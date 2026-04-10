import { Hono, Context } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import type { Bindings } from './types'

type Variables = {
  user: any
  token: string
}

type AppType = { Bindings: Bindings; Variables: Variables }

// ==========================================
// Supabase & JWT Helpers
// ==========================================

function getSupabase(env: Bindings) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
}

function getJWKS(env: Bindings) {
  return createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
}

// ==========================================
// Auth Middleware
// ==========================================

export const authMiddleware = async (c: Context<AppType>, next: any) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ code: 401, message: '未登录，请先登录' }, 401)
  }

  const token = authHeader.slice(7)
  try {
    const JWKS = getJWKS(c.env)
    const { payload } = await jwtVerify(token, JWKS)

    const supabaseUid = payload.sub
    if (!supabaseUid) {
      return c.json({ code: 401, message: 'Token 无效' }, 401)
    }

    // 查 D1 user_profiles
    const profile = await c.env.DB.prepare(
      'SELECT id, supabase_uid, username, email, level, role, avatar_url, created_at FROM user_profiles WHERE supabase_uid = ?'
    ).bind(supabaseUid).first()

    if (!profile) {
      return c.json({ code: 401, message: '用户不存在' }, 401)
    }

    c.set('user', profile)
    c.set('token', token)
    await next()
  } catch (err: any) {
    console.error('JWT verify error:', err.message)
    return c.json({ code: 401, message: 'Token 已过期或无效，请重新登录' }, 401)
  }
}

// ==========================================
// Require Admin Middleware
// ==========================================

export const requireAdmin = async (c: Context<AppType>, next: any) => {
  const user = c.get('user')
  if (!user || user.role !== 'admin') {
    return c.json({ code: 403, message: '需要管理员权限' }, 403)
  }
  await next()
}

// ==========================================
// Auth Routes
// ==========================================

export function registerAuthRoutes(app: Hono<AppType>) {

  // POST /api/user/register — 注册
  app.post('/api/user/register', async (c) => {
    try {
      const { username, password } = await c.req.json() as { username?: string; password?: string }

      // 验证输入
      if (!username || !password) {
        return c.json({ code: 400, message: '用户名和密码不能为空' }, 400)
      }
      if (username.length < 3 || username.length > 20) {
        return c.json({ code: 400, message: '用户名长度需在 3-20 个字符之间' }, 400)
      }
      if (!/^[a-zA-Z0-9_\u4e00-\u9fff]+$/.test(username)) {
        return c.json({ code: 400, message: '用户名只能包含字母、数字、下划线和中文' }, 400)
      }
      if (password.length < 6) {
        return c.json({ code: 400, message: '密码长度至少 6 个字符' }, 400)
      }

      const supabase = getSupabase(c.env)
      const fakeEmail = `${username}@moody.app`

      // 调用 Supabase 注册
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: fakeEmail,
        password,
      })

      if (signUpError) {
        console.error('Supabase signUp error:', signUpError.message)
        if (signUpError.message.includes('already registered') || signUpError.message.includes('already been registered')) {
          return c.json({ code: 409, message: '用户名已被注册' }, 409)
        }
        return c.json({ code: 500, message: `注册失败: ${signUpError.message}` }, 500)
      }

      const supabaseUid = signUpData.user?.id
      if (!supabaseUid) {
        return c.json({ code: 500, message: '注册失败：未获取到用户 ID' }, 500)
      }

      // 写入 D1 user_profiles
      await c.env.DB.prepare(
        'INSERT INTO user_profiles (supabase_uid, username, email, level, role) VALUES (?, ?, ?, 1, ?)'
      ).bind(supabaseUid, username, fakeEmail, 'user').run()

      // 获取插入后的完整 profile
      const profile = await c.env.DB.prepare(
        'SELECT id, supabase_uid, username, email, level, role, avatar_url, created_at FROM user_profiles WHERE supabase_uid = ?'
      ).bind(supabaseUid).first()

      return c.json({
        code: 200,
        message: '注册成功',
        user: profile,
        token: signUpData.session?.access_token,
        refresh_token: signUpData.session?.refresh_token,
      })
    } catch (error: any) {
      console.error('Register error:', error)
      return c.json({ code: 500, message: error.message }, 500)
    }
  })

  // POST /api/user/login — 登录
  app.post('/api/user/login', async (c) => {
    try {
      const { username, password } = await c.req.json() as { username?: string; password?: string }

      if (!username || !password) {
        return c.json({ code: 400, message: '用户名和密码不能为空' }, 400)
      }

      const supabase = getSupabase(c.env)
      const fakeEmail = `${username}@moody.app`

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: fakeEmail,
        password,
      })

      if (signInError) {
        console.error('Supabase signIn error:', signInError.message)
        return c.json({ code: 401, message: '用户名或密码错误' }, 401)
      }

      const supabaseUid = signInData.user?.id
      const accessToken = signInData.session?.access_token
      const refreshToken = signInData.session?.refresh_token

      if (!supabaseUid || !accessToken) {
        return c.json({ code: 500, message: '登录失败：未获取到会话信息' }, 500)
      }

      // 查 D1，若无记录则自动创建
      let profile = await c.env.DB.prepare(
        'SELECT id, supabase_uid, username, email, level, role, avatar_url, created_at FROM user_profiles WHERE supabase_uid = ?'
      ).bind(supabaseUid).first()

      if (!profile) {
        // 自动补建（防止 D1 和 Supabase 不同步）
        await c.env.DB.prepare(
          'INSERT INTO user_profiles (supabase_uid, username, email, level, role) VALUES (?, ?, ?, 1, ?)'
        ).bind(supabaseUid, username, fakeEmail, 'user').run()

        profile = await c.env.DB.prepare(
          'SELECT id, supabase_uid, username, email, level, role, avatar_url, created_at FROM user_profiles WHERE supabase_uid = ?'
        ).bind(supabaseUid).first()
      }

      return c.json({
        code: 200,
        message: '登录成功',
        user: profile,
        token: accessToken,
        refresh_token: refreshToken,
      })
    } catch (error: any) {
      console.error('Login error:', error)
      return c.json({ code: 500, message: error.message }, 500)
    }
  })

  // POST /api/user/refresh — 刷新 Token
  app.post('/api/user/refresh', async (c) => {
    try {
      const { refresh_token } = await c.req.json() as { refresh_token?: string }

      if (!refresh_token) {
        return c.json({ code: 400, message: '缺少 refresh_token' }, 400)
      }

      const supabase = getSupabase(c.env)
      const { data, error } = await supabase.auth.refreshSession({ refresh_token })

      if (error) {
        return c.json({ code: 401, message: '刷新失败，请重新登录' }, 401)
      }

      return c.json({
        code: 200,
        message: '刷新成功',
        token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
      })
    } catch (error: any) {
      return c.json({ code: 500, message: error.message }, 500)
    }
  })

  // GET /api/user/me — 当前用户信息（需 auth）
  app.get('/api/user/me', authMiddleware, async (c) => {
    const user = c.get('user')
    return c.json({
      code: 200,
      message: 'success',
      user,
    })
  })

  // PUT /api/user/profile — 更新资料（需 auth）
  app.put('/api/user/profile', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as any
      const body = await c.req.json()
      const allowedFields = ['avatar_url', 'username']

      const updates = Object.keys(body)
        .filter(k => allowedFields.includes(k))
        .map(k => `${k} = ?`)
      const params = Object.keys(body)
        .filter(k => allowedFields.includes(k))
        .map(k => body[k])

      if (updates.length === 0) {
        return c.json({ code: 400, message: 'No valid fields' }, 400)
      }

      params.push(user.id)
      await c.env.DB.prepare(
        `UPDATE user_profiles SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...params).run()

      // 返回更新后的 profile
      const profile = await c.env.DB.prepare(
        'SELECT id, supabase_uid, username, email, level, role, avatar_url, created_at FROM user_profiles WHERE id = ?'
      ).bind(user.id).first()

      return c.json({ code: 200, message: '更新成功', user: profile })
    } catch (error: any) {
      return c.json({ code: 500, message: error.message }, 500)
    }
  })

  // POST /api/user/bind-email — 绑定邮箱（需 auth）
  app.post('/api/user/bind-email', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as any
      const { email } = await c.req.json() as { email?: string }

      if (!email) {
        return c.json({ code: 400, message: '邮箱不能为空' }, 400)
      }

      // 更新 Supabase 邮箱
      const supabase = getSupabase(c.env)
      // 用 admin 方式更新不太方便，这里先更新 D1 记录
      await c.env.DB.prepare(
        'UPDATE user_profiles SET email = ? WHERE id = ?'
      ).bind(email, user.id).run()

      return c.json({ code: 200, message: '邮箱绑定成功' })
    } catch (error: any) {
      return c.json({ code: 500, message: error.message }, 500)
    }
  })

  // GET /api/user/settings — 获取设置（需 auth）
  app.get('/api/user/settings', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as any

      let settings = await c.env.DB.prepare(
        'SELECT last_volume, theme_mode, auto_play FROM user_settings WHERE user_id = ?'
      ).bind(user.id).first()

      // 如果没有设置记录，自动创建默认
      if (!settings) {
        await c.env.DB.prepare(
          'INSERT INTO user_settings (user_id, last_volume, theme_mode, auto_play) VALUES (?, 0.5, ?, 1)'
        ).bind(user.id, 'dark').run()

        settings = { last_volume: 0.5, theme_mode: 'dark', auto_play: 1 }
      }

      return c.json({ code: 200, message: 'success', ...settings })
    } catch (error: any) {
      return c.json({ code: 500, message: error.message }, 500)
    }
  })

  // PUT /api/user/settings — 更新设置（需 auth）
  app.put('/api/user/settings', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as any
      const body = await c.req.json()
      const allowedFields = ['last_volume', 'theme_mode', 'auto_play']

      const updates = Object.keys(body)
        .filter(k => allowedFields.includes(k))
        .map(k => `${k} = ?`)
      const params = Object.keys(body)
        .filter(k => allowedFields.includes(k))
        .map(k => body[k])

      if (updates.length === 0) {
        return c.json({ code: 400, message: 'No valid fields' }, 400)
      }

      // 确保 user_settings 记录存在
      const existing = await c.env.DB.prepare(
        'SELECT user_id FROM user_settings WHERE user_id = ?'
      ).bind(user.id).first()

      if (!existing) {
        await c.env.DB.prepare(
          'INSERT INTO user_settings (user_id, last_volume, theme_mode, auto_play) VALUES (?, ?, ?, ?)'
        ).bind(user.id, body.last_volume ?? 0.5, body.theme_mode ?? 'dark', body.auto_play ?? 1).run()
      } else {
        params.push(user.id)
        await c.env.DB.prepare(
          `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`
        ).bind(...params).run()
      }

      return c.json({ code: 200, message: '设置已更新' })
    } catch (error: any) {
      return c.json({ code: 500, message: error.message }, 500)
    }
  })
}
