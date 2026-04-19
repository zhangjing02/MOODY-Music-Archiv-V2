import { Hono } from 'hono'

export function registerPushRoutes(app: Hono<any>) {
  // Push message to Android devices via JPush REST API
  app.post('/api/admin/push/message', async (c) => {
    try {
      const body = await c.req.json()
      
      const appKey = 'cab5e87b9dd9b0acd6df56c3'
      const masterSecret = 'ecab4b7671b57c78bbd72c22'
      const auth = btoa(`${appKey}:${masterSecret}`)

      // Construct JPush API payload
      const payload = {
        platform: "android",
        audience: "all",
        notification: {
          android: {
            alert: body.message || "这是一条测试推送消息",
            title: body.title || "MOODY Music"
          }
        }
      }

      const response = await fetch('https://api.jpush.cn/v3/push', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('JPush API Error:', result)
        return c.json({ code: response.status, message: 'Push failed', error: result }, response.status as any)
      }

      return c.json({
        code: 200,
        message: 'Push successful',
        data: result
      })
    } catch (error: any) {
      console.error('Push exception:', error)
      return c.json({ code: 500, message: error.message }, 500)
    }
  })
}
