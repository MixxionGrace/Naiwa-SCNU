import Koa from 'koa'
import Router from '@koa/router'
import bodyParser from 'koa-bodyparser'
import { fileURLToPath } from 'node:url'
import { getBearerToken, login, logout, requireAdmin } from './auth.js'
import { GroupStore } from './store.js'

function parseKeywords(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[,，、\n]+/)
  const uniqueKeywords = []
  const seen = new Set()

  for (const item of source) {
    const keyword = String(item).trim()
    const normalized = keyword.toLocaleLowerCase('zh-CN')
    if (!keyword || seen.has(normalized)) continue
    seen.add(normalized)
    uniqueKeywords.push(keyword)
  }

  return uniqueKeywords
}

function validateGroupPayload(body) {
  const name = String(body?.name ?? '').trim()
  const keywords = parseKeywords(body?.keywords)
  const qq = String(body?.qq ?? '').replace(/\s+/g, '')
  const fields = {}

  if (!name || name.length > 80) fields.name = '群名需为 1–80 个字符。'
  if (!keywords.length || keywords.length > 20) {
    fields.keywords = '请填写 1–20 个关键词。'
  } else if (keywords.some((keyword) => keyword.length > 40)) {
    fields.keywords = '每个关键词不能超过 40 个字符。'
  }
  if (!/^\d{5,12}$/.test(qq)) fields.qq = 'QQ 群号应为 5–12 位数字。'

  if (Object.keys(fields).length) {
    const error = new Error('请检查填写内容。')
    error.status = 422
    error.fields = fields
    throw error
  }

  return { name, keywords, qq }
}

export function createApp({ store = new GroupStore() } = {}) {
  const app = new Koa()
  const router = new Router()
  app.proxy = true

  app.use(async (ctx, next) => {
    try {
      await next()
      if (ctx.status === 404 && !ctx.body) ctx.body = { error: '接口不存在。' }
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500
      ctx.status = status
      ctx.body = {
        error: status >= 500 ? '服务器暂时开小差了。' : error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      }
      if (status >= 500) ctx.app.emit('error', error, ctx)
    }
  })

  app.use(async (ctx, next) => {
    ctx.set('X-Content-Type-Options', 'nosniff')
    ctx.set('X-Frame-Options', 'DENY')
    ctx.set('Referrer-Policy', 'same-origin')
    await next()
  })

  app.use(
    bodyParser({
      enableTypes: ['json'],
      jsonLimit: '64kb',
      strict: true,
    }),
  )

  router.get('/api/health', (ctx) => {
    ctx.body = { ok: true }
  })

  router.get('/api/groups', async (ctx) => {
    ctx.set('Cache-Control', 'no-store')
    ctx.body = await store.list({
      query: ctx.query.q,
      page: ctx.query.page,
      pageSize: ctx.query.pageSize,
    })
  })

  router.post('/api/auth/login', (ctx) => {
    ctx.set('Cache-Control', 'no-store')
    const result = login({
      username: ctx.request.body?.username,
      password: ctx.request.body?.password,
      ip: ctx.ip,
    })

    if (!result.ok) {
      ctx.status = result.status
      if (result.retryAfter) ctx.set('Retry-After', String(result.retryAfter))
      ctx.body = { error: result.message }
      return
    }

    ctx.body = result
  })

  router.post('/api/auth/logout', requireAdmin, (ctx) => {
    logout(getBearerToken(ctx))
    ctx.body = { ok: true }
  })

  router.get('/api/admin/groups', requireAdmin, async (ctx) => {
    ctx.body = await store.list({
      query: ctx.query.q,
      page: ctx.query.page,
      pageSize: ctx.query.pageSize,
    })
  })

  router.post('/api/admin/groups', requireAdmin, async (ctx) => {
    const input = validateGroupPayload(ctx.request.body)
    ctx.status = 201
    ctx.body = { item: await store.create(input) }
  })

  router.put('/api/admin/groups/:id', requireAdmin, async (ctx) => {
    const input = validateGroupPayload(ctx.request.body)
    const group = await store.update(ctx.params.id, input)

    if (!group) {
      ctx.status = 404
      ctx.body = { error: '没有找到这个群。' }
      return
    }

    ctx.body = { item: group }
  })

  router.delete('/api/admin/groups/:id', requireAdmin, async (ctx) => {
    const group = await store.remove(ctx.params.id)

    if (!group) {
      ctx.status = 404
      ctx.body = { error: '没有找到这个群。' }
      return
    }

    ctx.body = { ok: true }
  })

  app.use(router.routes())
  app.use(router.allowedMethods())
  app.on('error', (error) => {
    console.error('[naiwa-scnu-api]', error)
  })

  return app
}

const isEntryPoint = process.argv[1] === fileURLToPath(import.meta.url)

if (isEntryPoint) {
  const port = Number.parseInt(process.env.PORT || '3001', 10)
  const host = process.env.HOST || '127.0.0.1'
  const app = createApp()
  app.listen(port, host, () => {
    console.log(`Naiwa SCNU API listening on http://${host}:${port}`)
  })
}
