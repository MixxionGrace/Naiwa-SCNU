import Koa from 'koa'
import Router from '@koa/router'
import bodyParser from 'koa-bodyparser'
import { fileURLToPath } from 'node:url'
import {
  ActivityImageStore,
  isActivityImageUrl,
} from './activity-image-store.js'
import { ActivityApplicationStore, ActivityStore } from './activity-store.js'
import { ApplicationStore } from './application-store.js'
import { getBearerToken, login, logout, requireAdmin } from './auth.js'
import { MetricsStore } from './metrics-store.js'
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

function validateApplicationPayload(body) {
  const group = validateGroupPayload(body)
  const applicantQq = String(body?.applicantQq ?? '').replace(/\s+/g, '')

  if (!/^\d{5,12}$/.test(applicantQq)) {
    const error = new Error('请检查填写内容。')
    error.status = 422
    error.fields = { applicantQq: '申请人 QQ 号应为 5–12 位数字。' }
    throw error
  }

  return { ...group, applicantQq }
}

const validActivityModes = new Set(['online', 'offline'])
const MAX_ACTIVITY_IMAGE_BYTES = 900 * 1024

function validateActivityPayload(
  body,
  {
    includeApplicant = false,
    includePinned = false,
    includeImage = false,
  } = {},
) {
  const title = String(body?.title ?? '').trim()
  const content = String(body?.content ?? '').trim()
  const groupName = String(body?.groupName ?? '').trim()
  const groupQq = String(body?.groupQq ?? '').replace(/\s+/g, '')
  const rawTimes = Array.isArray(body?.times) ? body.times : []
  const rawModes = Array.isArray(body?.modes) ? body.modes : []
  const timeTbd = body?.timeTbd === true
  const fields = {}

  const times = [...new Set(
    rawTimes
      .map((value) => new Date(value))
      .filter((value) => Number.isFinite(value.getTime()))
      .map((value) => {
        value.setUTCSeconds(0, 0)
        return value.toISOString()
      }),
  )].sort()
  const modes = [...new Set(rawModes.map((value) => String(value).trim()))].filter(
    (mode) => validActivityModes.has(mode),
  )

  if (!title || title.length > 100) fields.title = '活动标题需为 1–100 个字符。'
  if (!content || content.length > 2000) {
    fields.content = '活动内容需为 1–2000 个字符。'
  }
  if (!groupName || groupName.length > 80) {
    fields.groupName = '群名需为 1–80 个字符。'
  }
  if (!/^\d{5,12}$/.test(groupQq)) fields.groupQq = 'QQ 群号应为 5–12 位数字。'
  if (body?.timeTbd !== undefined && typeof body.timeTbd !== 'boolean') {
    fields.timeTbd = '活动时间待定状态格式不正确。'
  }
  if (timeTbd && rawTimes.length) {
    fields.times = '活动时间待定时请勿填写具体时间。'
  } else if (
    !timeTbd &&
    (!rawTimes.length || rawTimes.length > 20 || times.length !== rawTimes.length)
  ) {
    fields.times = '请选择 1–20 个有效且不重复的活动时间。'
  }
  if (!rawModes.length || rawModes.length > 2 || modes.length !== rawModes.length) {
    fields.modes = '请选择线上、线下，或同时选择两者。'
  }

  let applicantQq
  if (includeApplicant) {
    applicantQq = String(body?.applicantQq ?? '').replace(/\s+/g, '')
    if (!/^\d{5,12}$/.test(applicantQq)) {
      fields.applicantQq = '申请人 QQ 号应为 5–12 位数字。'
    }
  }

  let pinned = false
  if (includePinned) {
    if (typeof body?.pinned !== 'boolean') fields.pinned = '置顶状态格式不正确。'
    pinned = Boolean(body?.pinned)
  }

  let imageUrl = ''
  if (includeImage) {
    imageUrl = String(body?.imageUrl ?? '').trim()
    if (imageUrl && !isActivityImageUrl(imageUrl)) {
      fields.imageUrl = '活动图片地址格式不正确，请重新上传。'
    }
  }

  if (Object.keys(fields).length) {
    const error = new Error('请检查填写内容。')
    error.status = 422
    error.fields = fields
    throw error
  }

  return {
    title,
    content,
    groupName,
    groupQq,
    times: timeTbd ? [] : times,
    timeTbd,
    modes,
    ...(includeApplicant ? { applicantQq } : {}),
    ...(includePinned ? { pinned } : {}),
    ...(includeImage ? { imageUrl } : {}),
  }
}

function validateQqQuery(value) {
  const qq = String(value ?? '').replace(/\s+/g, '')
  if (!/^\d{5,12}$/.test(qq)) {
    const error = new Error('QQ 群号应为 5–12 位数字。')
    error.status = 422
    error.fields = { qq: error.message }
    throw error
  }
  return qq
}

function createApiError(status, message, code = '') {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

function duplicateApplicationError(status) {
  if (status === 'approved') {
    return createApiError(
      409,
      '这个 QQ 群已经审核通过了，请刷新页面试试。',
      'ALREADY_APPROVED',
    )
  }
  return createApiError(409, '这个 QQ 群已经在审核中了。', 'ALREADY_PENDING')
}

function readBinaryRequest(request, maximumBytes) {
  const declaredSize = Number.parseInt(request.headers['content-length'] || '0', 10)
  if (Number.isFinite(declaredSize) && declaredSize > maximumBytes) {
    throw createApiError(413, '图片不能超过 900 KB。')
  }

  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false

    request.on('data', (chunk) => {
      size += chunk.length
      if (size > maximumBytes) {
        tooLarge = true
        chunks.length = 0
        return
      }
      if (!tooLarge) chunks.push(chunk)
    })
    request.on('end', () => {
      if (tooLarge) {
        reject(createApiError(413, '图片不能超过 900 KB。'))
        return
      }
      resolve(Buffer.concat(chunks))
    })
    request.on('error', reject)
  })
}

export function createApp({
  store = new GroupStore(),
  metricsStore = new MetricsStore(),
  applicationStore = new ApplicationStore(),
  activityStore = new ActivityStore(),
  activityApplicationStore = new ActivityApplicationStore(),
  activityImageStore = new ActivityImageStore(),
} = {}) {
  const app = new Koa()
  const router = new Router()
  let reviewQueue = Promise.resolve()
  app.proxy = true

  const runReviewOperation = (operation) => {
    const result = reviewQueue.then(operation, operation)
    reviewQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const removeActivityImageSafely = async (imageUrl) => {
    if (!imageUrl) return
    try {
      await activityImageStore.removeByUrl(imageUrl)
    } catch (error) {
      app.emit('error', error)
    }
  }

  const getApplicationStatus = async (qq, { excludeApplicationId = '' } = {}) => {
    const approved = await store.findByQq(qq)
    if (approved) return { status: 'approved', item: approved }

    const pending = await applicationStore.findPendingByQq(qq, {
      excludeId: excludeApplicationId,
    })
    if (pending) return { status: 'pending', item: pending }

    return { status: 'available', item: null }
  }

  app.use(async (ctx, next) => {
    try {
      await next()
      if (ctx.status === 404 && !ctx.body) ctx.body = { error: '接口不存在。' }
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500
      ctx.status = status
      ctx.body = {
        error: status >= 500 ? '服务器暂时开小差了。' : error.message,
        ...(error.code ? { code: error.code } : {}),
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
    ctx.body = {
      ok: true,
      imageStorage: activityImageStore.provider,
    }
  })

  router.get('/api/activity-images/:filename', async (ctx) => {
    const image = await activityImageStore.get(ctx.params.filename)
    if (!image) {
      ctx.status = 404
      ctx.body = { error: '没有找到这张活动图片。' }
      return
    }

    ctx.type = image.contentType
    ctx.length = image.size
    ctx.set('Cache-Control', 'public, max-age=31536000, immutable')
    ctx.body = image.buffer
  })

  router.get('/api/groups', async (ctx) => {
    ctx.set('Cache-Control', 'no-store')
    // 公开接口只读取已审核通过的群库；待审核申请保存在独立的 ApplicationStore 中。
    ctx.body = await store.list({
      query: ctx.query.q,
      page: ctx.query.page,
      pageSize: ctx.query.pageSize,
    })
  })

  router.get('/api/group-applications/check', async (ctx) => {
    ctx.set('Cache-Control', 'no-store')
    const qq = validateQqQuery(ctx.query.qq)
    const result = await getApplicationStatus(qq)
    ctx.body = {
      status: result.status,
      message:
        result.status === 'approved'
          ? '这个 QQ 群已经审核通过了，请刷新页面试试。'
          : result.status === 'pending'
            ? '这个 QQ 群已经在审核中了。'
            : '这个 QQ 群号可以提交申请。',
    }
  })

  router.post('/api/group-applications', async (ctx) => {
    ctx.set('Cache-Control', 'no-store')
    const input = validateApplicationPayload(ctx.request.body)
    const application = await runReviewOperation(async () => {
      const duplicate = await getApplicationStatus(input.qq)
      if (duplicate.status !== 'available') {
        throw duplicateApplicationError(duplicate.status)
      }
      return applicationStore.create(input)
    })

    ctx.status = 201
    ctx.body = {
      item: {
        id: application.id,
        status: application.status,
        createdAt: application.createdAt,
      },
    }
  })

  router.get('/api/activities', async (ctx) => {
    ctx.set('Cache-Control', 'no-store')
    // 公开活动与待审核申请分库存放，申请人 QQ 不会出现在此接口。
    ctx.body = await activityStore.list({
      query: ctx.query.q,
      page: ctx.query.page,
      pageSize: ctx.query.pageSize,
    })
  })

  router.post('/api/activity-applications', async (ctx) => {
    ctx.set('Cache-Control', 'no-store')
    const input = validateActivityPayload(ctx.request.body, {
      includeApplicant: true,
    })
    const application = await activityApplicationStore.create(input)

    ctx.status = 201
    ctx.body = {
      item: {
        id: application.id,
        status: application.status,
        createdAt: application.createdAt,
      },
    }
  })

  router.get('/api/metrics/pv', async (ctx) => {
    ctx.set('Cache-Control', 'no-store')
    ctx.body = await metricsStore.getPv()
  })

  router.post('/api/metrics/pv', async (ctx) => {
    ctx.set('Cache-Control', 'no-store')
    ctx.body = await metricsStore.incrementPv()
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
    const result = await runReviewOperation(async () => {
      const pending = await applicationStore.findPendingByQq(input.qq)
      if (pending) throw duplicateApplicationError('pending')
      return store.createUnique(input)
    })

    if (result.duplicate) throw duplicateApplicationError('approved')
    ctx.status = 201
    ctx.body = { item: result.item }
  })

  router.put('/api/admin/groups/:id', requireAdmin, async (ctx) => {
    const input = validateGroupPayload(ctx.request.body)
    const result = await runReviewOperation(async () => {
      const pending = await applicationStore.findPendingByQq(input.qq)
      if (pending) throw duplicateApplicationError('pending')
      return store.updateUnique(ctx.params.id, input)
    })

    if (result.missing) {
      ctx.status = 404
      ctx.body = { error: '没有找到这个群。' }
      return
    }

    if (result.duplicate) throw duplicateApplicationError('approved')

    ctx.body = { item: result.item }
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

  router.get('/api/admin/applications', requireAdmin, async (ctx) => {
    ctx.body = await applicationStore.list({
      query: ctx.query.q,
      status: 'pending',
      page: ctx.query.page,
      pageSize: ctx.query.pageSize,
    })
  })

  router.put('/api/admin/applications/:id', requireAdmin, async (ctx) => {
    const input = validateApplicationPayload(ctx.request.body)
    const result = await runReviewOperation(async () => {
      const duplicate = await getApplicationStatus(input.qq, {
        excludeApplicationId: ctx.params.id,
      })
      if (duplicate.status !== 'available') {
        throw duplicateApplicationError(duplicate.status)
      }
      return applicationStore.updatePending(ctx.params.id, input)
    })

    if (result.reason === 'missing') {
      ctx.status = 404
      ctx.body = { error: '没有找到这条申请。' }
      return
    }
    if (result.reason === 'reviewed') {
      throw createApiError(409, '这条申请已经完成审核。', 'ALREADY_REVIEWED')
    }

    ctx.body = { item: result.item }
  })

  router.post('/api/admin/applications/:id/approve', requireAdmin, async (ctx) => {
    const result = await runReviewOperation(async () => {
      const applications = await applicationStore.readAll()
      const application = applications.find((item) => item.id === ctx.params.id)

      if (!application) return { reason: 'missing', item: null, group: null }
      if (application.status !== 'pending') {
        return { reason: 'reviewed', item: null, group: null }
      }

      const duplicate = await store.findByQq(application.qq)
      if (duplicate) throw duplicateApplicationError('approved')

      const created = await store.createUnique({
        name: application.name,
        keywords: application.keywords,
        qq: application.qq,
      })
      if (created.duplicate) throw duplicateApplicationError('approved')

      try {
        const reviewed = await applicationStore.review(ctx.params.id, 'approved', {
          approvedGroupId: created.item.id,
        })
        if (reviewed.reason) {
          await store.remove(created.item.id)
          return { reason: reviewed.reason, item: null, group: null }
        }
        return { reason: '', item: reviewed.item, group: created.item }
      } catch (error) {
        await store.remove(created.item.id)
        throw error
      }
    })

    if (result.reason === 'missing') {
      ctx.status = 404
      ctx.body = { error: '没有找到这条申请。' }
      return
    }
    if (result.reason === 'reviewed') {
      throw createApiError(409, '这条申请已经完成审核。', 'ALREADY_REVIEWED')
    }

    ctx.body = { item: result.item, group: result.group }
  })

  router.post('/api/admin/applications/:id/reject', requireAdmin, async (ctx) => {
    const result = await runReviewOperation(() =>
      applicationStore.review(ctx.params.id, 'rejected'),
    )

    if (result.reason === 'missing') {
      ctx.status = 404
      ctx.body = { error: '没有找到这条申请。' }
      return
    }
    if (result.reason === 'reviewed') {
      throw createApiError(409, '这条申请已经完成审核。', 'ALREADY_REVIEWED')
    }

    ctx.body = { item: result.item }
  })

  router.get('/api/admin/activities', requireAdmin, async (ctx) => {
    ctx.body = await activityStore.list({
      query: ctx.query.q,
      page: ctx.query.page,
      pageSize: ctx.query.pageSize,
    })
  })

  router.post('/api/admin/activities', requireAdmin, async (ctx) => {
    const input = validateActivityPayload(ctx.request.body, {
      includePinned: true,
      includeImage: true,
    })
    const activity = await activityStore.create(input)

    ctx.status = 201
    ctx.body = { item: activity }
  })

  router.post('/api/admin/activity-images', requireAdmin, async (ctx) => {
    const contentType = ctx.get('content-type').split(';')[0].toLowerCase()
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
      throw createApiError(415, '仅支持 JPG、PNG 或 WebP 图片。')
    }

    const buffer = await readBinaryRequest(ctx.req, MAX_ACTIVITY_IMAGE_BYTES)
    if (!buffer.length) throw createApiError(422, '请选择一张活动图片。')

    const image = await activityImageStore.save(buffer)
    if (!image) throw createApiError(415, '图片文件格式不正确。')

    ctx.status = 201
    ctx.body = {
      item: {
        url: image.url,
        contentType: image.contentType,
        size: image.size,
      },
    }
  })

  router.delete(
    '/api/admin/activity-images/:filename',
    requireAdmin,
    async (ctx) => {
      await activityImageStore.remove(ctx.params.filename)
      ctx.body = { ok: true }
    },
  )

  router.put('/api/admin/activities/:id', requireAdmin, async (ctx) => {
    const input = validateActivityPayload(ctx.request.body, {
      includePinned: true,
      includeImage: true,
    })
    const existing = (await activityStore.readAll()).find(
      (activity) => activity.id === ctx.params.id,
    )
    const activity = await activityStore.update(ctx.params.id, input)

    if (!activity) {
      ctx.status = 404
      ctx.body = { error: '没有找到这个活动。' }
      return
    }

    if (existing?.imageUrl && existing.imageUrl !== activity.imageUrl) {
      await removeActivityImageSafely(existing.imageUrl)
    }

    ctx.body = { item: activity }
  })

  router.post('/api/admin/activities/:id/pin', requireAdmin, async (ctx) => {
    if (typeof ctx.request.body?.pinned !== 'boolean') {
      throw createApiError(422, '置顶状态格式不正确。')
    }
    const activity = await activityStore.setPinned(
      ctx.params.id,
      ctx.request.body.pinned,
    )

    if (!activity) {
      ctx.status = 404
      ctx.body = { error: '没有找到这个活动。' }
      return
    }

    ctx.body = { item: activity }
  })

  router.delete('/api/admin/activities/:id', requireAdmin, async (ctx) => {
    const activity = await activityStore.remove(ctx.params.id)

    if (!activity) {
      ctx.status = 404
      ctx.body = { error: '没有找到这个活动。' }
      return
    }

    await removeActivityImageSafely(activity.imageUrl)

    ctx.body = { ok: true }
  })

  router.get('/api/admin/activity-applications', requireAdmin, async (ctx) => {
    ctx.body = await activityApplicationStore.list({
      query: ctx.query.q,
      status: 'pending',
      page: ctx.query.page,
      pageSize: ctx.query.pageSize,
    })
  })

  router.put('/api/admin/activity-applications/:id', requireAdmin, async (ctx) => {
    const input = validateActivityPayload(ctx.request.body, {
      includeApplicant: true,
      includeImage: true,
    })
    const existing = (await activityApplicationStore.readAll()).find(
      (application) => application.id === ctx.params.id,
    )
    const result = await activityApplicationStore.updatePending(ctx.params.id, input)

    if (result.reason === 'missing') {
      ctx.status = 404
      ctx.body = { error: '没有找到这条活动申请。' }
      return
    }
    if (result.reason === 'reviewed') {
      throw createApiError(409, '这条活动申请已经完成审核。', 'ALREADY_REVIEWED')
    }

    if (existing?.imageUrl && existing.imageUrl !== result.item.imageUrl) {
      await removeActivityImageSafely(existing.imageUrl)
    }

    ctx.body = { item: result.item }
  })

  router.post(
    '/api/admin/activity-applications/:id/approve',
    requireAdmin,
    async (ctx) => {
      if (
        ctx.request.body?.pinned !== undefined &&
        typeof ctx.request.body.pinned !== 'boolean'
      ) {
        throw createApiError(422, '置顶状态格式不正确。')
      }

      const result = await runReviewOperation(async () => {
        const applications = await activityApplicationStore.readAll()
        const application = applications.find((item) => item.id === ctx.params.id)

        if (!application) return { reason: 'missing', item: null, activity: null }
        if (application.status !== 'pending') {
          return { reason: 'reviewed', item: null, activity: null }
        }

        const created = await activityStore.create({
          title: application.title,
          content: application.content,
          groupName: application.groupName,
          groupQq: application.groupQq,
          times: application.times,
          timeTbd: Boolean(application.timeTbd),
          modes: application.modes,
          imageUrl: application.imageUrl || '',
          pinned: Boolean(ctx.request.body?.pinned),
        })

        try {
          const reviewed = await activityApplicationStore.review(
            ctx.params.id,
            'approved',
            { approvedActivityId: created.id },
          )
          if (reviewed.reason) {
            await activityStore.remove(created.id)
            return { reason: reviewed.reason, item: null, activity: null }
          }
          return { reason: '', item: reviewed.item, activity: created }
        } catch (error) {
          await activityStore.remove(created.id)
          throw error
        }
      })

      if (result.reason === 'missing') {
        ctx.status = 404
        ctx.body = { error: '没有找到这条活动申请。' }
        return
      }
      if (result.reason === 'reviewed') {
        throw createApiError(409, '这条活动申请已经完成审核。', 'ALREADY_REVIEWED')
      }

      ctx.body = { item: result.item, activity: result.activity }
    },
  )

  router.post(
    '/api/admin/activity-applications/:id/reject',
    requireAdmin,
    async (ctx) => {
      const result = await runReviewOperation(() =>
        activityApplicationStore.review(ctx.params.id, 'rejected'),
      )

      if (result.reason === 'missing') {
        ctx.status = 404
        ctx.body = { error: '没有找到这条活动申请。' }
        return
      }
      if (result.reason === 'reviewed') {
        throw createApiError(409, '这条活动申请已经完成审核。', 'ALREADY_REVIEWED')
      }

      await removeActivityImageSafely(result.item.imageUrl)

      ctx.body = { item: result.item }
    },
  )

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
