import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const ACCOUNTS = Object.freeze([
  {
    username: 'MixxionGrace',
    role: 'superadmin',
    passwordSalt: 'd875ba91ae87caf6dcdcbb5630feecae',
    passwordHash:
      'f7d0f1bb6813ccb31c462fc4591c783931af5239f23da8035433bce81641f7e827bfd1a68d632ec7ccd846e209a776930d2266049deebb60a054551a8da6d137',
  },
  {
    username: 'luodan',
    role: 'user',
    passwordSalt: '39a913ebe77551591f29c0b68291f59d',
    passwordHash:
      'fbbb58f6187abb0b4530f6feeafdc01aa532988e83a5819936fa5b174684f94e616d169353825f320dc7a961265976c0fcb8e826b7e2d4c8da30887f0d678e4d',
  },
  {
    username: 'renyusheng',
    role: 'user',
    passwordSalt: '9d0a90b489c1647615a0f149e958d956',
    passwordHash:
      '2b93d1bd9f2cb88b2c7ce2a110b6556f6c6b1e54011d474669573f306394532d2990b201e716031ed533c84b27545e17ce1983d0bba8299b7867c464911b034d',
  },
])
const DUMMY_PASSWORD_SALT = '3c7b58674fe1b4d2df1e8164275efe80'
const DUMMY_PASSWORD_HASH =
  '595b016668a233aaf3e30abfa6a0541348aec22b8a15c81c8beb88e4cf19d3eeb7899d69b224ca94d8cefa3fe053cee13fcdd1c9d971baee03713399658268cf'
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
  const account = ACCOUNTS.find((candidate) =>
    safeStringEqual(username, candidate.username),
  )
  const suppliedHash = scryptSync(
    String(password ?? ''),
    account?.passwordSalt || DUMMY_PASSWORD_SALT,
    64,
  )
  const expectedHash = Buffer.from(
    account?.passwordHash || DUMMY_PASSWORD_HASH,
    'hex',
  )
  const passwordMatches = timingSafeEqual(suppliedHash, expectedHash)

  return account && passwordMatches ? account : null
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

export function login({ username, password, ip, portal = '' }) {
  const attempt = getAttemptRecord(ip)

  if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
    return {
      ok: false,
      status: 429,
      message: '尝试次数过多，请稍后再试。',
      retryAfter: Math.max(1, Math.ceil((attempt.resetAt - Date.now()) / 1000)),
    }
  }

  const account = verifyCredentials(username, password)
  if (!account) {
    attempt.count += 1
    return { ok: false, status: 401, message: '账号或密码错误。' }
  }

  if (portal === 'admin' && account.role !== 'superadmin') {
    loginAttempts.delete(ip)
    return { ok: false, status: 403, message: '该账号没有管理端权限。' }
  }

  loginAttempts.delete(ip)
  cleanupSessions()

  const token = randomBytes(32).toString('hex')
  const expiresAt = Date.now() + SESSION_TTL_MS
  sessions.set(token, {
    username: account.username,
    role: account.role,
    expiresAt,
  })

  return {
    ok: true,
    token,
    expiresAt: new Date(expiresAt).toISOString(),
    user: { username: account.username, role: account.role },
  }
}

export function getBearerToken(ctx) {
  const authorization = ctx.get('authorization')
  const match = authorization.match(/^Bearer\s+([a-f0-9]{64})$/i)
  return match?.[1] || ''
}

function resolveSession(ctx) {
  const token = getBearerToken(ctx)
  const session = token ? sessions.get(token) : null

  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token)
    return { token: '', session: null }
  }

  return { token, session }
}

export async function requireSession(ctx, next) {
  const { token, session } = resolveSession(ctx)
  if (!session) {
    ctx.status = 401
    ctx.body = { error: '登录已过期，请重新登录。' }
    return
  }

  ctx.state.user = session
  ctx.state.authToken = token
  ctx.set('Cache-Control', 'no-store')
  await next()
}

export async function requireAdmin(ctx, next) {
  await requireSession(ctx, async () => {
    if (ctx.state.user.role !== 'superadmin') {
      ctx.status = 403
      ctx.body = { error: '该账号没有管理端权限。' }
      return
    }

    ctx.state.admin = ctx.state.user
    ctx.state.adminToken = ctx.state.authToken
    await next()
  })
}

export function logout(token) {
  if (token) sessions.delete(token)
}
