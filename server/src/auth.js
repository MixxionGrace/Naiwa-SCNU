import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const ADMIN_USERNAME = 'MixxionGrace'
const ADMIN_PASSWORD_SALT = 'd875ba91ae87caf6dcdcbb5630feecae'
const ADMIN_PASSWORD_HASH =
  'f7d0f1bb6813ccb31c462fc4591c783931af5239f23da8035433bce81641f7e827bfd1a68d632ec7ccd846e209a776930d2266049deebb60a054551a8da6d137'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const MAX_LOGIN_ATTEMPTS = 5

const sessions = new Map()
const loginAttempts = new Map()

function safeStringEqual(first, second) {
  const firstBuffer = Buffer.from(String(first))
  const secondBuffer = Buffer.from(String(second))

  if (firstBuffer.length !== secondBuffer.length) {
    timingSafeEqual(secondBuffer, secondBuffer)
    return false
  }

  return timingSafeEqual(firstBuffer, secondBuffer)
}

function verifyCredentials(username, password) {
  const usernameMatches = safeStringEqual(username, ADMIN_USERNAME)
  const suppliedHash = scryptSync(
    String(password ?? ''),
    ADMIN_PASSWORD_SALT,
    64,
  )
  const expectedHash = Buffer.from(ADMIN_PASSWORD_HASH, 'hex')
  const passwordMatches = timingSafeEqual(suppliedHash, expectedHash)

  return usernameMatches && passwordMatches
}

function cleanupSessions() {
  const now = Date.now()
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(token)
  }
}

function getAttemptRecord(ip) {
  const now = Date.now()
  const current = loginAttempts.get(ip)

  if (!current || current.resetAt <= now) {
    const next = { count: 0, resetAt: now + LOGIN_WINDOW_MS }
    loginAttempts.set(ip, next)
    return next
  }

  return current
}

export function login({ username, password, ip }) {
  const attempt = getAttemptRecord(ip)

  if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
    return {
      ok: false,
      status: 429,
      message: '尝试次数过多，请稍后再试。',
      retryAfter: Math.max(1, Math.ceil((attempt.resetAt - Date.now()) / 1000)),
    }
  }

  if (!verifyCredentials(username, password)) {
    attempt.count += 1
    return { ok: false, status: 401, message: '账号或密码错误。' }
  }

  loginAttempts.delete(ip)
  cleanupSessions()

  const token = randomBytes(32).toString('hex')
  const expiresAt = Date.now() + SESSION_TTL_MS
  sessions.set(token, { username: ADMIN_USERNAME, expiresAt })

  return {
    ok: true,
    token,
    expiresAt: new Date(expiresAt).toISOString(),
    user: { username: ADMIN_USERNAME },
  }
}

export function getBearerToken(ctx) {
  const authorization = ctx.get('authorization')
  const match = authorization.match(/^Bearer\s+([a-f0-9]{64})$/i)
  return match?.[1] || ''
}

export async function requireAdmin(ctx, next) {
  const token = getBearerToken(ctx)
  const session = token ? sessions.get(token) : null

  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token)
    ctx.status = 401
    ctx.body = { error: '登录已过期，请重新登录。' }
    return
  }

  ctx.state.admin = session
  ctx.state.adminToken = token
  ctx.set('Cache-Control', 'no-store')
  await next()
}

export function logout(token) {
  if (token) sessions.delete(token)
}
