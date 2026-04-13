export type Bindings = {
  DB: D1Database
  BUCKET: R2Bucket
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_KEY: string  // Supabase Service Role Key，用于 Admin API（密码重置等）
}
