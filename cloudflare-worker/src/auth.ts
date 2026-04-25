import { Hono, Context } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import type { Bindings } from './types'
import { fail, serverError } from './error'
import { sendPushMessage } from './push'


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
  return normalizeAnswerText(text).replace(/[\s\p{P}\p{S}]+/gu, '')
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
    const stripped = normalized.replace(/(\u8001\u5e08|\u73ed\u4e3b\u4efb|\u4e3b\u4efb|teacher)$/g, '').trim()
    const strippedCompact = compact.replace(/(\u8001\u5e08|\u73ed\u4e3b\u4efb|\u4e3b\u4efb|teacher)/g, '')

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
    await ensureUserProfileSessionColumns(c.env.DB)

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
      return fail(c, 'TOKEN_INVALID', { message: '\u7528\u6237\u4e0d\u5b58\u5728' })
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
           message: '\u60a8\u7684\u8d26\u53f7\u5df2\u5728\u5176\u4ed6\u5b89\u5353\u8bbe\u5907\u4e0a\u767b\u5f55\uff0c\u5f53\u524d\u4f1a\u8bdd\u5df2\u5931\u6548',
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
  if (!user) {
    return fail(c, 'ADMIN_FORBIDDEN')
  }

  if (isGlobalAdminRole(user.role)) {
    await next()
    return
  }

  const userId = Number(user.id || 0)
  if (!Number.isInteger(userId) || userId <= 0) {
    return fail(c, 'ADMIN_FORBIDDEN')
  }

  const classAdmin = await hasAnyClassAdminRole(c.env.DB, userId)
  if (!classAdmin) {
    return fail(c, 'ADMIN_FORBIDDEN')
  }

  await next()
}

// Require master only
export const requireMaster = async (c: Context<AppType>, next: any) => {
  const user = c.get('user')
  if (!user || !isDevelopMasterRole(user.role)) {
    return fail(c, 'MASTER_FORBIDDEN')
  }
  await next()
}

function parsePageNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback
  const value = parseInt(raw, 10)
  if (Number.isNaN(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function parseBooleanFlag(raw: unknown, fallback = false): boolean {
  if (raw === undefined || raw === null) return fallback
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y') return true
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n') return false
  }
  return fallback
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function buildSqlInPlaceholders(length: number): string {
  return Array.from({ length }, () => '?').join(', ')
}

type ClassGroupRow = {
  id: number
  grade_year: string
  class_name: string
  display_name: string
  is_active: number
  created_at?: string
}

type ClassSecurityQuestionRow = {
  class_id: number
  q_index: number
  question: string
  answer_text: string
}

type ClassAdminRoleValue = 'master' | 'manager'

type ClassAdminRoleRow = {
  class_id: number
  user_id: number
  admin_role: ClassAdminRoleValue
  created_at?: string
  updated_at?: string
}

function isDevelopMasterRole(role?: string | null): boolean {
  return role === 'develop_master'
}

function isGlobalAdminRole(role?: string | null): boolean {
  return role === 'admin' || isDevelopMasterRole(role)
}

async function ensureDevelopMasterAccess(c: Context<AppType>) {
  const user = c.get('user') as any
  if (!user || !isDevelopMasterRole(user.role)) {
    return fail(c, 'MASTER_FORBIDDEN', { message: '需要 develop-master 权限' })
  }
  return null
}


async function hasAnyClassAdminRole(db: D1Database, userId: number): Promise<boolean> {
  if (!Number.isInteger(userId) || userId <= 0) return false
  try {
    const row = await db.prepare(
      'SELECT 1 AS ok FROM class_admin_roles WHERE user_id = ? LIMIT 1'
    ).bind(userId).first<{ ok: number }>()
    return !!row?.ok
  } catch (error: any) {
    const message = String(error?.message || '').toLowerCase()
    if (message.includes('no such table')) return false
    throw error
  }
}

async function getManagedClassIdsForUser(db: D1Database, userId: number): Promise<number[]> {
  if (!Number.isInteger(userId) || userId <= 0) return []
  const { results } = await db.prepare(
    `SELECT class_id
     FROM class_admin_roles
     WHERE user_id = ?
     ORDER BY class_id ASC`
  ).bind(userId).all() as { results: Array<{ class_id: number }> }

  return [...new Set((results || []).map((item) => Number(item.class_id)).filter((id) => Number.isInteger(id) && id > 0))]
}

async function getClassAdminRoleForUser(
  db: D1Database,
  classId: number,
  userId: number
): Promise<ClassAdminRoleValue | null> {
  if (!Number.isInteger(classId) || classId <= 0) return null
  if (!Number.isInteger(userId) || userId <= 0) return null

  const row = await db.prepare(
    `SELECT admin_role
     FROM class_admin_roles
     WHERE class_id = ? AND user_id = ?
     LIMIT 1`
  ).bind(classId, userId).first<{ admin_role: ClassAdminRoleValue }>()

  return row?.admin_role || null
}

type ClassAdminAccess = {
  user: any
  isDevelopMaster: boolean
  classRole: ClassAdminRoleValue | 'develop_master'
}

async function ensureClassAdminAccess(
  c: Context<AppType>,
  classId: number,
  options: { requireClassMaster?: boolean } = {}
): Promise<ClassAdminAccess | Response> {
  const requester = c.get('user') as any
  if (!requester) {
    return fail(c, 'ADMIN_FORBIDDEN')
  }

  if (isDevelopMasterRole(requester.role)) {
    return {
      user: requester,
      isDevelopMaster: true,
      classRole: 'develop_master',
    }
  }

  const classRole = await getClassAdminRoleForUser(c.env.DB, classId, Number(requester.id || 0))
  if (!classRole) {
    return fail(c, 'ADMIN_FORBIDDEN', {
      message: '当前账号无权限管理该班级',
      details: { class_id: classId },
    })
  }

  if (options.requireClassMaster && classRole !== 'master') {
    return fail(c, 'MASTER_FORBIDDEN', {
      message: '当前操作需要该班级 master 权限',
      details: { class_id: classId },
    })
  }

  return {
    user: requester,
    isDevelopMaster: false,
    classRole,
  }
}

async function resolveScopedClassIdForAdmin(
  c: Context<AppType>,
  rawClassId?: string | number | null
): Promise<number | Response> {
  await ensureClassroomSchema(c.env.DB)

  const requester = c.get('user') as any
  if (!requester) {
    return fail(c, 'ADMIN_FORBIDDEN')
  }

  if (isDevelopMasterRole(requester.role)) {
    if (rawClassId === undefined || rawClassId === null || rawClassId === '') {
      return await resolveClassId(c.env.DB, null)
    }
    return await resolveClassIdStrict(c.env.DB, rawClassId)
  }

  const managedClassIds = await getManagedClassIdsForUser(c.env.DB, Number(requester.id || 0))
  if (managedClassIds.length === 0) {
    return fail(c, 'ADMIN_FORBIDDEN', {
      message: '当前账号未分配任何班级管理权限',
    })
  }

  if (rawClassId === undefined || rawClassId === null || rawClassId === '') {
    if (managedClassIds.length === 1) {
      return managedClassIds[0]
    }
    return fail(c, 'MISSING_PARAMETER', {
      message: '请指定 class_id',
      details: { required: ['class_id'] },
    })
  }

  const classId = await resolveClassIdStrict(c.env.DB, rawClassId)
  if (!managedClassIds.includes(classId)) {
    return fail(c, 'ADMIN_FORBIDDEN', {
      message: '不允许操作其他班级数据',
      details: { class_id: classId },
    })
  }

  return classId
}
async function ensureUserProfileSessionColumns(db: D1Database) {
  try {
    await db.prepare('ALTER TABLE user_profiles ADD COLUMN last_android_device_id TEXT').run()
  } catch (error: any) {
    const message = String(error?.message || '')
    if (!message.toLowerCase().includes('duplicate column name')) {
      throw error
    }
  }

  try {
    await db.prepare('ALTER TABLE user_profiles ADD COLUMN last_android_session_at DATETIME').run()
  } catch (error: any) {
    const message = String(error?.message || '')
    if (!message.toLowerCase().includes('duplicate column name')) {
      throw error
    }
  }
}

async function ensureClassroomSchema(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS class_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade_year TEXT NOT NULL,
      class_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ).run()

  await db.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_class_groups_unique
     ON class_groups(grade_year, class_name)`
  ).run()

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS class_security_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      q_index INTEGER NOT NULL,
      question TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(class_id) REFERENCES class_groups(id)
    )`
  ).run()

  await db.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_class_security_questions_unique
     ON class_security_questions(class_id, q_index)`
  ).run()

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS admin_runtime_flags (
      flag_key TEXT PRIMARY KEY,
      flag_value TEXT,
      expires_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ).run()

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS class_admin_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      admin_role TEXT NOT NULL CHECK(admin_role IN ('master', 'manager')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(class_id) REFERENCES class_groups(id),
      FOREIGN KEY(user_id) REFERENCES user_profiles(id)
    )`
  ).run()

  await db.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_class_admin_roles_unique
     ON class_admin_roles(class_id, user_id)`
  ).run()

  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_class_admin_roles_user_id
     ON class_admin_roles(user_id)`
  ).run()

  try {
    await db.prepare('ALTER TABLE student_roster ADD COLUMN class_id INTEGER').run()
  } catch (error: any) {
    const message = String(error?.message || '')
    if (!message.toLowerCase().includes('duplicate column name')) {
      throw error
    }
  }

  await db.prepare(
    'CREATE INDEX IF NOT EXISTS idx_student_roster_class_id ON student_roster(class_id)'
  ).run()

  const classCountResult = await db.prepare(
    'SELECT COUNT(*) AS count FROM class_groups'
  ).first<{ count: number }>()

  if ((classCountResult?.count || 0) === 0) {
    const defaultYearResult = await db.prepare(
      "SELECT year_code FROM student_roster WHERE year_code IS NOT NULL AND year_code != '' ORDER BY id ASC LIMIT 1"
    ).first<{ year_code: string }>()

    const defaultYear = defaultYearResult?.year_code || String(new Date().getFullYear())
    await db.prepare(
      'INSERT INTO class_groups (grade_year, class_name, display_name, is_active) VALUES (?, ?, ?, 1)'
    ).bind(defaultYear, '默认班级', `${defaultYear}届 默认班级`).run()
  }

  const defaultClass = await db.prepare(
    'SELECT id FROM class_groups ORDER BY id ASC LIMIT 1'
  ).first<{ id: number }>()

  if (defaultClass?.id) {
    await db.prepare(
      'UPDATE student_roster SET class_id = ? WHERE class_id IS NULL'
    ).bind(defaultClass.id).run()
  }
}

async function getClassGroupById(db: D1Database, classId: number) {
  return await db.prepare(
    `SELECT id, grade_year, class_name, display_name, is_active, created_at
     FROM class_groups
     WHERE id = ?`
  ).bind(classId).first<ClassGroupRow>()
}

async function getAllClassGroups(db: D1Database): Promise<ClassGroupRow[]> {
  const { results } = await db.prepare(
    `SELECT id, grade_year, class_name, display_name, is_active, created_at
     FROM class_groups
     ORDER BY id ASC`
  ).all() as { results: ClassGroupRow[] }
  return results || []
}

async function resolveClassId(db: D1Database, rawClassId?: string | number | null): Promise<number> {
  const parsed = rawClassId === null || rawClassId === undefined
    ? NaN
    : parseInt(String(rawClassId), 10)

  if (!Number.isNaN(parsed) && parsed > 0) {
    const target = await getClassGroupById(db, parsed)
    if (target) return target.id
  }

  const firstClass = await db.prepare(
    'SELECT id FROM class_groups ORDER BY id ASC LIMIT 1'
  ).first<{ id: number }>()

  if (!firstClass?.id) {
    throw new Error('CLASS_GROUP_NOT_FOUND')
  }

  return firstClass.id
}

async function resolveClassIdStrict(db: D1Database, rawClassId?: string | number | null): Promise<number> {
  const parsed = rawClassId === null || rawClassId === undefined
    ? NaN
    : parseInt(String(rawClassId), 10)

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error('INVALID_CLASS_ID')
  }

  const target = await getClassGroupById(db, parsed)
  if (!target) {
    throw new Error('CLASS_GROUP_NOT_FOUND')
  }

  return parsed
}

async function getClassQuestions(
  db: D1Database,
  classId: number,
  withAnswer = false
): Promise<Array<{ id: number; q_index: number; question: string; answer_text?: string }>> {
  const classRowsResult = await db.prepare(
    `SELECT class_id, q_index, question, answer_text
     FROM class_security_questions
     WHERE class_id = ?
     ORDER BY q_index ASC`
  ).bind(classId).all() as { results: ClassSecurityQuestionRow[] }

  if ((classRowsResult.results || []).length === 3) {
    return (classRowsResult.results || []).map((row) => ({
      id: row.q_index,
      q_index: row.q_index,
      question: row.question,
      ...(withAnswer ? { answer_text: row.answer_text } : {}),
    }))
  }

  const legacyResult = await db.prepare(
    'SELECT id, question, answer_text FROM security_questions ORDER BY id ASC'
  ).all() as { results: Array<{ id: number; question: string; answer_text: string }> }

  const legacy = (legacyResult.results || []).slice(0, 3)
  if (legacy.length === 3) {
    for (const row of legacy) {
      await db.prepare(
        `INSERT OR REPLACE INTO class_security_questions (class_id, q_index, question, answer_text)
         VALUES (?, ?, ?, ?)`
      ).bind(classId, row.id, row.question, row.answer_text).run()
    }
  }

  return legacy.map((row) => ({
    id: row.id,
    q_index: row.id,
    question: row.question,
    ...(withAnswer ? { answer_text: row.answer_text } : {}),
  }))
}

function buildResetChannelFlagKey(classId: number): string {
  return `self_reset_channel_class_${classId}`
}

async function getResetChannelStatus(db: D1Database, classId: number) {
  const key = buildResetChannelFlagKey(classId)
  const row = await db.prepare(
    `SELECT flag_key, flag_value, expires_at, updated_at
     FROM admin_runtime_flags
     WHERE flag_key = ?`
  ).bind(key).first<{ flag_key: string; flag_value: string; expires_at: string | null; updated_at: string | null }>()

  if (!row) {
    return { open: false, expires_at: null as string | null }
  }

  const expiresAt = row.expires_at
  const open = !!expiresAt && new Date(expiresAt).getTime() > Date.now() && (row.flag_value || '1') !== '0'
  return {
    open,
    expires_at: expiresAt,
    updated_at: row.updated_at || null,
  }
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
      await ensureClassroomSchema(c.env.DB)

      const classId = await resolveClassId(c.env.DB, c.req.query('class_id'))
      const classGroups = await getAllClassGroups(c.env.DB)
      const currentClass = classGroups.find((item) => item.id === classId) || null

      const { results } = await c.env.DB.prepare(
        `SELECT id, real_name, year_code, seat_code, is_claimed, status, class_id
         FROM student_roster
         WHERE class_id = ?`
      ).bind(classId).all() as { results: any[] }

      const roster = buildFullStandardRoster((results || []).map((row) => {
        return {
          ...row,
          year_code: row.year_code || currentClass?.grade_year || '',
        }
      }))

      const questions = await getClassQuestions(c.env.DB, classId, false)

      return c.json({
        code: 200,
        message: 'success',
        class_id: classId,
        class_info: currentClass,
        classes: classGroups,
        roster,
        roster_layout: {
          columns: [...ROSTER_COLUMNS],
          rows: ROSTER_ROW_COUNT,
          total: TOTAL_STANDARD_SEATS,
        },
        security_questions: questions.map((q) => ({
          id: q.id,
          question: q.question,
        })),
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // ========================================
  // 1.1 GET /api/classes — 客户端获取班级列表（公开）
  // ========================================
  app.get('/api/classes', async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)
      const classGroups = await getAllClassGroups(c.env.DB)

      const data = []
      for (const classGroup of classGroups) {
        const stats = await c.env.DB.prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN is_claimed = 1 THEN 1 ELSE 0 END) AS claimed
           FROM student_roster
           WHERE class_id = ?`
        ).bind(classGroup.id).first<{ total: number; claimed: number }>()

        data.push({
          ...classGroup,
          total: stats?.total || 0,
          claimed: stats?.claimed || 0,
        })
      }

      return c.json({
        code: 200,
        message: 'success',
        classes: data,
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
      await ensureClassroomSchema(c.env.DB)

      const { roster_id, answers } = await c.req.json() as {
        roster_id?: number
        answers?: string[]
      }

      if (!roster_id || !Array.isArray(answers) || answers.length !== 3) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '???????? roster_id ?????',
          details: { required: ['roster_id', 'answers[3]'] },
        })
      }

      // 检查名录是否存在且未被认领
      const roster = await c.env.DB.prepare(
        'SELECT id, real_name, year_code, seat_code, is_claimed, class_id FROM student_roster WHERE id = ?'
      ).bind(roster_id).first() as any

      if (!roster) {
        return fail(c, 'CLAIM_ROSTER_NOT_FOUND')
      }

      if (roster.is_claimed === 1) {
        return fail(c, 'CLAIM_ROSTER_ALREADY_CLAIMED')
      }

      const classId = await resolveClassId(c.env.DB, roster.class_id)

      // 校验三道安全问题（明文答案 + 宽容匹配）
      const questions = await getClassQuestions(c.env.DB, classId, true) as Array<{
        id: number
        q_index: number
        question: string
        answer_text?: string
      }>

      if (questions.length !== 3) {
        return fail(c, 'CLAIM_SECURITY_CONFIG_INVALID')
      }

      for (let i = 0; i < 3; i++) {
        const questionId = questions[i].id
        const expectedAnswer = questions[i].answer_text || ''
        const inputAnswer = answers[i] || ''

        if (!isSecurityAnswerMatched(inputAnswer, expectedAnswer, questionId)) {
          return fail(c, 'CLAIM_SECURITY_ANSWER_MISMATCH', {
            message: `? ${i + 1} ????????`,
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
          class_id: classId,
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
  // ?????????: ${year_code}.${seat_code}${real_name}
  app.post('/api/user/claim/finalize', async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)

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
          message: 'password_hash ??????? SHA-256 hex?64???',
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

      // 2. ??????
      const roster = await c.env.DB.prepare(
        'SELECT id, real_name, year_code, seat_code, is_claimed, class_id FROM student_roster WHERE id = ?'
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
          message: '?? seat_code ??????????????????',
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

      // 8. 推送更新通知：通知该班级的所有用户（包括游客）刷新界面
      try {
        const classId = roster.class_id
        if (classId) {
          const pushPayload = {
            platform: "android",
            audience: {
              tag: [`classroom_${classId}`]
            },
            message: {
              msg_content: "ROSTER_UPDATE",
              title: "数据更新",
              extras: {
                action: "ROSTER_UPDATE",
                class_id: classId
              }
            }
          }
          // 不等待推送结果，异步执行（或者等待也没关系，JPush 响应很快）
          sendPushMessage(c.env, pushPayload).catch(e => console.error('Push error:', e))
        }
      } catch (pushErr) {
        console.error('Push notification failed:', pushErr)
      }

      const responseData = {
        user: {
          ...profile,
          class_id: roster.class_id || null,
        },
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
      await ensureUserProfileSessionColumns(c.env.DB)
      await ensureClassroomSchema(c.env.DB)

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
      const profileLookup = await c.env.DB.prepare(
        `SELECT p.id, p.username, p.email, r.id AS roster_id, r.year_code, r.seat_code, r.real_name
         FROM user_profiles p
         LEFT JOIN student_roster r ON r.profile_id = p.id
         WHERE p.username = ?`
      ).bind(username).first() as any

      if (!profileLookup) {
        return fail(c, 'LOGIN_FAILED')
      }

      let loginEmail: string | null = null
      if (profileLookup.roster_id && profileLookup.year_code && profileLookup.seat_code) {
        const standardSeatCode = toStandardSeatCode(profileLookup.seat_code)
        if (!standardSeatCode) {
          return fail(c, 'LOGIN_FAILED')
        }
        loginEmail = buildInternalAuthEmail({
          id: profileLookup.roster_id,
          year_code: profileLookup.year_code,
          seat_code: standardSeatCode,
        })
      } else if (profileLookup.email) {
        loginEmail = profileLookup.email
      }

      if (!loginEmail) {
        return fail(c, 'LOGIN_FAILED')
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: password_hash,
      })

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

      // TODO: ?????????? Resend.com??????
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
  // 10. POST /api/user/reset/confirm ? ??????
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
          message: 'new_password_hash ????',
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
  // 11. POST /api/user/reset/set-new ? ???????????????
  // 用于登录后检测到 reset_pending，在 App 内直接设置
  // ========================================
  app.post('/api/user/reset/self-service', async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)
      await ensureUserProfileSessionColumns(c.env.DB)

      const { class_id, username, answers, new_password_hash } = await c.req.json() as {
        class_id?: number | string
        username?: string
        answers?: string[]
        new_password_hash?: string
      }

      if (!username || !Array.isArray(answers) || answers.length !== 3 || !new_password_hash) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '缺少必要参数',
          details: { required: ['username', 'answers[3]', 'new_password_hash'] },
        })
      }

      if (new_password_hash.length !== 64) {
        return fail(c, 'PASSWORD_HASH_INVALID', {
          message: 'new_password_hash ????',
          details: { field: 'new_password_hash' },
        })
      }

      const profile = await c.env.DB.prepare(
        `SELECT
           p.id,
           p.supabase_uid,
           p.username,
           r.class_id,
           r.id AS roster_id
         FROM user_profiles p
         LEFT JOIN student_roster r ON r.profile_id = p.id
         WHERE p.username = ?`
      ).bind(username).first<{
        id: number
        supabase_uid: string
        username: string
        class_id: number | null
        roster_id: number | null
      }>()

      if (!profile || !profile.roster_id) {
        return fail(c, 'USER_NOT_FOUND')
      }

      const rosterClassId = await resolveClassId(c.env.DB, profile.class_id)
      const requestedClassId = class_id === undefined ? rosterClassId : await resolveClassIdStrict(c.env.DB, class_id)
      if (requestedClassId !== rosterClassId) {
        return fail(c, 'INVALID_FIELD', {
          message: 'class_id 与用户所属班级不一致',
          details: { field: 'class_id' },
        })
      }

      const resetChannel = await getResetChannelStatus(c.env.DB, rosterClassId)
      if (!resetChannel.open) {
        return fail(c, 'ADMIN_FORBIDDEN', {
          message: '当前班级未开启自助重置通道，请联系管理员',
          httpStatus: 403,
          details: {
            class_id: rosterClassId,
          },
        })
      }

      const questions = await getClassQuestions(c.env.DB, rosterClassId, true)
      if (questions.length !== 3) {
        return fail(c, 'CLAIM_SECURITY_CONFIG_INVALID')
      }

      for (let i = 0; i < 3; i++) {
        const question = questions[i]
        const input = answers[i] || ''
        const expected = question.answer_text || ''
        if (!isSecurityAnswerMatched(input, expected, question.id)) {
          return fail(c, 'CLAIM_SECURITY_ANSWER_MISMATCH', {
            message: `第 ${i + 1} 题答案不正确`,
            details: { question_index: i + 1, question_id: question.id },
          })
        }
      }

      const supabaseAdmin = getSupabaseAdmin(c.env)
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        profile.supabase_uid,
        { password: new_password_hash }
      )

      if (updateError) {
        return fail(c, 'PASSWORD_UPDATE_FAILED', {
          message: `密码更新失败: ${updateError.message}`,
        })
      }

      await c.env.DB.prepare(
        "UPDATE student_roster SET status = 'normal' WHERE profile_id = ?"
      ).bind(profile.id).run()

      return c.json({
        code: 200,
        message: '密码重置成功，请使用新密码登录',
        class_id: rosterClassId,
        channel_expires_at: resetChannel.expires_at || null,
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  app.post('/api/user/reset/set-new', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as any
      const { new_password_hash } = await c.req.json() as { new_password_hash?: string }

      if (!new_password_hash || new_password_hash.length !== 64) {
        return fail(c, 'PASSWORD_HASH_INVALID', {
          message: 'new_password_hash ????',
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
  // 12. GET /api/user/settings ? ????
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
  app.get('/api/admin/classes', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)

      const requester = c.get('user') as any
      const classes = await getAllClassGroups(c.env.DB)
      let visibleClasses = classes

      if (!isDevelopMasterRole(requester?.role)) {
        const managedClassIds = await getManagedClassIdsForUser(c.env.DB, Number(requester?.id || 0))
        if (managedClassIds.length === 0) {
          return fail(c, 'ADMIN_FORBIDDEN', {
            message: '当前账号未分配任何班级管理权限',
          })
        }
        visibleClasses = classes.filter((item) => managedClassIds.includes(item.id))
      }

      const data: any[] = []

      for (const classGroup of visibleClasses) {
        const stats = await c.env.DB.prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN is_claimed = 1 THEN 1 ELSE 0 END) AS claimed,
             SUM(CASE WHEN status = 'reset_pending' THEN 1 ELSE 0 END) AS reset_pending
           FROM student_roster
           WHERE class_id = ?`
        ).bind(classGroup.id).first<{ total: number; claimed: number; reset_pending: number }>()

        const channel = await getResetChannelStatus(c.env.DB, classGroup.id)
        data.push({
          ...classGroup,
          total: stats?.total || 0,
          claimed: stats?.claimed || 0,
          reset_pending: stats?.reset_pending || 0,
          reset_channel: channel,
        })
      }

      return c.json({
        code: 200,
        message: 'success',
        classes: data,
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  app.post('/api/admin/classes', authMiddleware, requireMaster, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)

      const body = await c.req.json() as {
        grade_year?: string
        class_name?: string
        display_name?: string
        is_active?: boolean | number
      }

      const gradeYear = String(body.grade_year || '').trim()
      const className = String(body.class_name || '').trim()
      const displayName = String(body.display_name || '').trim()
      const isActive = parseBooleanFlag(body.is_active, true) ? 1 : 0

      if (!gradeYear || !className) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '缺少 grade_year 或 class_name',
          details: { required: ['grade_year', 'class_name'] },
        })
      }

      const finalDisplayName = displayName || `${gradeYear}届 ${className}`
      const insertResult = await c.env.DB.prepare(
        `INSERT INTO class_groups (grade_year, class_name, display_name, is_active)
         VALUES (?, ?, ?, ?)`
      ).bind(gradeYear, className, finalDisplayName, isActive).run()

      const classId = Number(insertResult.meta.last_row_id || 0)
      const created = await getClassGroupById(c.env.DB, classId)

      return c.json({
        code: 200,
        message: '班级创建成功',
        class_info: created,
      })
    } catch (error: any) {
      if (String(error?.message || '').includes('UNIQUE')) {
        return fail(c, 'INVALID_FIELD', {
          message: '班级已存在（grade_year + class_name 不能重复）',
          details: { fields: ['grade_year', 'class_name'] },
        })
      }
      return serverError(c, error)
    }
  })

  app.put('/api/admin/classes/:id', authMiddleware, requireMaster, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)

      const classId = parseInt(c.req.param('id') || '', 10)
      if (Number.isNaN(classId) || classId <= 0) {
        return fail(c, 'INVALID_PARAMETER', {
          message: '班级 ID 不合法',
          details: { field: 'id' },
        })
      }

      const existingClass = await getClassGroupById(c.env.DB, classId)
      if (!existingClass) {
        return fail(c, 'INVALID_FIELD', {
          message: '班级不存在',
          details: { field: 'id' },
          httpStatus: 404,
        })
      }

      const body = await c.req.json() as {
        grade_year?: string
        class_name?: string
        display_name?: string
        is_active?: boolean | number
      }

      const updates: string[] = []
      const params: Array<string | number> = []

      if (body.grade_year !== undefined) {
        const gradeYear = String(body.grade_year).trim()
        if (!gradeYear) {
          return fail(c, 'INVALID_FIELD', {
            message: 'grade_year 不能为空',
            details: { field: 'grade_year' },
          })
        }
        updates.push('grade_year = ?')
        params.push(gradeYear)
      }

      if (body.class_name !== undefined) {
        const className = String(body.class_name).trim()
        if (!className) {
          return fail(c, 'INVALID_FIELD', {
            message: 'class_name 不能为空',
            details: { field: 'class_name' },
          })
        }
        updates.push('class_name = ?')
        params.push(className)
      }

      if (body.display_name !== undefined) {
        const displayName = String(body.display_name).trim()
        if (!displayName) {
          return fail(c, 'INVALID_FIELD', {
            message: 'display_name 不能为空',
            details: { field: 'display_name' },
          })
        }
        updates.push('display_name = ?')
        params.push(displayName)
      }

      if (body.is_active !== undefined) {
        updates.push('is_active = ?')
        params.push(parseBooleanFlag(body.is_active, true) ? 1 : 0)
      }

      if (updates.length === 0) {
        return fail(c, 'NO_VALID_FIELDS', {
          message: '???????',
        })
      }

      params.push(classId)
      await c.env.DB.prepare(
        `UPDATE class_groups SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...params).run()

      const updated = await getClassGroupById(c.env.DB, classId)
      return c.json({
        code: 200,
        message: '班级更新成功',
        class_info: updated,
      })
    } catch (error: any) {
      if (String(error?.message || '').includes('UNIQUE')) {
        return fail(c, 'INVALID_FIELD', {
          message: '班级已存在（grade_year + class_name 不能重复）',
          details: { fields: ['grade_year', 'class_name'] },
        })
      }
      return serverError(c, error)
    }
  })

  app.delete('/api/admin/classes/:id', authMiddleware, requireMaster, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)

      const classId = parseInt(c.req.param('id') || '', 10)
      if (Number.isNaN(classId) || classId <= 0) {
        return fail(c, 'INVALID_PARAMETER', {
          message: '班级 ID 不合法',
          details: { field: 'id' },
        })
      }

      const body = await c.req.json().catch(() => ({})) as {
        force?: boolean
        move_to_class_id?: number
      }
      const force = parseBooleanFlag(body.force, false)

      const classGroup = await getClassGroupById(c.env.DB, classId)
      if (!classGroup) {
        return fail(c, 'INVALID_FIELD', {
          message: '班级不存在',
          details: { field: 'id' },
          httpStatus: 404,
        })
      }

      const stats = await c.env.DB.prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN is_claimed = 1 THEN 1 ELSE 0 END) AS claimed
         FROM student_roster
         WHERE class_id = ?`
      ).bind(classId).first<{ total: number; claimed: number }>()

      const hasRoster = (stats?.total || 0) > 0
      if (hasRoster && !force) {
        return fail(c, 'INVALID_FIELD', {
          message: '该班级下仍有座位数据，请传入 force=true',
          details: { field: 'force', total: stats?.total || 0, claimed: stats?.claimed || 0 },
        })
      }

      const allClasses = await getAllClassGroups(c.env.DB)
      if (allClasses.length <= 1) {
        return fail(c, 'INVALID_FIELD', {
          message: '?????????????????????',
        })
      }

      let moveToClassId = body.move_to_class_id ? parseInt(String(body.move_to_class_id), 10) : 0
      if (!moveToClassId || moveToClassId === classId) {
        const fallback = allClasses.find((item) => item.id !== classId)
        moveToClassId = fallback?.id || 0
      }

      if (!moveToClassId || moveToClassId === classId) {
        return fail(c, 'INVALID_FIELD', {
          message: '???????????',
        })
      }

      if (hasRoster) {
        await c.env.DB.prepare(
          'UPDATE student_roster SET class_id = ? WHERE class_id = ?'
        ).bind(moveToClassId, classId).run()
      }

      await c.env.DB.prepare(
        'DELETE FROM class_security_questions WHERE class_id = ?'
      ).bind(classId).run()

      await c.env.DB.prepare(
        'DELETE FROM class_admin_roles WHERE class_id = ?'
      ).bind(classId).run()

      await c.env.DB.prepare(
        'DELETE FROM admin_runtime_flags WHERE flag_key = ?'
      ).bind(buildResetChannelFlagKey(classId)).run()

      await c.env.DB.prepare('DELETE FROM class_groups WHERE id = ?').bind(classId).run()

      return c.json({
        code: 200,
        message: '班级删除成功',
        deleted: {
          class_id: classId,
          moved_roster_to_class_id: moveToClassId,
          moved_roster_count: stats?.total || 0,
        },
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  app.get('/api/admin/classes/:id/admins', authMiddleware, requireMaster, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)
      const classId = await resolveClassIdStrict(c.env.DB, c.req.param('id'))
      const classInfo = await getClassGroupById(c.env.DB, classId)
      if (!classInfo) {
        return fail(c, 'INVALID_FIELD', {
          message: '班级不存在',
          details: { field: 'id' },
          httpStatus: 404,
        })
      }

      const { results } = await c.env.DB.prepare(
        `SELECT
           r.class_id,
           r.user_id,
           r.admin_role,
           r.created_at,
           r.updated_at,
           u.username,
           u.email,
           u.role
         FROM class_admin_roles r
         LEFT JOIN user_profiles u ON u.id = r.user_id
         WHERE r.class_id = ?
         ORDER BY CASE r.admin_role WHEN 'master' THEN 0 ELSE 1 END, r.user_id ASC`
      ).bind(classId).all() as { results: Array<any> }

      return c.json({
        code: 200,
        message: 'success',
        class_info: classInfo,
        admins: (results || []).map((row) => ({
          class_id: row.class_id,
          user_id: row.user_id,
          admin_role: row.admin_role,
          username: row.username || null,
          email: row.email || null,
          global_role: row.role || null,
          created_at: row.created_at || null,
          updated_at: row.updated_at || null,
        })),
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  app.post('/api/admin/classes/:id/admins', authMiddleware, requireMaster, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)
      const classId = await resolveClassIdStrict(c.env.DB, c.req.param('id'))
      const classInfo = await getClassGroupById(c.env.DB, classId)
      if (!classInfo) {
        return fail(c, 'INVALID_FIELD', {
          message: '班级不存在',
          details: { field: 'id' },
          httpStatus: 404,
        })
      }

      const body = await c.req.json() as {
        user_id?: number | string
        username?: string
        admin_role?: ClassAdminRoleValue
      }

      const adminRole = body.admin_role
      if (!adminRole || !['master', 'manager'].includes(adminRole)) {
        return fail(c, 'ROLE_INVALID', {
          message: 'admin_role 只能是 master / manager',
          details: { field: 'admin_role' },
        })
      }

      let targetUser: any = null
      if (body.user_id !== undefined && body.user_id !== null && body.user_id !== '') {
        const targetUserId = parseInt(String(body.user_id), 10)
        if (Number.isNaN(targetUserId) || targetUserId <= 0) {
          return fail(c, 'INVALID_PARAMETER', {
            message: 'user_id 不合法',
            details: { field: 'user_id' },
          })
        }
        targetUser = await c.env.DB.prepare(
          'SELECT id, username, email, role FROM user_profiles WHERE id = ?'
        ).bind(targetUserId).first()
      } else if (body.username) {
        targetUser = await c.env.DB.prepare(
          'SELECT id, username, email, role FROM user_profiles WHERE username = ?'
        ).bind(String(body.username).trim()).first()
      }

      if (!targetUser) {
        return fail(c, 'USER_NOT_FOUND')
      }

      await c.env.DB.prepare(
        `INSERT INTO class_admin_roles (class_id, user_id, admin_role, created_at, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(class_id, user_id) DO UPDATE SET
           admin_role = excluded.admin_role,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(classId, targetUser.id, adminRole).run()

      return c.json({
        code: 200,
        message: '班级管理员已保存',
        class_info: classInfo,
        admin: {
          class_id: classId,
          user_id: targetUser.id,
          admin_role: adminRole,
          username: targetUser.username || null,
          email: targetUser.email || null,
          global_role: targetUser.role || null,
        },
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  app.put('/api/admin/classes/:id/admins/:userId', authMiddleware, requireMaster, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)
      const classId = await resolveClassIdStrict(c.env.DB, c.req.param('id'))
      const userId = parseInt(c.req.param('userId') || '', 10)
      if (Number.isNaN(userId) || userId <= 0) {
        return fail(c, 'INVALID_PARAMETER', {
          message: 'userId 不合法',
          details: { field: 'userId' },
        })
      }

      const body = await c.req.json() as {
        admin_role?: ClassAdminRoleValue
      }

      const adminRole = body.admin_role
      if (!adminRole || !['master', 'manager'].includes(adminRole)) {
        return fail(c, 'ROLE_INVALID', {
          message: 'admin_role 只能是 master / manager',
          details: { field: 'admin_role' },
        })
      }

      const existing = await c.env.DB.prepare(
        'SELECT class_id, user_id FROM class_admin_roles WHERE class_id = ? AND user_id = ?'
      ).bind(classId, userId).first()
      if (!existing) {
        return fail(c, 'INVALID_FIELD', {
          message: '该班级管理员关系不存在',
          details: { class_id: classId, user_id: userId },
          httpStatus: 404,
        })
      }

      await c.env.DB.prepare(
        'UPDATE class_admin_roles SET admin_role = ?, updated_at = CURRENT_TIMESTAMP WHERE class_id = ? AND user_id = ?'
      ).bind(adminRole, classId, userId).run()

      return c.json({
        code: 200,
        message: '班级管理员权限已更新',
        admin: {
          class_id: classId,
          user_id: userId,
          admin_role: adminRole,
        },
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  app.delete('/api/admin/classes/:id/admins/:userId', authMiddleware, requireMaster, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)
      const classId = await resolveClassIdStrict(c.env.DB, c.req.param('id'))
      const userId = parseInt(c.req.param('userId') || '', 10)
      if (Number.isNaN(userId) || userId <= 0) {
        return fail(c, 'INVALID_PARAMETER', {
          message: 'userId 不合法',
          details: { field: 'userId' },
        })
      }

      const result = await c.env.DB.prepare(
        'DELETE FROM class_admin_roles WHERE class_id = ? AND user_id = ?'
      ).bind(classId, userId).run()

      if ((result.meta.changes || 0) <= 0) {
        return fail(c, 'INVALID_FIELD', {
          message: '该班级管理员关系不存在',
          details: { class_id: classId, user_id: userId },
          httpStatus: 404,
        })
      }

      return c.json({
        code: 200,
        message: '班级管理员已移除',
        deleted: {
          class_id: classId,
          user_id: userId,
        },
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  app.get('/api/admin/classes/:id/roster', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)

      const classId = await resolveClassIdStrict(c.env.DB, c.req.param('id'))
      const classAccess = await ensureClassAdminAccess(c, classId)
      if (classAccess instanceof Response) {
        return classAccess
      }

      const classInfo = await getClassGroupById(c.env.DB, classId)
      if (!classInfo) {
        return fail(c, 'INVALID_FIELD', {
          message: '班级不存在',
          details: { field: 'id' },
          httpStatus: 404,
        })
      }

      const { results } = await c.env.DB.prepare(
        `SELECT r.*, p.username, p.email AS profile_email
         FROM student_roster r
         LEFT JOIN user_profiles p ON p.id = r.profile_id
         WHERE r.class_id = ?`
      ).bind(classId).all() as { results: any[] }

      const roster = (results || [])
        .map((item) => withSeatCodeMeta(item))
        .sort(compareSeatCodeRows)

      return c.json({
        code: 200,
        message: 'success',
        class_info: classInfo,
        roster,
        roster_layout: {
          columns: [...ROSTER_COLUMNS],
          rows: ROSTER_ROW_COUNT,
          total: TOTAL_STANDARD_SEATS,
        },
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  app.post('/api/admin/classes/:id/roster', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)

      const classId = await resolveClassIdStrict(c.env.DB, c.req.param('id'))
      const classAccess = await ensureClassAdminAccess(c, classId)
      if (classAccess instanceof Response) {
        return classAccess
      }

      const classInfo = await getClassGroupById(c.env.DB, classId)
      if (!classInfo) {
        return fail(c, 'INVALID_FIELD', {
          message: '班级不存在',
          details: { field: 'id' },
          httpStatus: 404,
        })
      }

      const body = await c.req.json() as {
        real_name?: string
        seat_code?: string
        year_code?: string
        bound_email?: string | null
        status?: string
      }

      const realName = String(body.real_name || '').trim()
      if (!realName) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '缺少 real_name',
          details: { required: ['real_name'] },
        })
      }

      const normalizedSeatCode = normalizeSeatCodeForInsert(body.seat_code)
      if (!normalizedSeatCode) {
        return fail(c, 'INVALID_PARAMETER', {
          message: 'seat_code 格式错误，请使用 A01/B02 这种格式',
          details: { field: 'seat_code', expected_format: 'A01' },
        })
      }

      const yearCode = String(body.year_code || classInfo.grade_year || '').trim()
      if (!yearCode) {
        return fail(c, 'INVALID_FIELD', {
          message: 'year_code 不能为空',
          details: { field: 'year_code' },
        })
      }

      const boundEmail = body.bound_email === null || body.bound_email === '' ? null : String(body.bound_email || '').trim()
      if (boundEmail && !isValidEmail(boundEmail)) {
        return fail(c, 'EMAIL_INVALID')
      }

      const status = body.status === 'reset_pending' ? 'reset_pending' : 'normal'
      const insertResult = await c.env.DB.prepare(
        `INSERT INTO student_roster (real_name, year_code, seat_code, class_id, status, bound_email)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(realName, yearCode, normalizedSeatCode, classId, status, boundEmail).run()

      const rosterId = Number(insertResult.meta.last_row_id || 0)
      const created = await c.env.DB.prepare(
        `SELECT r.*, p.username, p.email AS profile_email
         FROM student_roster r
         LEFT JOIN user_profiles p ON p.id = r.profile_id
         WHERE r.id = ?`
      ).bind(rosterId).first()

      return c.json({
        code: 200,
        message: '座位添加成功',
        roster: created ? withSeatCodeMeta(created as any) : null,
      })
    } catch (error: any) {
      if (String(error?.message || '').includes('UNIQUE')) {
        return fail(c, 'ROSTER_ALREADY_EXISTS')
      }
      return serverError(c, error)
    }
  })

  app.put('/api/admin/classes/:id/roster/:rosterId', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)

      const classId = await resolveClassIdStrict(c.env.DB, c.req.param('id'))
      const classAccess = await ensureClassAdminAccess(c, classId)
      if (classAccess instanceof Response) {
        return classAccess
      }

      const rosterId = parseInt(c.req.param('rosterId') || '', 10)
      if (Number.isNaN(rosterId) || rosterId <= 0) {
        return fail(c, 'INVALID_PARAMETER', {
          message: 'rosterId 不合法',
          details: { field: 'rosterId' },
        })
      }

      const roster = await c.env.DB.prepare(
        'SELECT id, class_id, profile_id, is_claimed FROM student_roster WHERE id = ?'
      ).bind(rosterId).first<any>()

      if (!roster || roster.class_id !== classId) {
        return fail(c, 'CLAIM_ROSTER_NOT_FOUND')
      }

      const body = await c.req.json() as {
        real_name?: string
        year_code?: string
        seat_code?: string
        status?: string
        bound_email?: string | null
      }

      const seatCodeChanged = body.seat_code !== undefined
      const identityChanged = body.real_name !== undefined || body.year_code !== undefined || seatCodeChanged
      if (roster.is_claimed === 1 && identityChanged) {
        return fail(c, 'INVALID_FIELD', {
          message: '???????????????/??/??',
          details: { fields: ['real_name', 'year_code', 'seat_code'] },
        })
      }

      const updates: string[] = []
      const params: Array<string | number | null> = []

      if (body.real_name !== undefined) {
        const realName = String(body.real_name).trim()
        if (!realName) {
          return fail(c, 'INVALID_FIELD', {
            message: 'real_name 不能为空',
            details: { field: 'real_name' },
          })
        }
        updates.push('real_name = ?')
        params.push(realName)
      }

      if (body.year_code !== undefined) {
        const yearCode = String(body.year_code).trim()
        if (!yearCode) {
          return fail(c, 'INVALID_FIELD', {
            message: 'year_code 不能为空',
            details: { field: 'year_code' },
          })
        }
        updates.push('year_code = ?')
        params.push(yearCode)
      }

      if (seatCodeChanged) {
        const normalizedSeatCode = normalizeSeatCodeForInsert(body.seat_code)
        if (!normalizedSeatCode) {
          return fail(c, 'INVALID_PARAMETER', {
            message: 'seat_code 格式错误，请使用 A01/B02 这种格式',
            details: { field: 'seat_code', expected_format: 'A01' },
          })
        }
        updates.push('seat_code = ?')
        params.push(normalizedSeatCode)
      }

      if (body.status !== undefined) {
        if (!['normal', 'reset_pending'].includes(body.status)) {
          return fail(c, 'INVALID_FIELD', {
            message: 'status 只能是 normal 或 reset_pending',
            details: { field: 'status' },
          })
        }
        updates.push('status = ?')
        params.push(body.status)
      }

      if (body.bound_email !== undefined) {
        const boundEmail = body.bound_email === null || body.bound_email === '' ? null : String(body.bound_email).trim()
        if (boundEmail && !isValidEmail(boundEmail)) {
          return fail(c, 'EMAIL_INVALID')
        }
        updates.push('bound_email = ?')
        params.push(boundEmail)
      }

      if (updates.length === 0) {
        return fail(c, 'NO_VALID_FIELDS', {
          message: '???????',
        })
      }

      params.push(rosterId)
      await c.env.DB.prepare(
        `UPDATE student_roster SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...params).run()

      if (body.bound_email !== undefined && roster.profile_id) {
        const syncedEmail = body.bound_email === null || body.bound_email === '' ? null : String(body.bound_email).trim()
        await c.env.DB.prepare(
          'UPDATE user_profiles SET email = ? WHERE id = ?'
        ).bind(syncedEmail, roster.profile_id).run()
      }

      const updated = await c.env.DB.prepare(
        `SELECT r.*, p.username, p.email AS profile_email
         FROM student_roster r
         LEFT JOIN user_profiles p ON p.id = r.profile_id
         WHERE r.id = ?`
      ).bind(rosterId).first()

      return c.json({
        code: 200,
        message: '座位更新成功',
        roster: updated ? withSeatCodeMeta(updated as any) : null,
      })
    } catch (error: any) {
      if (String(error?.message || '').includes('UNIQUE')) {
        return fail(c, 'ROSTER_ALREADY_EXISTS')
      }
      return serverError(c, error)
    }
  })

  app.delete('/api/admin/classes/:id/roster/:rosterId', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)

      const classId = await resolveClassIdStrict(c.env.DB, c.req.param('id'))
      const classAccess = await ensureClassAdminAccess(c, classId)
      if (classAccess instanceof Response) {
        return classAccess
      }

      const rosterId = parseInt(c.req.param('rosterId') || '', 10)
      if (Number.isNaN(rosterId) || rosterId <= 0) {
        return fail(c, 'INVALID_PARAMETER', {
          message: 'rosterId 不合法',
          details: { field: 'rosterId' },
        })
      }

      const body = await c.req.json().catch(() => ({})) as { force?: boolean }
      const force = parseBooleanFlag(body.force, false)

      const roster = await c.env.DB.prepare(
        'SELECT id, class_id, is_claimed FROM student_roster WHERE id = ?'
      ).bind(rosterId).first<{ id: number; class_id: number; is_claimed: number }>()

      if (!roster || roster.class_id !== classId) {
        return fail(c, 'CLAIM_ROSTER_NOT_FOUND')
      }

      if (roster.is_claimed === 1) {
        if (!force) {
          return fail(c, 'INVALID_FIELD', {
            message: '该名录已认领，删除前请传入 force=true',
            details: { field: 'force' },
          })
        }

        if (!classAccess.isDevelopMaster && classAccess.classRole !== 'master') {
          return fail(c, 'MASTER_FORBIDDEN')
        }

        await c.env.DB.prepare(
          "UPDATE student_roster SET is_claimed = 0, profile_id = NULL, bound_email = NULL, status = 'normal' WHERE id = ?"
        ).bind(rosterId).run()
      }

      await c.env.DB.prepare('DELETE FROM claim_tokens WHERE roster_id = ?').bind(rosterId).run()
      await c.env.DB.prepare('DELETE FROM student_roster WHERE id = ?').bind(rosterId).run()

      return c.json({
        code: 200,
        message: '座位删除成功',
        deleted: {
          class_id: classId,
          roster_id: rosterId,
          force,
        },
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  app.get('/api/admin/classes/:id/security-questions', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)
      const classId = await resolveClassIdStrict(c.env.DB, c.req.param('id'))
      const classAccess = await ensureClassAdminAccess(c, classId)
      if (classAccess instanceof Response) {
        return classAccess
      }

      const classInfo = await getClassGroupById(c.env.DB, classId)
      if (!classInfo) {
        return fail(c, 'INVALID_FIELD', {
          message: '班级不存在',
          details: { field: 'id' },
          httpStatus: 404,
        })
      }

      const questions = await getClassQuestions(c.env.DB, classId, true)
      return c.json({
        code: 200,
        message: 'success',
        class_info: classInfo,
        questions: questions.map((q) => ({
          id: q.id,
          question: q.question,
          answer_text: q.answer_text || '',
        })),
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  app.put('/api/admin/classes/:id/security-questions', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)
      const classId = await resolveClassIdStrict(c.env.DB, c.req.param('id'))
      const classAccess = await ensureClassAdminAccess(c, classId)
      if (classAccess instanceof Response) {
        return classAccess
      }

      const body = await c.req.json() as {
        questions?: Array<{ id?: number; question?: string; answer_text?: string }>
        answers?: string[]
      }

      const existing = await getClassQuestions(c.env.DB, classId, true)
      let finalQuestions: Array<{ q_index: number; question: string; answer_text: string }> = []

      if (Array.isArray(body.questions) && body.questions.length === 3) {
        finalQuestions = body.questions.map((item, index) => {
          const qIndex = index + 1
          const current = existing.find((row) => row.id === qIndex)
          const question = String(item.question || current?.question || '').trim()
          const answerText = String(item.answer_text || '').trim()
          return {
            q_index: qIndex,
            question,
            answer_text: answerText,
          }
        })
      } else if (Array.isArray(body.answers) && body.answers.length === 3) {
        finalQuestions = body.answers.map((answer, index) => {
          const qIndex = index + 1
          const current = existing.find((row) => row.id === qIndex)
          return {
            q_index: qIndex,
            question: String(current?.question || ''),
            answer_text: String(answer || '').trim(),
          }
        })
      } else {
        return fail(c, 'QUESTION_ANSWERS_INVALID')
      }

      for (const item of finalQuestions) {
        if (!item.question || !item.answer_text) {
          return fail(c, 'INVALID_FIELD', {
            message: '问题和答案都不能为空',
            details: {
              q_index: item.q_index,
              question_empty: !item.question,
              answer_empty: !item.answer_text,
            },
          })
        }
      }

      for (const item of finalQuestions) {
        await c.env.DB.prepare(
          `INSERT INTO class_security_questions (class_id, q_index, question, answer_text)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(class_id, q_index) DO UPDATE SET
             question = excluded.question,
             answer_text = excluded.answer_text`
        ).bind(classId, item.q_index, item.question, item.answer_text).run()
      }

      const updated = await getClassQuestions(c.env.DB, classId, true)
      return c.json({
        code: 200,
        message: '班级安全问题已更新',
        class_id: classId,
        questions: updated.map((q) => ({
          id: q.id,
          question: q.question,
          answer_text: q.answer_text || '',
        })),
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  app.post('/api/admin/classes/:id/reset-claims', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)
      const classId = await resolveClassIdStrict(c.env.DB, c.req.param('id'))
      const classAccess = await ensureClassAdminAccess(c, classId)
      if (classAccess instanceof Response) {
        return classAccess
      }

      const body = await c.req.json().catch(() => ({})) as {
        action?: 'unclaim' | 'mark_reset_pending'
        roster_ids?: number[]
      }

      const action = body.action === 'mark_reset_pending' ? 'mark_reset_pending' : 'unclaim'
      const rosterIds = Array.isArray(body.roster_ids)
        ? body.roster_ids.map((id) => parseInt(String(id), 10)).filter((id) => Number.isInteger(id) && id > 0)
        : []

      const targetRowsResult = rosterIds.length > 0
        ? await c.env.DB.prepare(
            `SELECT id, is_claimed
             FROM student_roster
             WHERE class_id = ? AND id IN (${buildSqlInPlaceholders(rosterIds.length)})`
          ).bind(classId, ...rosterIds).all() as { results: Array<{ id: number; is_claimed: number }> }
        : await c.env.DB.prepare(
            'SELECT id, is_claimed FROM student_roster WHERE class_id = ?'
          ).bind(classId).all() as { results: Array<{ id: number; is_claimed: number }> }

      const targetRows = targetRowsResult.results || []
      if (targetRows.length === 0) {
        return c.json({
          code: 200,
          message: '没有可处理的数据',
          action,
          affected: 0,
        })
      }

      if (action === 'mark_reset_pending') {
        const claimIds = targetRows.filter((item) => item.is_claimed === 1).map((item) => item.id)
        if (claimIds.length > 0) {
          await c.env.DB.prepare(
            `UPDATE student_roster SET status = 'reset_pending'
             WHERE class_id = ? AND id IN (${buildSqlInPlaceholders(claimIds.length)})`
          ).bind(classId, ...claimIds).run()
        }

        return c.json({
          code: 200,
          message: '?????????????',
          action,
          affected: claimIds.length,
        })
      }

      const allIds = targetRows.map((item) => item.id)
      await c.env.DB.prepare(
        `UPDATE student_roster
         SET is_claimed = 0, profile_id = NULL, bound_email = NULL, status = 'normal'
         WHERE class_id = ? AND id IN (${buildSqlInPlaceholders(allIds.length)})`
      ).bind(classId, ...allIds).run()

      await c.env.DB.prepare(
        `DELETE FROM claim_tokens WHERE roster_id IN (${buildSqlInPlaceholders(allIds.length)})`
      ).bind(...allIds).run()

      return c.json({
        code: 200,
        message: '操作已完成',
        action,
        affected: allIds.length,
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  app.get('/api/admin/classes/:id/reset-channel', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)
      const classId = await resolveClassIdStrict(c.env.DB, c.req.param('id'))
      const classAccess = await ensureClassAdminAccess(c, classId)
      if (classAccess instanceof Response) {
        return classAccess
      }
      const status = await getResetChannelStatus(c.env.DB, classId)
      return c.json({
        code: 200,
        message: 'success',
        class_id: classId,
        reset_channel: status,
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  app.post('/api/admin/classes/:id/reset-channel', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)
      const classId = await resolveClassIdStrict(c.env.DB, c.req.param('id'))
      const classAccess = await ensureClassAdminAccess(c, classId)
      if (classAccess instanceof Response) {
        return classAccess
      }
      const body = await c.req.json().catch(() => ({})) as {
        open?: boolean
        ttl_minutes?: number
      }

      const open = parseBooleanFlag(body.open, true)
      const ttlRaw = Number(body.ttl_minutes || 60)
      const ttlMinutes = Math.max(5, Math.min(24 * 60, Number.isFinite(ttlRaw) ? Math.floor(ttlRaw) : 60))
      const now = new Date()
      const expiresAt = open
        ? new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString()
        : now.toISOString()

      await c.env.DB.prepare(
        `INSERT INTO admin_runtime_flags (flag_key, flag_value, expires_at, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(flag_key) DO UPDATE SET
           flag_value = excluded.flag_value,
           expires_at = excluded.expires_at,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(buildResetChannelFlagKey(classId), open ? '1' : '0', expiresAt).run()

      const status = await getResetChannelStatus(c.env.DB, classId)
      return c.json({
        code: 200,
        message: open ? '通道已开启' : '通道已关闭',
        class_id: classId,
        reset_channel: status,
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  app.get('/api/admin/roster', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)

      const requester = c.get('user') as any
      const classIdQuery = c.req.query('class_id')
      let scopedClassIds: number[] = []

      if (isDevelopMasterRole(requester?.role)) {
        if (classIdQuery) {
          scopedClassIds = [await resolveClassIdStrict(c.env.DB, classIdQuery)]
        }
      } else {
        const managedClassIds = await getManagedClassIdsForUser(c.env.DB, Number(requester?.id || 0))
        if (managedClassIds.length === 0) {
          return fail(c, 'ADMIN_FORBIDDEN', {
            message: '当前账号未分配任何班级管理权限',
          })
        }

        if (classIdQuery) {
          const classId = await resolveClassIdStrict(c.env.DB, classIdQuery)
          if (!managedClassIds.includes(classId)) {
            return fail(c, 'ADMIN_FORBIDDEN', {
              message: '不允许操作其他班级数据',
              details: { class_id: classId },
            })
          }
          scopedClassIds = [classId]
        } else {
          scopedClassIds = managedClassIds
        }
      }

      const whereSql = scopedClassIds.length > 0
        ? `WHERE r.class_id IN (${buildSqlInPlaceholders(scopedClassIds.length)})`
        : ''

      const { results } = await c.env.DB.prepare(
        `SELECT r.*, p.username, p.email as profile_email
         FROM student_roster r
         LEFT JOIN user_profiles p ON r.profile_id = p.id
          ${whereSql}`
      ).bind(...scopedClassIds).all() as { results: any[] }

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
      await ensureClassroomSchema(c.env.DB)

      const { real_name, year_code, seat_code, class_id } = await c.req.json() as {
        real_name?: string
        year_code?: string
        seat_code?: string
        class_id?: number | string
      }

      if (!real_name || !seat_code) {
        return fail(c, 'MISSING_PARAMETER', {
          message: '缺少必要字段',
          details: { required: ['real_name', 'seat_code'] },
        })
      }

      const classId = await resolveScopedClassIdForAdmin(c, class_id)
      if (classId instanceof Response) return classId

      const normalizedSeat = normalizeSeatCodeForInsert(seat_code)
      if (!normalizedSeat) {
        return fail(c, 'INVALID_PARAMETER', {
          message: '座位号格式不合法 (如 A01, B08)',
          details: { field: 'seat_code' }
        })
      }

      const existing = await c.env.DB.prepare(
        'SELECT id FROM student_roster WHERE class_id = ? AND seat_code = ?'
      ).bind(classId, normalizedSeat).first()

      if (existing) {
        return fail(c, 'ROSTER_ALREADY_EXISTS', {
          message: '该座位号在当前班级已存在',
          details: { seat_code: normalizedSeat }
        })
      }

      await c.env.DB.prepare(
        `INSERT INTO student_roster (real_name, year_code, seat_code, class_id, is_claimed, status)
         VALUES (?, ?, ?, ?, 0, 'normal')`
      ).bind(real_name.trim(), (year_code || '').trim(), normalizedSeat, classId).run()

      return c.json({
        code: 200,
        message: '名录条目已添加',
        roster: {
          real_name,
          year_code,
          seat_code: normalizedSeat,
          class_id: classId
        }
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // 21. GET /api/admin/dashboard - overview for management console
  app.get('/api/admin/dashboard', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureUserProfileSessionColumns(c.env.DB)
      await ensureClassroomSchema(c.env.DB)

      const requester = c.get('user') as any
      const isDevelopMaster = isDevelopMasterRole(requester.role)

      if (isDevelopMaster) {
        const [usersResult, rosterResult, tokenResult] = await c.env.DB.batch([
          c.env.DB.prepare(
            `SELECT 
               COUNT(*) AS total_users,
               SUM(CASE WHEN role = 'master' THEN 1 ELSE 0 END) AS master_users,
               SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admin_users,
               SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS normal_users
             FROM user_profiles`
          ),
          c.env.DB.prepare(
            `SELECT 
               COUNT(*) AS total_roster,
               SUM(CASE WHEN is_claimed = 1 THEN 1 ELSE 0 END) AS claimed_roster,
               SUM(CASE WHEN is_claimed = 0 THEN 1 ELSE 0 END) AS unclaimed_roster
             FROM student_roster`
          ),
          c.env.DB.prepare(
            "SELECT COUNT(*) AS active_tokens FROM claim_tokens WHERE used = 0 AND datetime(expires_at) > datetime('now')"
          ),
        ])

        const users = usersResult.results[0] as any
        const roster = rosterResult.results[0] as any
        const token = tokenResult.results[0] as any

        return c.json({
          code: 200,
          stats: {
            users,
            roster,
            active_tokens: token.active_tokens || 0,
          },
        })
      } else {
        // Scoped for class admins
        const managedClassIds = await getManagedClassIdsForUser(c.env.DB, requester.id)
        if (managedClassIds.length === 0) {
          return c.json({
            code: 200,
            stats: {
              users: { total_users: 0, master_users: 0, admin_users: 0, normal_users: 0 },
              roster: { total_roster: 0, claimed_roster: 0, unclaimed_roster: 0 },
              active_tokens: 0,
            },
          })
        }

        const placeholders = buildSqlInPlaceholders(managedClassIds.length)
        const [usersResult, rosterResult, tokenResult] = await c.env.DB.batch([
          c.env.DB.prepare(
            `SELECT 
               COUNT(DISTINCT p.id) AS total_users,
               SUM(CASE WHEN p.role = 'user' THEN 1 ELSE 0 END) AS normal_users
             FROM user_profiles p
             INNER JOIN student_roster r ON r.profile_id = p.id
             WHERE r.class_id IN (${placeholders})`
          ).bind(...managedClassIds),
          c.env.DB.prepare(
            `SELECT 
               COUNT(*) AS total_roster,
               SUM(CASE WHEN is_claimed = 1 THEN 1 ELSE 0 END) AS claimed_roster,
               SUM(CASE WHEN is_claimed = 0 THEN 1 ELSE 0 END) AS unclaimed_roster
             FROM student_roster
             WHERE class_id IN (${placeholders})`
          ).bind(...managedClassIds),
          c.env.DB.prepare(
            `SELECT COUNT(*) AS active_tokens
             FROM claim_tokens t
             INNER JOIN student_roster r ON t.roster_id = r.id
             WHERE r.class_id IN (${placeholders})
               AND t.used = 0
               AND datetime(t.expires_at) > datetime('now')`
          ).bind(...managedClassIds),
        ])

        const users = usersResult.results[0] as any
        const roster = rosterResult.results[0] as any
        const token = tokenResult.results[0] as any

        return c.json({
          code: 200,
          stats: {
            users: {
              total_users: users.total_users || 0,
              master_users: 0,
              admin_users: 0,
              normal_users: users.normal_users || 0,
            },
            roster,
            active_tokens: token.active_tokens || 0,
          },
        })
      }
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // 22. GET /api/admin/users - list all user profiles with optional keyword filtering
  app.get('/api/admin/users', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureUserProfileSessionColumns(c.env.DB)
      await ensureClassroomSchema(c.env.DB)

      const requester = c.get('user') as any
      const keyword = (c.req.query('keyword') || '').trim()
      const role = (c.req.query('role') || '').trim()
      const limit = parsePageNumber(c.req.query('limit'), 100, 1, 500)
      const offset = parsePageNumber(c.req.query('offset'), 0, 0, 50000)

      if (role && !['user', 'admin', 'master', 'develop_master'].includes(role)) {
        return fail(c, 'ROLE_INVALID', {
          message: 'role 只能是 user / admin / master / develop_master',
          details: { field: 'role' },
        })
      }

      const whereParts: string[] = []
      const whereParams: Array<string | number> = []

      // Scoped access for class admins
      if (!isDevelopMasterRole(requester.role)) {
        const managedClassIds = await getManagedClassIdsForUser(c.env.DB, requester.id)
        if (managedClassIds.length === 0) {
          return c.json({
            code: 200,
            message: 'success',
            users: [],
            pagination: { total: 0, limit, offset },
          })
        }
        whereParts.push(`r.class_id IN (${buildSqlInPlaceholders(managedClassIds.length)})`)
        whereParams.push(...managedClassIds)
      }

      if (role) {
        whereParts.push('p.role = ?')
        whereParams.push(role)
      }

      if (keyword) {
        const like = `%${keyword}%`
        whereParts.push(
          "(p.username LIKE ? OR IFNULL(p.email, '') LIKE ? OR IFNULL(r.real_name, '') LIKE ? OR IFNULL(r.seat_code, '') LIKE ?)"
        )
        whereParams.push(like, like, like, like)
      }

      const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''

      const countResult = await c.env.DB.prepare(
        `SELECT COUNT(*) AS total
         FROM user_profiles p
         LEFT JOIN student_roster r ON r.profile_id = p.id
         ${whereSql}`
      ).bind(...whereParams).first<{ total: number }>()

      const { results } = await c.env.DB.prepare(
        `SELECT 
           p.id,
           p.supabase_uid,
           p.username,
           p.email,
           p.level,
           p.role,
           p.avatar_url,
           p.created_at,
           p.last_android_device_id,
           p.last_android_session_at,
           r.id AS roster_id,
           r.real_name AS roster_real_name,
           r.year_code AS roster_year_code,
           r.seat_code AS roster_seat_code,
           r.is_claimed AS roster_is_claimed,
           r.status AS roster_status,
           r.bound_email AS roster_bound_email,
           r.class_id AS roster_class_id
         FROM user_profiles p
         LEFT JOIN student_roster r ON r.profile_id = p.id
         ${whereSql}
         ORDER BY p.created_at DESC, p.id DESC
         LIMIT ? OFFSET ?`
      ).bind(...whereParams, limit, offset).all() as { results: any[] }

      const users = (results || []).map((row) => {
        const roster = row.roster_id
          ? withSeatCodeMeta({
              id: row.roster_id,
              real_name: row.roster_real_name,
              year_code: row.roster_year_code,
              seat_code: row.roster_seat_code,
              is_claimed: row.roster_is_claimed,
              status: row.roster_status,
              bound_email: row.roster_bound_email,
              class_id: row.roster_class_id,
            })
          : null

        return {
          id: row.id,
          supabase_uid: row.supabase_uid,
          username: row.username,
          email: row.email,
          level: row.level,
          role: row.role,
          avatar_url: row.avatar_url,
          created_at: row.created_at,
          last_android_device_id: row.last_android_device_id,
          last_android_session_at: row.last_android_session_at,
          roster,
        }
      })

      return c.json({
        code: 200,
        message: 'success',
        users,
        pagination: {
          total: countResult?.total || 0,
          limit,
          offset,
        },
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // 23. PUT /api/admin/users/:id - update user profile fields
  app.put('/api/admin/users/:id', authMiddleware, requireMaster, async (c) => {
    try {
      const requester = c.get('user') as any
      const userId = parseInt(c.req.param('id') || '', 10)
      if (Number.isNaN(userId) || userId <= 0) {
        return fail(c, 'INVALID_PARAMETER', {
          message: '用户 ID 不合法',
          details: { field: 'id' },
        })
      }

      const body = await c.req.json() as {
        username?: string
        email?: string | null
        level?: number
        avatar_url?: string | null
        role?: string
      }

      const target = await c.env.DB.prepare(
        'SELECT id, role FROM user_profiles WHERE id = ?'
      ).bind(userId).first<{ id: number; role: string }>()

      if (!target) {
        return fail(c, 'USER_NOT_FOUND')
      }

      if (requester.id === target.id && body.role && body.role !== target.role) {
        return fail(c, 'INVALID_FIELD', {
          message: '不能通过该接口修改自己的角色',
          details: { field: 'role' },
        })
      }

      const updates: string[] = []
      const params: Array<string | number | null> = []

      if (body.username !== undefined) {
        const username = body.username.trim()
        if (!username) {
          return fail(c, 'INVALID_FIELD', {
            message: 'username 不能为空',
            details: { field: 'username' },
          })
        }
        updates.push('username = ?')
        params.push(username)
      }

      if (body.email !== undefined) {
        const email = body.email === null || body.email === '' ? null : String(body.email).trim()
        if (email && !isValidEmail(email)) {
          return fail(c, 'EMAIL_INVALID')
        }
        updates.push('email = ?')
        params.push(email)
      }

      if (body.level !== undefined) {
        if (!Number.isInteger(body.level) || body.level < 1 || body.level > 100) {
          return fail(c, 'INVALID_FIELD', {
            message: 'level 必须是 1-100 的整数',
            details: { field: 'level' },
          })
        }
        updates.push('level = ?')
        params.push(body.level)
      }

      if (body.avatar_url !== undefined) {
        const avatarUrl = body.avatar_url === null || body.avatar_url === '' ? null : String(body.avatar_url).trim()
        updates.push('avatar_url = ?')
        params.push(avatarUrl)
      }

      if (body.role !== undefined) {
        if (!isDevelopMasterRole(requester.role)) {
          return fail(c, 'MASTER_FORBIDDEN')
        }

        if (!['user', 'admin', 'master', 'develop_master'].includes(body.role)) {
          return fail(c, 'ROLE_INVALID', {
            message: 'role 只能是 user / admin / master / develop_master',
            details: { field: 'role' },
          })
        }

        updates.push('role = ?')
        params.push(body.role)
      }

      if (updates.length === 0) {
        return fail(c, 'NO_VALID_FIELDS', {
          message: '没有需要更新的字段',
        })
      }

      params.push(userId)
      await c.env.DB.prepare(
        `UPDATE user_profiles SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...params).run()

      if (body.email !== undefined) {
        const syncedEmail = body.email === null || body.email === '' ? null : String(body.email).trim()
        await c.env.DB.prepare(
          'UPDATE student_roster SET bound_email = ? WHERE profile_id = ?'
        ).bind(syncedEmail, userId).run()
      }

      const updated = await c.env.DB.prepare(
        `SELECT
           p.id, p.supabase_uid, p.username, p.email, p.level, p.role, p.avatar_url, p.created_at,
           p.last_android_device_id, p.last_android_session_at,
           r.id AS roster_id, r.real_name, r.year_code, r.seat_code, r.is_claimed, r.status, r.bound_email, r.class_id
         FROM user_profiles p
         LEFT JOIN student_roster r ON r.profile_id = p.id
         WHERE p.id = ?`
      ).bind(userId).first() as any

      if (!updated) {
        return fail(c, 'USER_NOT_FOUND')
      }

      const roster = updated.roster_id
        ? withSeatCodeMeta({
            id: updated.roster_id,
            real_name: updated.real_name,
            year_code: updated.year_code,
            seat_code: updated.seat_code,
            is_claimed: updated.is_claimed,
            status: updated.status,
            bound_email: updated.bound_email,
            class_id: updated.class_id,
          })
        : null

      return c.json({
        code: 200,
        message: '用户资料已更新',
        user: {
          id: updated.id,
          supabase_uid: updated.supabase_uid,
          username: updated.username,
          email: updated.email,
          level: updated.level,
          role: updated.role,
          avatar_url: updated.avatar_url,
          created_at: updated.created_at,
          last_android_device_id: updated.last_android_device_id,
          last_android_session_at: updated.last_android_session_at,
          roster,
        },
      })
    } catch (error: any) {
      if (String(error?.message || '').includes('UNIQUE')) {
        return fail(c, 'INVALID_FIELD', {
          message: 'username 已存在',
          details: { field: 'username' },
        })
      }
      return serverError(c, error)
    }
  })

  // 24. DELETE /api/admin/users/:id - remove user profile
  app.delete('/api/admin/users/:id', authMiddleware, requireMaster, async (c) => {
    try {
      const requester = c.get('user') as any
      const userId = parseInt(c.req.param('id') || '', 10)
      if (Number.isNaN(userId) || userId <= 0) {
        return fail(c, 'INVALID_PARAMETER', {
          message: '用户 ID 不合法',
        })
      }

      const body = await c.req.json().catch(() => ({})) as {
        delete_supabase_auth?: boolean
        unclaim_roster?: boolean
      }

      const deleteSupabaseAuth = parseBooleanFlag(body.delete_supabase_auth, true)
      const unclaimRoster = parseBooleanFlag(body.unclaim_roster, true)

      const profile = await c.env.DB.prepare(
        'SELECT id, supabase_uid, username, role FROM user_profiles WHERE id = ?'
      ).bind(userId).first() as any

      if (!profile) {
        return fail(c, 'USER_NOT_FOUND')
      }

      if (requester.id === profile.id) {
        return fail(c, 'INVALID_FIELD', {
          message: '不能删除当前登录管理员自己',
        })
      }

      const { results: linkedRosters } = await c.env.DB.prepare(
        'SELECT id FROM student_roster WHERE profile_id = ?'
      ).bind(userId).all() as { results: Array<{ id: number }> }

      if ((linkedRosters || []).length > 0 && !unclaimRoster) {
        return fail(c, 'INVALID_FIELD', {
          message: '该用户仍关联座位，请先解除认领或传入 unclaim_roster=true',
        })
      }

      if (deleteSupabaseAuth && profile.supabase_uid) {
        const supabaseAdmin = getSupabaseAdmin(c.env)
        await supabaseAdmin.auth.admin.deleteUser(profile.supabase_uid)
      }

      if ((linkedRosters || []).length > 0) {
        const rosterIds = linkedRosters.map((item) => item.id)
        const placeholders = buildSqlInPlaceholders(rosterIds.length)
        await c.env.DB.prepare(
          `UPDATE student_roster
           SET is_claimed = 0, profile_id = NULL, bound_email = NULL, status = 'normal'
           WHERE id IN (${placeholders})`
        ).bind(...rosterIds).run()

        await c.env.DB.prepare(
          `DELETE FROM claim_tokens WHERE roster_id IN (${placeholders})`
        ).bind(...rosterIds).run()
      }

      await c.env.DB.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(userId).run()
      await c.env.DB.prepare('DELETE FROM user_profiles WHERE id = ?').bind(userId).run()

      return c.json({
        code: 200,
        message: '用户已删除',
        deleted: {
          user_id: userId,
          username: profile.username,
        },
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // 25. PUT /api/admin/roster/:id - update roster row
  app.put('/api/admin/roster/:id', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)
      const rosterId = parseInt(c.req.param('id') || '', 10)
      if (Number.isNaN(rosterId) || rosterId <= 0) {
        return fail(c, 'INVALID_PARAMETER', { message: '名录 ID 不合法' })
      }

      const body = await c.req.json() as {
        real_name?: string
        year_code?: string
        seat_code?: string
        status?: string
        bound_email?: string | null
      }

      const roster = await c.env.DB.prepare(
        'SELECT id, class_id, profile_id, is_claimed FROM student_roster WHERE id = ?'
      ).bind(rosterId).first() as any

      if (!roster) return fail(c, 'CLAIM_ROSTER_NOT_FOUND')

      const classAccess = await ensureClassAdminAccess(c, Number(roster.class_id || 0))
      if (classAccess instanceof Response) return classAccess

      if (roster.is_claimed === 1 && (body.real_name || body.year_code || body.seat_code)) {
        return fail(c, 'INVALID_FIELD', { message: '已认领名录禁止修改核心信息，请先解除认领' })
      }

      const updates: string[] = []
      const params: Array<string | number | null> = []

      if (body.real_name !== undefined) {
        const val = body.real_name.trim()
        if (val) { updates.push('real_name = ?'); params.push(val) }
      }
      if (body.year_code !== undefined) {
        const val = body.year_code.trim()
        updates.push('year_code = ?'); params.push(val)
      }
      if (body.seat_code !== undefined) {
        const normalizedSeat = normalizeSeatCodeForInsert(body.seat_code)
        if (!normalizedSeat) return fail(c, 'INVALID_PARAMETER', { message: '座位号不合法' })
        updates.push('seat_code = ?'); params.push(normalizedSeat)
      }
      if (body.status !== undefined) {
        updates.push('status = ?'); params.push(body.status)
      }
      if (body.bound_email !== undefined) {
        const email = body.bound_email === null || body.bound_email === '' ? null : String(body.bound_email).trim()
        if (email && !isValidEmail(email)) return fail(c, 'EMAIL_INVALID')
        updates.push('bound_email = ?'); params.push(email)
      }

      if (updates.length === 0) {
        return fail(c, 'NO_VALID_FIELDS', { message: '没有需要更新的字段' })
      }

      params.push(rosterId)
      await c.env.DB.prepare(
        `UPDATE student_roster SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...params).run()

      if (body.bound_email !== undefined && roster.profile_id) {
        const syncedEmail = body.bound_email === null || body.bound_email === '' ? null : String(body.bound_email).trim()
        await c.env.DB.prepare(
          'UPDATE user_profiles SET email = ? WHERE id = ?'
        ).bind(syncedEmail, roster.profile_id).run()
      }

      const updatedRaw = await c.env.DB.prepare(
        `SELECT r.*, p.username, p.email as profile_email
         FROM student_roster r
         LEFT JOIN user_profiles p ON r.profile_id = p.id
         WHERE r.id = ?`
      ).bind(rosterId).first() as any

      return c.json({
        code: 200,
        message: '名录已更新',
        roster: updatedRaw ? withSeatCodeMeta(updatedRaw) : null,
      })
    } catch (error: any) {
      if (String(error?.message || '').includes('UNIQUE')) {
        return fail(c, 'ROSTER_ALREADY_EXISTS')
      }
      return serverError(c, error)
    }
  })

  // 26. DELETE /api/admin/roster/:id - delete roster row
  app.delete('/api/admin/roster/:id', authMiddleware, requireAdmin, async (c) => {
    try {
      await ensureClassroomSchema(c.env.DB)
      const rosterId = parseInt(c.req.param('id') || '', 10)
      if (Number.isNaN(rosterId) || rosterId <= 0) {
        return fail(c, 'INVALID_PARAMETER', {
          message: '名录 ID 不合法',
          details: { field: 'id' },
        })
      }

      const body = await c.req.json().catch(() => ({})) as { force?: boolean }
      const force = parseBooleanFlag(body.force, false)

      const roster = await c.env.DB.prepare(
        'SELECT id, class_id, profile_id, is_claimed FROM student_roster WHERE id = ?'
      ).bind(rosterId).first() as any

      if (!roster) {
        return fail(c, 'CLAIM_ROSTER_NOT_FOUND')
      }

      const classAccess = await ensureClassAdminAccess(c, Number(roster.class_id || 0))
      if (classAccess instanceof Response) {
        return classAccess
      }

      if (roster.is_claimed === 1) {
        if (!force) {
          return fail(c, 'INVALID_FIELD', {
            message: '该名录已认领，删除前请传入 force=true',
            details: { field: 'force' },
          })
        }

        if (!classAccess.isDevelopMaster && classAccess.classRole !== 'master') {
          return fail(c, 'MASTER_FORBIDDEN')
        }

        await c.env.DB.prepare(
          "UPDATE student_roster SET is_claimed = 0, profile_id = NULL, bound_email = NULL, status = 'normal' WHERE id = ?"
        ).bind(rosterId).run()
      }

      await c.env.DB.prepare('DELETE FROM claim_tokens WHERE roster_id = ?').bind(rosterId).run()
      await c.env.DB.prepare('DELETE FROM student_roster WHERE id = ?').bind(rosterId).run()

      return c.json({
        code: 200,
        message: '名录已删除',
        deleted: {
          roster_id: rosterId,
          was_claimed: roster.is_claimed === 1,
          force,
        },
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })

  // 27. POST /api/admin/maintenance/cleanup-claims - one-click cleanup for claim flow test cycles
  app.post('/api/admin/maintenance/cleanup-claims', authMiddleware, requireMaster, async (c) => {
    try {
      const body = await c.req.json().catch(() => ({})) as {
        dry_run?: boolean
        clear_claimed_roster?: boolean
        clear_claim_tokens?: boolean
        clear_internal_profiles?: boolean
        delete_supabase_auth?: boolean
      }

      const dryRun = parseBooleanFlag(body.dry_run, false)
      const clearClaimedRoster = parseBooleanFlag(body.clear_claimed_roster, true)
      const clearClaimTokens = parseBooleanFlag(body.clear_claim_tokens, true)
      const clearInternalProfiles = parseBooleanFlag(body.clear_internal_profiles, true)
      const deleteSupabaseAuth = parseBooleanFlag(body.delete_supabase_auth, true)

      const { results: linkedProfiles } = await c.env.DB.prepare(
        `SELECT
           p.id,
           p.supabase_uid,
           p.username,
           r.id AS roster_id,
           r.is_claimed
         FROM user_profiles p
         INNER JOIN student_roster r ON r.profile_id = p.id`
      ).all() as { results: Array<{ id: number; supabase_uid: string; username: string; roster_id: number; is_claimed: number }> }

      const claimedCountResult = await c.env.DB.prepare(
        'SELECT COUNT(*) AS count FROM student_roster WHERE is_claimed = 1'
      ).first<{ count: number }>()

      const activeTokenCountResult = await c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM claim_tokens WHERE used = 0 AND datetime(expires_at) > datetime('now')"
      ).first<{ count: number }>()

      if (dryRun) {
        return c.json({
          code: 200,
          message: 'dry_run completed',
          preview: {
            linked_profile_count: (linkedProfiles || []).length,
            claimed_roster_count: claimedCountResult?.count || 0,
            active_claim_token_count: activeTokenCountResult?.count || 0,
            linked_profiles: (linkedProfiles || []).map((item) => ({
              id: item.id,
              username: item.username,
              roster_id: item.roster_id,
              is_claimed: item.is_claimed,
            })),
          },
          options: {
            clear_claimed_roster: clearClaimedRoster,
            clear_claim_tokens: clearClaimTokens,
            clear_internal_profiles: clearInternalProfiles,
            delete_supabase_auth: deleteSupabaseAuth,
          },
        })
      }

      if (clearClaimedRoster) {
        await c.env.DB.prepare(
          "UPDATE student_roster SET is_claimed = 0, profile_id = NULL, bound_email = NULL, status = 'normal' WHERE is_claimed = 1"
        ).run()
      }

      if (clearClaimTokens) {
        await c.env.DB.prepare('DELETE FROM claim_tokens').run()
      }

      let deletedD1Profiles = 0
      let deletedSupabaseUsers = 0
      const supabaseDeleteFailures: Array<{ profile_id: number; username: string; error: string }> = []

      if (clearInternalProfiles && (linkedProfiles || []).length > 0) {
        const profileIdsToDelete: number[] = []

        if (deleteSupabaseAuth) {
          const supabaseAdmin = getSupabaseAdmin(c.env)
          for (const profile of linkedProfiles) {
            if (!profile.supabase_uid) {
              profileIdsToDelete.push(profile.id)
              continue
            }

            const { error } = await supabaseAdmin.auth.admin.deleteUser(profile.supabase_uid)
            if (error) {
              supabaseDeleteFailures.push({
                profile_id: profile.id,
                username: profile.username,
                error: error.message,
              })
              continue
            }

            deletedSupabaseUsers++
            profileIdsToDelete.push(profile.id)
          }
        } else {
          profileIdsToDelete.push(...linkedProfiles.map((item) => item.id))
        }

        if (profileIdsToDelete.length > 0) {
          const placeholders = buildSqlInPlaceholders(profileIdsToDelete.length)
          await c.env.DB.prepare(
            `DELETE FROM user_settings WHERE user_id IN (${placeholders})`
          ).bind(...profileIdsToDelete).run()

          await c.env.DB.prepare(
            `DELETE FROM user_profiles WHERE id IN (${placeholders})`
          ).bind(...profileIdsToDelete).run()

          deletedD1Profiles = profileIdsToDelete.length
        }
      }

      return c.json({
        code: 200,
        message: 'cleanup completed',
        result: {
          claimed_roster_cleared: clearClaimedRoster,
          claim_tokens_cleared: clearClaimTokens,
          d1_profiles_deleted: deletedD1Profiles,
          supabase_users_deleted: deletedSupabaseUsers,
          supabase_delete_failures: supabaseDeleteFailures,
        },
      })
    } catch (error: any) {
      return serverError(c, error)
    }
  })
}


