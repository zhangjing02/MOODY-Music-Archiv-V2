import { Hono, Context } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import type { Bindings } from './types'
import { fail, serverError } from './error'

type Variables = {
  user: any
  token: string
}

type AppType = { Bindings: Bindings; Variables: Variables }

// ==========================================
// Supabase Helpers
// ==========================================

function getSupabase(env: Bindings) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
}

function getSupabaseAdmin(env: Bindings) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
}

function getJWKS(env: Bindings) {
  return createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
}

// ==========================================
// Security Answer Helpers
// ==========================================

function normalizeAnswerText(text: string): string {
  return text
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, ' ')
}

function compactAnswerText(text: string): string {
  return normalizeAnswerText(text).replace(
    /[\s`~!@#$%^&*()_\-+=[\]{}|\\;:'",.<>/?·~！@#￥%……&*（）——+={}|【】、；：'"“”《》，。？]/g,
    ''
  )
}

function chineseToNumber(raw: string): number | null {
  const text = raw.trim()
  if (!text) return null
  if (/^\d+$/.test(text)) return parseInt(text, 10)

  const map: Record<string, number> = {
    '零': 0,
    '〇': 0,
    '一': 1,
    '二': 2,
    '两': 2,
    '三': 3,
    '四': 4,
    '五': 5,
    '六': 6,
    '七': 7,
    '八': 8,
    '九': 9,
  }

  if (text === '十') return 10
  if (text.startsWith('十')) {
    const ones = map[text.slice(1)]
    return ones === undefined ? null : 10 + ones
  }

  const tenIndex = text.indexOf('十')
  if (tenIndex > 0) {
    const tensRaw = text.slice(0, tenIndex)
    const onesRaw = text.slice(tenIndex + 1)
    const tens = map[tensRaw]
    if (tens === undefined) return null
    if (!onesRaw) return tens * 10
    const ones = map[onesRaw]
    if (ones === undefined) return null
    return tens * 10 + ones
  }

  const direct = map[text]
  return direct === undefined ? null : direct
}

function toChineseNumber(n: number): string {
  const units = ['', '十']
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

  if (n < 10) return digits[n]
  if (n < 20) return `${units[1]}${digits[n % 10] === '零' ? '' : digits[n % 10]}`

  const tens = Math.floor(n / 10)
  const ones = n % 10
  return `${digits[tens]}${units[1]}${ones === 0 ? '' : digits[ones]}`
}

function parseFloorLevel(text: string): number | null {
  const compact = compactAnswerText(text)
  if (!compact) return null

  const cleaned = compact
    .replace(/^第/, '')
    .replace(/(层|樓|楼|floor|fl|f)$/g, '')

  if (!cleaned) return null
  return chineseToNumber(cleaned)
}

function buildAnswerVariants(raw: string, questionId: number): string[] {
  const variants = new Set<string>()
  const normalized = normalizeAnswerText(raw)
  const compact = compactAnswerText(raw)

  if (normalized) variants.add(normalized)
  if (compact) variants.add(compact)

  if (questionId === 1 || questionId === 2) {
    const stripped = normalized.replace(/(老师|班主任|主任|teacher)$/g, '').trim()
    const strippedCompact = compact.replace(/(老师|班主任|主任|teacher)/g, '')

    if (stripped) variants.add(stripped)
    if (stripped) variants.add(compactAnswerText(stripped))
    if (strippedCompact) variants.add(strippedCompact)
  }

  if (questionId === 3) {
    const floor = parseFloorLevel(raw)
    if (floor !== null) {
      const cn = floor <= 99 ? toChineseNumber(floor) : String(floor)
      variants.add(String(floor))
      variants.add(`${floor}层`)
      variants.add(`${floor}楼`)
      variants.add(`第${floor}层`)
      variants.add(`第${floor}楼`)
      variants.add(cn)
      variants.add(`${cn}层`)
      variants.add(`${cn}楼`)
      variants.add(`第${cn}层`)
      variants.add(`第${cn}楼`)
    }
  }

  return [...variants].filter(Boolean)
}

function isSecurityAnswerMatched(input: string, expected: string, questionId: number): boolean {
  const inputVariants = buildAnswerVariants(input, questionId)
  const expectedVariants = buildAnswerVariants(expected, questionId)
  const expectedSet = new Set(expectedVariants)
  return inputVariants.some(v => expectedSet.has(v))
}

function generateToken(length = 32): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

function buildInternalAuthEmail(roster: { id: number; year_code: string; seat_code: string }): string {
  return `moody_${roster.year_code}_${roster.seat_code}_${roster.id}@moody.internal`
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

type SeatCodeKind = 'alpha' | 'legacy' | 'unknown'

type ParsedSeatCode = {
  kind: SeatCodeKind
  rawNormalized: string
  normalized: string
  column: string | null
  row: number | null
  sortGroup: number
  sortIndex: number
  sortColumn: number
  sortRow: number
}

const ROSTER_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
const ROSTER_ROW_COUNT = 8
const TOTAL_STANDARD_SEATS = ROSTER_COLUMNS.length * ROSTER_ROW_COUNT

function seatColumnToIndex(column: string): number {
  let index = 0
  for (const ch of column) {
    const code = ch.charCodeAt(0)
    if (code < 65 || code > 90) return Number.MAX_SAFE_INTEGER
    index = index * 26 + (code - 64)
  }
  return index
}

function buildStandardSeatCode(column: string, row: number): string {
  return `${column}${String(row).padStart(2, '0')}`
}

function parseAlphaSeatCode(compactCode: string): { column: string; row: number; normalized: string } | null {
  const alphaMatch = compactCode.match(/^([A-Z]+)(\d{1,2})$/)
  if (!alphaMatch) return null

  const column = alphaMatch[1]
  const row = parseInt(alphaMatch[2], 10)
  if (row < 1 || row > 99) return null
  return { column, row, normalized: buildStandardSeatCode(column, row) }
}

function parseLegacySeatCode(compactCode: string): { legacyClass: number; seatNo: number; normalized: string } | null {
  const legacyMatch = compactCode.match(/^(\d{2})(\d{2})$/)
  if (!legacyMatch) return null

  const legacyClass = parseInt(legacyMatch[1], 10)
  const seatNo = parseInt(legacyMatch[2], 10)
  if (Number.isNaN(legacyClass) || Number.isNaN(seatNo) || seatNo <= 0) return null

  return {
    legacyClass,
    seatNo,
    normalized: `${legacyMatch[1]}${legacyMatch[2]}`,
  }
}

function seatNoToStandardSeatCode(seatNo: number): string | null {
  if (!Number.isInteger(seatNo) || seatNo <= 0 || seatNo > TOTAL_STANDARD_SEATS) return null

  const zeroBased = seatNo - 1
  const columnIndex = Math.floor(zeroBased / ROSTER_ROW_COUNT)
  const row = (zeroBased % ROSTER_ROW_COUNT) + 1
  const column = ROSTER_COLUMNS[columnIndex]
  if (!column) return null

  return buildStandardSeatCode(column, row)
}

function standardSeatCodeToSortIndex(standardSeatCode: string): number | null {
  const alpha = parseAlphaSeatCode(standardSeatCode)
  if (!alpha) return null

  const columnIndex = ROSTER_COLUMNS.indexOf(alpha.column as (typeof ROSTER_COLUMNS)[number])
  if (columnIndex < 0 || alpha.row > ROSTER_ROW_COUNT) return null

  return columnIndex * ROSTER_ROW_COUNT + alpha.row
}

function toStandardSeatCode(rawValue: unknown): string | null {
  const raw = String(rawValue ?? '').trim()
  if (!raw) return null

  const compact = raw.toUpperCase().replace(/\s+/g, '').replace(/[-_]/g, '')
  const alpha = parseAlphaSeatCode(compact)
  if (alpha) {
    return standardSeatCodeToSortIndex(alpha.normalized) ? alpha.normalized : null
  }

  const legacy = parseLegacySeatCode(compact)
  if (legacy) {
    return seatNoToStandardSeatCode(legacy.seatNo)
  }

  return null
}

function parseSeatCode(rawValue: unknown): ParsedSeatCode {
  const raw = String(rawValue ?? '').trim()
  const compact = raw.toUpperCase().replace(/\s+/g, '').replace(/[-_]/g, '')

  const standardSeatCode = toStandardSeatCode(rawValue)
  if (standardSeatCode) {
    const alpha = parseAlphaSeatCode(standardSeatCode)!
    const sortIndex = standardSeatCodeToSortIndex(standardSeatCode)!
    return {
      kind: 'alpha',
      rawNormalized: compact,
      normalized: standardSeatCode,
      column: alpha.column,
      row: alpha.row,
      sortGroup: 0,
      sortIndex,
      sortColumn: seatColumnToIndex(alpha.column),
      sortRow: alpha.row,
    }
  }

  const legacy = parseLegacySeatCode(compact)
  if (legacy) {
    return {
      kind: 'legacy',
      rawNormalized: compact,
      normalized: legacy.normalized,
      column: null,
      row: null,
      sortGroup: 1,
      sortIndex: Number.MAX_SAFE_INTEGER,
      sortColumn: legacy.legacyClass,
      sortRow: legacy.seatNo,
    }
  }

  const alpha = parseAlphaSeatCode(compact)
  if (alpha) {
    return {
      kind: 'unknown',
      rawNormalized: compact,
      normalized: alpha.normalized,
      column: alpha.column,
      row: alpha.row,
      sortGroup: 2,
      sortIndex: Number.MAX_SAFE_INTEGER,
      sortColumn: seatColumnToIndex(alpha.column),
      sortRow: alpha.row,
    }
  }

  return {
    kind: 'unknown',
    rawNormalized: compact,
    normalized: compact,
    column: null,
    row: null,
    sortGroup: 3,
    sortIndex: Number.MAX_SAFE_INTEGER,
    sortColumn: Number.MAX_SAFE_INTEGER,
    sortRow: Number.MAX_SAFE_INTEGER,
  }
}

function compareSeatCodeRows(a: any, b: any): number {
  const left = parseSeatCode(a?.seat_code)
  const right = parseSeatCode(b?.seat_code)

  if (left.sortGroup !== right.sortGroup) return left.sortGroup - right.sortGroup
  if (left.sortIndex !== right.sortIndex) return left.sortIndex - right.sortIndex
  if (left.sortColumn !== right.sortColumn) return left.sortColumn - right.sortColumn
  if (left.sortRow !== right.sortRow) return left.sortRow - right.sortRow
  return left.normalized.localeCompare(right.normalized)
}

function withSeatCodeMeta<T extends Record<string, any>>(row: T): T & {
  seat_code: string
  seat_code_kind: SeatCodeKind
  seat_column: string | null
  seat_row: number | null
  sort_index: number | null
  seat_order: number | null
  seat_code_raw?: string
} {
  const parsed = parseSeatCode(row.seat_code)
  const normalizedSeatCode = parsed.normalized || String(row.seat_code ?? '')
  return {
    ...row,
    seat_code_raw: row.seat_code,
    seat_code: normalizedSeatCode,
    seat_code_kind: parsed.kind,
    seat_column: parsed.column,
    seat_row: parsed.row,
    sort_index: parsed.sortIndex === Number.MAX_SAFE_INTEGER ? null : parsed.sortIndex,
    seat_order: parsed.sortIndex === Number.MAX_SAFE_INTEGER ? null : parsed.sortIndex,
  }
}

function normalizeSeatCodeForInsert(rawValue: unknown): string | null {
  const raw = String(rawValue ?? '').trim()
  if (!raw) return null

  const compact = raw.toUpperCase().replace(/\s+/g, '').replace(/[-_]/g, '')
  const alpha = parseAlphaSeatCode(compact)
  if (!alpha) return null

  return standardSeatCodeToSortIndex(alpha.normalized) ? alpha.normalized : null
}

function buildFullStandardRoster(rows: any[]): any[] {
  const normalized = (rows || []).map((row) => withSeatCodeMeta(row))
  const bySeatCode = new Map<string, any>()
  const defaultYearCode =
    normalized.find((row) => typeof row.year_code === 'string' && row.year_code.trim().length > 0)?.year_code || ''

  for (const row of normalized) {
    const standardSeatCode = toStandardSeatCode(row.seat_code)
    if (!standardSeatCode) continue

    const existing = bySeatCode.get(standardSeatCode)
    if (!existing) {
      bySeatCode.set(standardSeatCode, { ...row, seat_code: standardSeatCode })
      continue
    }

    const existingClaimed = existing.is_claimed === 1
    const currentClaimed = row.is_claimed === 1
    if (!existingClaimed && currentClaimed) {
      bySeatCode.set(standardSeatCode, { ...row, seat_code: standardSeatCode })
      continue
    }

    if ((existing.id ?? Number.MAX_SAFE_INTEGER) > (row.id ?? Number.MAX_SAFE_INTEGER)) {
      bySeatCode.set(standardSeatCode, { ...row, seat_code: standardSeatCode })
    }
  }

  const fullRoster: any[] = []
  let sortIndex = 1
  for (const column of ROSTER_COLUMNS) {
    for (let row = 1; row <= ROSTER_ROW_COUNT; row++) {
      const seatCode = buildStandardSeatCode(column, row)
      const entry = bySeatCode.get(seatCode)

      if (entry) {
        fullRoster.push({
          ...entry,
          seat_code: seatCode,
          seat_code_kind: 'alpha',
          seat_column: column,
          seat_row: row,
          sort_index: sortIndex,
          seat_order: sortIndex,
        })
      } else {
        fullRoster.push({
          id: 0,
          real_name: '',
          year_code: defaultYearCode,
          seat_code: seatCode,
          is_claimed: 0,
          status: 'empty',
          seat_code_kind: 'alpha',
          seat_column: column,
          seat_row: row,
          sort_index: sortIndex,
          seat_order: sortIndex,
          is_placeholder: 1,
        })
      }

      sortIndex++
    }
  }

  return fullRoster
}

function parseGeneratedUsername(username: string): { year_code: string; seat_code: string; real_name: string } | null {
  const trimmed = username.trim()
  const dotIndex = trimmed.indexOf('.')
  if (dotIndex <= 0) return null

  const year_code = trimmed.slice(0, dotIndex)
  if (!/^\d{4}$/.test(year_code)) return null

  const remain = trimmed.slice(dotIndex + 1)
  const match = remain.match(/^([A-Za-z]+\d{1,2}|\d{4})(.+)$/)
  if (!match) return null

  const seat_code = toStandardSeatCode(match[1])
  if (!seat_code) return null

  const real_name = match[2].replace(/_\d+$/, '')
  if (!real_name) return null

  return { year_code, seat_code, real_name }
}

// ==========================================
// Auth Middleware
// ==========================================

export const authMiddleware = async (c: Context<AppType>, next: any) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return fail(c, 'UNAUTHENTICATED')
  }

  const token = authHeader.slice(7)
  try {
    const JWKS = getJWKS(c.env)
    const { payload } = await jwtVerify(token, JWKS)

    const supabaseUid = payload.sub
    if (!supabaseUid) {
      return fail(c, 'TOKEN_INVALID')
    }

    const profile = await c.env.DB.prepare(
      'SELECT id, supabase_uid, username, email, level, role, avatar_url, created_at, last_android_device_id, last_android_session_at FROM user_profiles WHERE supabase_uid = ?'
    ).bind(supabaseUid).first() as any

    if (!profile) {
      return fail(c, 'TOKEN_INVALID', { message: '用户不存在' })
    }

    // [Multi-Device Kick-out Logic]
    // If the request comes from Android (detected via User-Agent or custom header), 
    // check if the current token's issued time matches the last session time in DB.
    const clientType = c.req.header('X-Client-Type') || ''
    const deviceId = c.req.header('X-Device-Id') || ''

    if (clientType === 'android') {
      const iat = payload.iat // JWT issued-at time
      const lastSessionAt = profile.last_android_session_at ? new Date(profile.last_android_session_at).getTime() / 1000 : 0
      
      // If there's a newer session in DB for Android, this old token is invalid
      if (lastSessionAt > (iat || 0) + 1) { // 1s buffer for clock drift
         return c.json({ 
           code: 503, 
           message: '您的账号已在其他安卓设备上登录，当前会话已失效',
           error_key: 'SESSION_KICKED_OUT'
         }, 503)
      }
    }

    c.set('user', profile)
    c.set('token', token)
    await next()
  } catch (err: any) {
    console.error('JWT verify error:', err.message)
    return fail(c, 'TOKEN_EXPIRED_OR_INVALID')
  }
}

// ==========================================
// Require Admin Middleware (admin + master)
// ==========================================

export const requireAdmin = async (c: Context<AppType>, next: any) => {
  const user = c.get('user')
  if (!user || (user.role !== 'admin' && user.role !== 'master')) {
    return fail(c, 'ADMIN_FORBIDDEN')
  }
  await next()
}

// Require master only
export const requireMaster = async (c: Context<AppType>, next: any) => {
  const user = c.get('user')
  if (!user || user.role !== 'master') {
    return fail(c, 'MASTER_FORBIDDEN')
  }
  await next()
}

// ==========================================
// Auth Routes
// ==========================================

export function registerAuthRoutes(app: Hono<AppType>) {

  // ========================================
  // 1. GET /api/roster — 查询座位表（公开）
  // ========================================
  //
  // 返回全部名录条目，包含认领状态。不暴露安全问题答案。
  app.get('/api/roster', async (c) => {
    try {
      const { results } = await c.env.DB.prepare(
        `SELECT id, real_name, year_code, seat_code, is_claimed, status
         FROM student_roster`
      ).all() as { results: any[] }

      const roster = buildFullStandardRoster(results || [])

      // 同时返回三道安全问题（仅问题文本，不含答案）
      const { results: questions } = await c.env.DB.prepare(
        'SELECT id, question FROM security_questions ORDER BY id ASC'
      ).all()

      return c.json({
        code: 200,
        message: 'success',
        roster,
        roster_layout: {
          columns: [...ROSTER_COLUMNS],
          rows: ROSTER_ROW_COUNT,
          total: TOTAL_STANDARD_SEATS,
        },
        security_questions: questions,
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // ========================================
  // 2. POST /api/user/claim/verify — 校验安全问题
  // ========================================
  //
  // Body: { roster_id: number, answers: string[] }
  // 移动端需要对用户输入做 trim + toLowerCase 再上传（或直接上传原文，由后端处理）
  // 返回: { claim_token: string } (10分钟有效)
  app.post('/api/user/claim/verify', async (c) => {
    try {
      const { roster_id, answers } = await c.req.json() as {
        roster_id?: number
        answers?: string[]
      }

      if (!roster_id || !Array.isArray(answers) || answers.length !== 3) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '参数不正确，需要 roster_id 和三个答案',
          details: { required: ['roster_id', 'answers[3]'] },
        })
      }

      // 检查名录是否存在且未被认领
      const roster = await c.env.DB.prepare(
        'SELECT id, real_name, year_code, seat_code, is_claimed FROM student_roster WHERE id = ?'
      ).bind(roster_id).first() as any

      if (!roster) {
        return fail(c, 'CLAIM_ROSTER_NOT_FOUND')
      }

      if (roster.is_claimed === 1) {
        return fail(c, 'CLAIM_ROSTER_ALREADY_CLAIMED')
      }

      // 校验三道安全问题（明文答案 + 宽容匹配）
      const { results: questions } = await c.env.DB.prepare(
        'SELECT id, answer_text FROM security_questions ORDER BY id ASC'
      ).all() as { results: Array<{ id: number; answer_text: string }> }

      if (questions.length !== 3) {
        return fail(c, 'CLAIM_SECURITY_CONFIG_INVALID')
      }

      for (let i = 0; i < 3; i++) {
        const questionId = questions[i].id
        const expectedAnswer = questions[i].answer_text || ''
        const inputAnswer = answers[i] || ''

        if (!isSecurityAnswerMatched(inputAnswer, expectedAnswer, questionId)) {
          return fail(c, 'CLAIM_SECURITY_ANSWER_MISMATCH', {
            message: `第 ${i + 1} 道问题答案不正确`,
            details: {
              question_index: i + 1,
              question_id: questionId,
            },
          })
        }
      }

      // 生成临时 claim_token（10分钟有效）
      const token = generateToken()
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

      await c.env.DB.prepare(
        'INSERT INTO claim_tokens (token, roster_id, expires_at) VALUES (?, ?, ?)'
      ).bind(token, roster_id, expiresAt).run()

      const responseData = {
        claim_token: token,
        roster: {
          id: roster.id,
          real_name: roster.real_name,
          year_code: roster.year_code,
          seat_code: toStandardSeatCode(roster.seat_code) || String(roster.seat_code ?? '').toUpperCase(),
        },
      }

      return c.json({
        code: 200,
        message: '验证通过，请在10分钟内完成注册',
        ...responseData,
        data: responseData,
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // ========================================
  // 3. POST /api/user/claim/finalize — 完成认领注册
  // ========================================
  //
  // Body: { claim_token: string, password_hash: string, email?: string }
  // password_hash: 移动端对原始密码 SHA-256 后的字符串（小写 hex）
  // 用户名将自动生成为: ${year_code}.${seat_code}${real_name}
  app.post('/api/user/claim/finalize', async (c) => {
    try {
      const { claim_token, password_hash, email } = await c.req.json() as {
        claim_token?: string
        password_hash?: string
        email?: string
      }

      if (!claim_token || !password_hash) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '缺少 claim_token 或 password_hash',
          details: { required: ['claim_token', 'password_hash'] },
        })
      }

      if (password_hash.length !== 64) {
        return fail(c, 'PASSWORD_HASH_INVALID', {
          message: 'password_hash 格式错误（需为 SHA-256 hex，64字符）',
          details: { field: 'password_hash' },
        })
      }

      // 1. 验证 claim_token
      const claimRecord = await c.env.DB.prepare(
        'SELECT token, roster_id, expires_at, used FROM claim_tokens WHERE token = ?'
      ).bind(claim_token).first() as any

      if (!claimRecord) {
        return fail(c, 'CLAIM_TOKEN_INVALID')
      }

      if (claimRecord.used === 1) {
        return fail(c, 'CLAIM_TOKEN_USED')
      }

      if (new Date(claimRecord.expires_at) < new Date()) {
        return fail(c, 'CLAIM_TOKEN_EXPIRED')
      }

      // 2. 获取名录信息
      const roster = await c.env.DB.prepare(
        'SELECT id, real_name, year_code, seat_code, is_claimed FROM student_roster WHERE id = ?'
      ).bind(claimRecord.roster_id).first() as any

      if (!roster) {
        return fail(c, 'CLAIM_ROSTER_NOT_FOUND')
      }

      if (roster.is_claimed === 1) {
        return fail(c, 'CLAIM_ROSTER_ALREADY_CLAIMED', { message: '该名录已被他人认领' })
      }

      // 3. 生成唯一用户名
      const normalizedSeatCode = toStandardSeatCode(roster.seat_code)
      if (!normalizedSeatCode) {
        return fail(c, 'CLAIM_FINALIZE_FAILED', {
          message: '名录 seat_code 无法转换为标准格式，请联系管理员修正',
          details: { roster_id: roster.id, seat_code: roster.seat_code },
        })
      }

      const baseUsername = `${roster.year_code}.${normalizedSeatCode}${roster.real_name}`
      let username = baseUsername
      let suffix = 1

      while (true) {
        const existing = await c.env.DB.prepare(
          'SELECT id FROM user_profiles WHERE username = ?'
        ).bind(username).first()

        if (!existing) break
        suffix++
        username = `${baseUsername}_${suffix}`
      }

      const internalAuthEmail = buildInternalAuthEmail({
        ...roster,
        seat_code: normalizedSeatCode,
      })

      // 4. 在 Supabase 创建账户
      const supabase = getSupabase(c.env)
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: internalAuthEmail,
        password: password_hash,  // 使用哈希值作为密码
      })

      if (signUpError) {
        console.error('Supabase signUp error:', signUpError.message)
        return fail(c, 'CLAIM_FINALIZE_FAILED', { message: `注册失败: ${signUpError.message}` })
      }

      const supabaseUid = signUpData.user?.id
      if (!supabaseUid) {
        return fail(c, 'CLAIM_FINALIZE_FAILED', { message: '注册失败：未获取到用户 ID' })
      }

      // 5. 写入 D1 user_profiles
      await c.env.DB.prepare(
        'INSERT INTO user_profiles (supabase_uid, username, email, level, role) VALUES (?, ?, ?, 1, ?)'
      ).bind(supabaseUid, username, email || null, 'user').run()

      const profile = await c.env.DB.prepare(
        'SELECT id, supabase_uid, username, email, level, role, avatar_url, created_at FROM user_profiles WHERE supabase_uid = ?'
      ).bind(supabaseUid).first() as any

      // 6. 更新名录：标记为已认领
      await c.env.DB.prepare(
        'UPDATE student_roster SET seat_code = ?, is_claimed = 1, profile_id = ?, bound_email = ? WHERE id = ?'
      ).bind(normalizedSeatCode, profile.id, email || null, roster.id).run()

      // 7. 标记 claim_token 为已使用
      await c.env.DB.prepare(
        'UPDATE claim_tokens SET used = 1 WHERE token = ?'
      ).bind(claim_token).run()

      const responseData = {
        user: profile,
        token: signUpData.session?.access_token,
        refresh_token: signUpData.session?.refresh_token,
      }

      return c.json({
        code: 200,
        message: `认领成功！欢迎 ${roster.real_name}`,
        ...responseData,
        data: responseData,
      })
    } catch (error: any) {
      console.error('Claim finalize error:', error)
      return serverError(c, error, 'CLAIM_FINALIZE_FAILED')
    }
  })

  // ========================================
  // 4. POST /api/user/login — 登录（保持不变）
  // ========================================
  app.post('/api/user/login', async (c) => {
    try {
      const { username, password_hash } = await c.req.json() as {
        username?: string
        password_hash?: string
      }

      if (!username || !password_hash) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '用户名和密码不能为空',
          details: { required: ['username', 'password_hash'] },
        })
      }

      const supabase = getSupabase(c.env)
      let profileLookup = await c.env.DB.prepare(
        `SELECT p.id, p.username, p.email, r.id AS roster_id, r.year_code, r.seat_code, r.real_name
         FROM user_profiles p
         LEFT JOIN student_roster r ON r.profile_id = p.id
         WHERE p.username = ?`
      ).bind(username).first() as any

      if (!profileLookup) {
        const parsedUsername = parseGeneratedUsername(username)
        if (parsedUsername) {
          const { results: fallbackRows } = await c.env.DB.prepare(
            `SELECT p.id, p.username, p.email, r.id AS roster_id, r.year_code, r.seat_code, r.real_name
             FROM user_profiles p
             INNER JOIN student_roster r ON r.profile_id = p.id
             WHERE r.year_code = ? AND r.real_name = ?`
          ).bind(parsedUsername.year_code, parsedUsername.real_name).all() as { results: any[] }

          profileLookup = (fallbackRows || []).find((row) => {
            return toStandardSeatCode(row.seat_code) === parsedUsername.seat_code
          }) || null
        }
      }

      const emailCandidates = uniqueStrings([
        profileLookup?.roster_id
          ? buildInternalAuthEmail({
              id: profileLookup.roster_id,
              year_code: profileLookup.year_code,
              seat_code: profileLookup.seat_code,
            })
          : null,
        profileLookup?.email?.endsWith('@moody.internal') ? profileLookup.email : null,
        profileLookup?.email?.endsWith('@moody.app') ? profileLookup.email : null,
        `${username}@moody.internal`,
        `${username}@moody.app`,
        profileLookup?.email && !profileLookup.email.endsWith('@moody.internal') && !profileLookup.email.endsWith('@moody.app')
          ? profileLookup.email
          : null,
      ])

      let signInData: any = null
      let signInError: any = null

      for (const candidateEmail of emailCandidates) {
        const result = await supabase.auth.signInWithPassword({
          email: candidateEmail,
          password: password_hash,
        })

        if (!result.error) {
          signInData = result.data
          signInError = null
          break
        }

        signInError = result.error
      }

      if (signInError || !signInData) {
        return fail(c, 'LOGIN_FAILED')
      }

      const supabaseUid = signInData.user?.id
      const accessToken = signInData.session?.access_token
      const refreshToken = signInData.session?.refresh_token

      if (!supabaseUid || !accessToken) {
        return fail(c, 'SESSION_CREATE_FAILED')
      }

      const profile = await c.env.DB.prepare(
        'SELECT id, supabase_uid, username, email, level, role, avatar_url, created_at, last_android_device_id FROM user_profiles WHERE supabase_uid = ?'
      ).bind(supabaseUid).first() as any

      if (profileLookup && profileLookup.id === profile.id) {
        const standardSeatCode = toStandardSeatCode(profileLookup.seat_code)
        const canonicalUsername =
          standardSeatCode && profileLookup.year_code && profileLookup.real_name
            ? `${profileLookup.year_code}.${standardSeatCode}${profileLookup.real_name}`
            : null

        if (canonicalUsername && profile.username !== canonicalUsername) {
          const existingCanonical = await c.env.DB.prepare(
            'SELECT id FROM user_profiles WHERE username = ?'
          ).bind(canonicalUsername).first() as any

          if (!existingCanonical) {
            await c.env.DB.prepare(
              'UPDATE user_profiles SET username = ? WHERE id = ?'
            ).bind(canonicalUsername, profile.id).run()
            profile.username = canonicalUsername
          }
        }
      }

      // [Kick-out Implementation]
      const clientType = c.req.header('X-Client-Type') || ''
      const deviceId = c.req.header('X-Device-Id') || ''
      
      if (clientType === 'android' && deviceId) {
        // 1. If there was a previous device, send JPush kick-out notification
        if (profile.last_android_device_id && profile.last_android_device_id !== deviceId) {
          if (c.env.JPUSH_APP_KEY && c.env.JPUSH_MASTER_SECRET) {
            c.executionCtx.waitUntil(
              fetch('https://api.jpush.cn/v3/push', {
                method: 'POST',
                headers: {
                  'Authorization': `Basic ${btoa(`${c.env.JPUSH_APP_KEY}:${c.env.JPUSH_MASTER_SECRET}`)}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  platform: 'android',
                  audience: { registration_id: [profile.last_android_device_id] }, // Assuming device_id is registration_id for simplicity or use tag
                  message: {
                    msg_content: 'Your account has been logged in on another device.',
                    extras: { action: 'KICK_OUT', reason: 'new_login' }
                  }
                })
              }).catch(err => console.error('JPush kickout error:', err))
            )
          }
        }

        // 2. Update DB with new device info and session time
        await c.env.DB.prepare(
          'UPDATE user_profiles SET last_android_device_id = ?, last_android_session_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(deviceId, profile.id).run()
      }

      // 检查是否 reset_pending
      const rosterRecord = await c.env.DB.prepare(
        'SELECT status FROM student_roster WHERE profile_id = ?'
      ).bind((profile as any)?.id).first() as any

      const responseData = {
        user: profile,
        token: accessToken,
        refresh_token: refreshToken,
        reset_pending: rosterRecord?.status === 'reset_pending',
      }

      return c.json({
        code: 200,
        message: '登录成功',
        ...responseData,
        data: responseData,
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // ========================================
  // 5. POST /api/user/refresh — 刷新 Token
  // ========================================
  app.post('/api/user/refresh', async (c) => {
    try {
      const { refresh_token } = await c.req.json() as { refresh_token?: string }

      if (!refresh_token) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '缺少 refresh_token',
          details: { required: ['refresh_token'] },
        })
      }

      const supabase = getSupabase(c.env)
      const { data, error } = await supabase.auth.refreshSession({ refresh_token })

      if (error) {
        return fail(c, 'REFRESH_TOKEN_INVALID')
      }

      const responseData = {
        token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
      }

      return c.json({
        code: 200,
        message: '刷新成功',
        ...responseData,
        data: responseData,
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // ========================================
  // 6. GET /api/user/me — 当前用户信息（需 auth）
  // ========================================
  app.get('/api/user/me', authMiddleware, async (c) => {
    const user = c.get('user') as any
    // 附带名录状态
    const rosterRaw = await c.env.DB.prepare(
      'SELECT id, real_name, seat_code, status FROM student_roster WHERE profile_id = ?'
    ).bind(user.id).first()
    const roster = rosterRaw ? withSeatCodeMeta(rosterRaw as any) : null

    return c.json({
      code: 200,
      message: 'success',
      user,
      roster,
    })
  })

  // ========================================
  // 7. PUT /api/user/profile — 更新资料（需 auth）
  // ========================================
  app.put('/api/user/profile', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as any
      const body = await c.req.json()
      const allowedFields = ['avatar_url']

      const updates = Object.keys(body)
        .filter(k => allowedFields.includes(k))
        .map(k => `${k} = ?`)
      const params = Object.keys(body)
        .filter(k => allowedFields.includes(k))
        .map(k => body[k])

      if (updates.length === 0) {
        return fail(c, 'NO_VALID_FIELDS', { message: '无有效更新字段（用户名不可更改）' })
      }

      params.push(user.id)
      await c.env.DB.prepare(
        `UPDATE user_profiles SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...params).run()

      const profile = await c.env.DB.prepare(
        'SELECT id, supabase_uid, username, email, level, role, avatar_url, created_at FROM user_profiles WHERE id = ?'
      ).bind(user.id).first()

      return c.json({ code: 200, message: '更新成功', user: profile })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // ========================================
  // 8. POST /api/user/bind-email — 绑定邮箱（需 auth）
  // ========================================
  app.post('/api/user/bind-email', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as any
      const { email } = await c.req.json() as { email?: string }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return fail(c, 'EMAIL_INVALID')
      }

      // 更新 D1 user_profiles
      await c.env.DB.prepare(
        'UPDATE user_profiles SET email = ? WHERE id = ?'
      ).bind(email, user.id).run()

      // 同步更新名录的 bound_email
      await c.env.DB.prepare(
        'UPDATE student_roster SET bound_email = ? WHERE profile_id = ?'
      ).bind(email, user.id).run()

      return c.json({ code: 200, message: '邮箱绑定成功' })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // ========================================
  // 9. POST /api/user/reset/request — 申请密码重置（邮箱验证码）
  // 需要 auth（用于有 Token 但想改密码的场景）
  // 或 Body 携带 username（忘记密码场景）
  // ========================================
  app.post('/api/user/reset/request', async (c) => {
    try {
      const { username } = await c.req.json() as { username?: string }

      if (!username) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '请提供用户名',
          details: { required: ['username'] },
        })
      }

      // 查找用户
      const profile = await c.env.DB.prepare(
        'SELECT id, email FROM user_profiles WHERE username = ?'
      ).bind(username).first() as any

      if (!profile) {
        return fail(c, 'USER_NOT_FOUND')
      }

      // 查是否绑定了真实邮箱
      const roster = await c.env.DB.prepare(
        'SELECT bound_email FROM student_roster WHERE profile_id = ?'
      ).bind(profile.id).first() as any

      const realEmail = roster?.bound_email
      if (!realEmail || realEmail.endsWith('@moody.internal') || realEmail.endsWith('@moody.app')) {
        return fail(c, 'RESET_EMAIL_NOT_BOUND')
      }

      // 生成 6 位验证码，写入 claim_tokens 复用逻辑
      const code = Math.floor(100000 + Math.random() * 900000).toString()
      const token = `reset_${code}_${generateToken(8)}`
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

      // 用 roster_id = profile.id 临时借用字段存重置令牌
      await c.env.DB.prepare(
        'INSERT INTO claim_tokens (token, roster_id, expires_at) VALUES (?, ?, ?)'
      ).bind(token, profile.id, expiresAt).run()

      // TODO: 对接邮件发送服务（如 Resend.com）发送验证码
      // 当前返回 token 供调试（生产环境不应返回）
      console.log(`Reset code for ${username}: ${code}, token: ${token}`)

      return c.json({
        code: 200,
        message: `验证码已发送至 ${realEmail.replace(/(.{2}).*@/, '$1***@')}，15分钟内有效`,
        // debug_token: token,  // 上线后移除此行
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // ========================================
  // 10. POST /api/user/reset/confirm — 确认重置密码
  // ========================================
  app.post('/api/user/reset/confirm', async (c) => {
    try {
      const { username, code, new_password_hash } = await c.req.json() as {
        username?: string
        code?: string
        new_password_hash?: string
      }

      if (!username || !code || !new_password_hash) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '参数缺失',
          details: { required: ['username', 'code', 'new_password_hash'] },
        })
      }

      if (new_password_hash.length !== 64) {
        return fail(c, 'PASSWORD_HASH_INVALID', {
          message: 'new_password_hash 格式错误',
          details: { field: 'new_password_hash' },
        })
      }

      const profile = await c.env.DB.prepare(
        'SELECT id, supabase_uid FROM user_profiles WHERE username = ?'
      ).bind(username).first() as any

      if (!profile) {
        return fail(c, 'USER_NOT_FOUND')
      }

      // 查找有效的重置令牌
      const { results: tokens } = await c.env.DB.prepare(
        `SELECT token, expires_at FROM claim_tokens
         WHERE roster_id = ? AND used = 0 AND token LIKE 'reset_%'
         ORDER BY expires_at DESC LIMIT 1`
      ).bind(profile.id).all() as { results: Array<{ token: string; expires_at: string }> }

      if (!tokens || tokens.length === 0) {
        return fail(c, 'RESET_REQUEST_NOT_FOUND')
      }

      const tokenRecord = tokens[0]
      if (new Date(tokenRecord.expires_at) < new Date()) {
        return fail(c, 'RESET_CODE_EXPIRED')
      }

      // 验证 code 是否匹配
      const expectedCode = tokenRecord.token.split('_')[1]
      if (code !== expectedCode) {
        return fail(c, 'RESET_CODE_MISMATCH')
      }

      // 调用 Supabase Admin API 强制更新密码
      const supabaseAdmin = getSupabaseAdmin(c.env)
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        profile.supabase_uid,
        { password: new_password_hash }
      )

      if (updateError) {
        console.error('Supabase admin updateUser error:', updateError.message)
        return fail(c, 'PASSWORD_UPDATE_FAILED', { message: '密码重置失败，请稍后重试' })
      }

      // 标记 token 已使用
      await c.env.DB.prepare(
        'UPDATE claim_tokens SET used = 1 WHERE token = ?'
      ).bind(tokenRecord.token).run()

      // 清除 reset_pending 状态
      await c.env.DB.prepare(
        "UPDATE student_roster SET status = 'normal' WHERE profile_id = ?"
      ).bind(profile.id).run()

      return c.json({ code: 200, message: '密码重置成功，请使用新密码登录' })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // ========================================
  // 11. POST /api/user/reset/set-new — 管理员重置后用户自助设置新密码
  // 用于登录后检测到 reset_pending，在 App 内直接设置
  // ========================================
  app.post('/api/user/reset/set-new', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as any
      const { new_password_hash } = await c.req.json() as { new_password_hash?: string }

      if (!new_password_hash || new_password_hash.length !== 64) {
        return fail(c, 'PASSWORD_HASH_INVALID', {
          message: 'new_password_hash 格式错误',
          details: { field: 'new_password_hash' },
        })
      }

      const supabaseAdmin = getSupabaseAdmin(c.env)
      const { error } = await supabaseAdmin.auth.admin.updateUserById(
        user.supabase_uid,
        { password: new_password_hash }
      )

      if (error) {
        return fail(c, 'PASSWORD_UPDATE_FAILED', { message: '密码设置失败' })
      }

      await c.env.DB.prepare(
        "UPDATE student_roster SET status = 'normal' WHERE profile_id = ?"
      ).bind(user.id).run()

      return c.json({ code: 200, message: '新密码设置成功' })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // ========================================
  // 12. GET /api/user/settings — 获取设置
  // ========================================
  app.get('/api/user/settings', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as any

      let settings = await c.env.DB.prepare(
        'SELECT last_volume, theme_mode, auto_play FROM user_settings WHERE user_id = ?'
      ).bind(user.id).first()

      if (!settings) {
        await c.env.DB.prepare(
          'INSERT INTO user_settings (user_id, last_volume, theme_mode, auto_play) VALUES (?, 0.5, ?, 1)'
        ).bind(user.id, 'dark').run()

        settings = { last_volume: 0.5, theme_mode: 'dark', auto_play: 1 }
      }

      return c.json({ code: 200, message: 'success', ...settings })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // ========================================
  // 13. PUT /api/user/settings — 更新设置
  // ========================================
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
        return fail(c, 'NO_VALID_FIELDS', { message: 'No valid fields' })
      }

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
      return serverError(c, error)
    }
  })

  // ============================================================
  // === 管理员接口 (需要 admin 或 master 权限) ==================
  // ============================================================

  // 14. GET /api/admin/roster — 查看全部名录（含敏感信息）
  app.get('/api/admin/roster', authMiddleware, requireAdmin, async (c) => {
    try {
      const { results } = await c.env.DB.prepare(
        `SELECT r.*, p.username, p.email as profile_email
         FROM student_roster r
         LEFT JOIN user_profiles p ON r.profile_id = p.id`
      ).all() as { results: any[] }

      const roster = (results || [])
        .map((item) => withSeatCodeMeta(item))
        .sort(compareSeatCodeRows)

      return c.json({ code: 200, message: 'success', roster })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // 15. POST /api/admin/roster/add — 新增名录条目
  app.post('/api/admin/roster/add', authMiddleware, requireAdmin, async (c) => {
    try {
      const { real_name, year_code, seat_code } = await c.req.json() as {
        real_name?: string
        year_code?: string
        seat_code?: string
      }

      if (!real_name || !year_code || !seat_code) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '缺少必要字段',
          details: { required: ['real_name', 'year_code', 'seat_code'] },
        })
      }

      const normalizedSeatCode = normalizeSeatCodeForInsert(seat_code)
      if (!normalizedSeatCode) {
        return fail(c, 'INVALID_PARAMETER', {
          message: 'seat_code 格式错误，请使用 A01/B02 这样的列号+两位行号格式',
          details: { field: 'seat_code', expected_format: 'A01' },
        })
      }

      await c.env.DB.prepare(
        'INSERT INTO student_roster (real_name, year_code, seat_code) VALUES (?, ?, ?)'
      ).bind(real_name, year_code, normalizedSeatCode).run()

      return c.json({ code: 200, message: '名录添加成功' })
    } catch (error: any) {
      if (error.message.includes('UNIQUE')) {
        return fail(c, 'ROSTER_ALREADY_EXISTS')
      }
      return serverError(c, error)
    }
  })

  // 16. POST /api/admin/roster/reset — 重置某人认领状态（管理员删除密码）
  app.post('/api/admin/roster/reset', authMiddleware, requireAdmin, async (c) => {
    try {
      const { roster_id } = await c.req.json() as { roster_id?: number }

      if (!roster_id) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '缺少 roster_id',
          details: { required: ['roster_id'] },
        })
      }

      const roster = await c.env.DB.prepare(
        'SELECT id, profile_id, is_claimed FROM student_roster WHERE id = ?'
      ).bind(roster_id).first() as any

      if (!roster) {
        return fail(c, 'CLAIM_ROSTER_NOT_FOUND')
      }

      if (!roster.is_claimed) {
        return fail(c, 'ROSTER_NOT_CLAIMED')
      }

      // 将 status 置为 reset_pending，用户下次登录会被提示重置密码
      await c.env.DB.prepare(
        "UPDATE student_roster SET status = 'reset_pending' WHERE id = ?"
      ).bind(roster_id).run()

      return c.json({
        code: 200,
        message: '已标记为需要重置密码，该用户下次登录时将被要求设置新密码'
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // 17. POST /api/admin/roster/unclaim — 完全撤销认领（谨慎操作）
  app.post('/api/admin/roster/unclaim', authMiddleware, requireMaster, async (c) => {
    try {
      const { roster_id } = await c.req.json() as { roster_id?: number }

      if (!roster_id) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '缺少 roster_id',
          details: { required: ['roster_id'] },
        })
      }

      const roster = await c.env.DB.prepare(
        'SELECT id, profile_id FROM student_roster WHERE id = ?'
      ).bind(roster_id).first() as any

      if (!roster || !roster.profile_id) {
        return fail(c, 'ROSTER_NOT_FOUND_OR_UNCLAIMED')
      }

      // 撤销名录认领状态（不删除 Supabase 账户，只断开关联）
      await c.env.DB.prepare(
        "UPDATE student_roster SET is_claimed = 0, profile_id = NULL, bound_email = NULL, status = 'normal' WHERE id = ?"
      ).bind(roster_id).run()

      return c.json({ code: 200, message: '认领已撤销，该座位可重新认领（原账号不受影响）' })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // 18. PUT /api/admin/user/role — 修改用户权限（仅 master）
  app.put('/api/admin/user/role', authMiddleware, requireMaster, async (c) => {
    try {
      const { username, role } = await c.req.json() as {
        username?: string
        role?: string
      }

      if (!username || !role) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '缺少 username 或 role',
          details: { required: ['username', 'role'] },
        })
      }

      const validRoles = ['user', 'admin', 'master']
      if (!validRoles.includes(role)) {
        return fail(c, 'ROLE_INVALID', { message: `role 只能是: ${validRoles.join(', ')}` })
      }

      const targetUser = await c.env.DB.prepare(
        'SELECT id FROM user_profiles WHERE username = ?'
      ).bind(username).first()

      if (!targetUser) {
        return fail(c, 'USER_NOT_FOUND')
      }

      await c.env.DB.prepare(
        'UPDATE user_profiles SET role = ? WHERE username = ?'
      ).bind(role, username).run()

      return c.json({ code: 200, message: `${username} 的权限已更新为 ${role}` })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // 19. PUT /api/admin/questions — 更新安全问题答案（仅 master，明文存储）
  app.put('/api/admin/questions', authMiddleware, requireMaster, async (c) => {
    try {
      const { answers } = await c.req.json() as { answers?: string[] }

      if (!Array.isArray(answers) || answers.length !== 3) {
        return fail(c, 'QUESTION_ANSWERS_INVALID')
      }

      for (let i = 0; i < 3; i++) {
        const answer = (answers[i] || '').trim()
        await c.env.DB.prepare(
          'UPDATE security_questions SET answer_text = ? WHERE id = ?'
        ).bind(answer, i + 1).run()
      }

      return c.json({ code: 200, message: '安全问题答案已更新' })
    } catch (error: any) {
      return serverError(c, error)
    }
  })
}
