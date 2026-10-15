import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import { ActivityImageStore } from '../src/activity-image-store.js'
import { ActivityApplicationStore, ActivityStore } from '../src/activity-store.js'
import { ApplicationStore } from '../src/application-store.js'
import { createApp } from '../src/index.js'
import { MetricsStore } from '../src/metrics-store.js'
import { GroupStore } from '../src/store.js'

function request(
  origin,
  route,
  { method = 'GET', token = '', body, binary, contentType = '' } = {},
) {
  const url = new URL(route, origin)
  const payload = binary ?? (body === undefined ? '' : JSON.stringify(body))

  return new Promise((resolve, reject) => {
    const handle = http.request(
      url,
      {
        method,
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined && binary === undefined
            ? {}
            : {
                'Content-Type': contentType || 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }),
        },
      },
      (response) => {
        let contents = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          contents += chunk
        })
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            body: contents ? JSON.parse(contents) : {},
          })
        })
      },
    )

    handle.on('error', reject)
    if (payload) handle.write(payload)
    handle.end()
  })
}

function requestBuffer(origin, route) {
  return new Promise((resolve, reject) => {
    http.get(new URL(route, origin), (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({
        status: response.statusCode,
        contentType: response.headers['content-type'],
        body: Buffer.concat(chunks),
      }))
    }).on('error', reject)
  })
}

async function readPassword() {
  if (process.env.TEST_ADMIN_PASSWORD) return process.env.TEST_ADMIN_PASSWORD

  const reader = readline.createInterface({ input: process.stdin, terminal: false })
  for await (const line of reader) {
    reader.close()
    return line.trim()
  }
  return ''
}

async function run() {
  const password = await readPassword()
  assert.ok(password, '请通过标准输入提供测试密码。')

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'naiwa-activity-'))
  const groupsFile = path.join(temporaryDirectory, 'groups.json')
  const groupApplicationsFile = path.join(temporaryDirectory, 'applications.json')
  const activitiesFile = path.join(temporaryDirectory, 'activities.json')
  const activityApplicationsFile = path.join(
    temporaryDirectory,
    'activity-applications.json',
  )
  const metricsFile = path.join(temporaryDirectory, 'metrics.json')
  const activityImagesDirectory = path.join(temporaryDirectory, 'activity-images')

  await Promise.all([
    fs.writeFile(groupsFile, '[]\n'),
    fs.writeFile(groupApplicationsFile, '[]\n'),
    fs.writeFile(activitiesFile, '[]\n'),
    fs.writeFile(activityApplicationsFile, '[]\n'),
  ])

  const app = createApp({
    store: new GroupStore(groupsFile),
    applicationStore: new ApplicationStore(groupApplicationsFile),
    activityStore: new ActivityStore(activitiesFile),
    activityApplicationStore: new ActivityApplicationStore(
      activityApplicationsFile,
    ),
    activityImageStore: new ActivityImageStore(activityImagesDirectory),
    metricsStore: new MetricsStore(metricsFile),
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address()
  const origin = `http://127.0.0.1:${port}`

  const createPayload = (title, groupQq) => ({
    title,
    content: `${title} 的活动内容`,
    groupName: `${title} 同好群`,
    groupQq,
    applicantQq: '778899001',
    times: ['2026-11-01T12:30:00.000Z', '2026-11-08T12:30:00.000Z'],
    timeTbd: false,
    modes: ['online', 'offline'],
  })

  try {
    const initialPublic = await request(origin, '/api/activities')
    assert.equal(initialPublic.status, 200)
    assert.equal(initialPublic.body.total, 0)

    const contradictoryTime = await request(origin, '/api/activity-applications', {
      method: 'POST',
      body: {
        ...createPayload('Contradictory Time', '123450000'),
        timeTbd: true,
      },
    })
    assert.equal(contradictoryTime.status, 422)
    assert.equal(
      contradictoryTime.body.fields.times,
      '活动时间待定时请勿填写具体时间。',
    )

    const betaSubmission = await request(origin, '/api/activity-applications', {
      method: 'POST',
      body: createPayload('Beta Activity', '123450001'),
    })
    const alphaSubmission = await request(origin, '/api/activity-applications', {
      method: 'POST',
      body: createPayload('Alpha Activity', '123450002'),
    })
    assert.equal(betaSubmission.status, 201)
    assert.equal(alphaSubmission.status, 201)

    const pendingIsHidden = await request(origin, '/api/activities')
    assert.equal(pendingIsHidden.body.total, 0)

    const login = await request(origin, '/api/auth/login', {
      method: 'POST',
      body: { username: 'MixxionGrace', password },
    })
    assert.equal(login.status, 200)
    const token = login.body.token

    const unauthorizedAdminActivity = await request(
      origin,
      '/api/admin/activities',
      {
        method: 'POST',
        body: {
          ...createPayload('Unauthorized Admin Activity', '123450099'),
          pinned: false,
          imageUrl: '',
        },
      },
    )
    assert.equal(unauthorizedAdminActivity.status, 401)

    const imageBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    )
    const unauthorizedImage = await request(origin, '/api/admin/activity-images', {
      method: 'POST',
      binary: imageBytes,
      contentType: 'image/png',
    })
    assert.equal(unauthorizedImage.status, 401)

    const invalidImage = await request(origin, '/api/admin/activity-images', {
      method: 'POST',
      token,
      binary: Buffer.from('not-an-image'),
      contentType: 'image/png',
    })
    assert.equal(invalidImage.status, 415)

    const uploadedImage = await request(origin, '/api/admin/activity-images', {
      method: 'POST',
      token,
      binary: imageBytes,
      contentType: 'image/png',
    })
    assert.equal(uploadedImage.status, 201)
    assert.match(uploadedImage.body.item.url, /^\/api\/activity-images\/.+\.png$/)

    const pending = await request(origin, '/api/admin/activity-applications', {
      token,
    })
    assert.equal(pending.status, 200)
    assert.equal(pending.body.total, 2)

    const edited = await request(
      origin,
      `/api/admin/activity-applications/${betaSubmission.body.item.id}`,
      {
        method: 'PUT',
        token,
        body: {
          ...createPayload('Beta Activity', '123450001'),
          content: '已由管理端编辑',
          imageUrl: uploadedImage.body.item.url,
        },
      },
    )
    assert.equal(edited.status, 200)

    for (const id of [betaSubmission.body.item.id, alphaSubmission.body.item.id]) {
      const approved = await request(
        origin,
        `/api/admin/activity-applications/${id}/approve`,
        { method: 'POST', token, body: { pinned: true } },
      )
      assert.equal(approved.status, 200)
      assert.equal(approved.body.activity.pinned, true)
    }

    const publicActivities = await request(origin, '/api/activities')
    assert.equal(publicActivities.status, 200)
    assert.deepEqual(
      publicActivities.body.items.map((item) => item.title),
      ['Alpha Activity', 'Beta Activity'],
    )
    assert.equal('applicantQq' in publicActivities.body.items[0], false)
    const activityWithImage = publicActivities.body.items.find(
      (activity) => activity.title === 'Beta Activity',
    )
    assert.equal(activityWithImage.imageUrl, uploadedImage.body.item.url)

    const publicImage = await requestBuffer(origin, uploadedImage.body.item.url)
    assert.equal(publicImage.status, 200)
    assert.equal(publicImage.contentType, 'image/png')
    assert.deepEqual(publicImage.body, imageBytes)

    const alpha = publicActivities.body.items[0]
    const unpinned = await request(
      origin,
      `/api/admin/activities/${alpha.id}/pin`,
      { method: 'POST', token, body: { pinned: false } },
    )
    assert.equal(unpinned.status, 200)

    const reordered = await request(origin, '/api/activities')
    assert.equal(reordered.body.items[0].title, 'Beta Activity')
    assert.equal(reordered.body.items[0].pinned, true)

    const rejectedSubmission = await request(origin, '/api/activity-applications', {
      method: 'POST',
      body: {
        ...createPayload('Rejected Activity', '123450003'),
        times: [],
        timeTbd: true,
      },
    })
    const rejected = await request(
      origin,
      `/api/admin/activity-applications/${rejectedSubmission.body.item.id}/reject`,
      { method: 'POST', token },
    )
    assert.equal(rejected.status, 200)
    assert.equal(rejected.body.item.status, 'rejected')
    assert.equal(rejected.body.item.timeTbd, true)

    const rejectedIsHidden = await request(origin, '/api/activities?q=Rejected')
    assert.equal(rejectedIsHidden.body.total, 0)

    const adminCreated = await request(origin, '/api/admin/activities', {
      method: 'POST',
      token,
      body: {
        ...createPayload('Admin Created Activity', '123450004'),
        times: [],
        timeTbd: true,
        pinned: false,
        imageUrl: '',
      },
    })
    assert.equal(adminCreated.status, 201)
    assert.equal(adminCreated.body.item.title, 'Admin Created Activity')
    assert.equal(adminCreated.body.item.pinned, false)
    assert.equal(adminCreated.body.item.timeTbd, true)
    assert.deepEqual(adminCreated.body.item.times, [])
    assert.equal('applicantQq' in adminCreated.body.item, false)

    const adminCreatedIsPublic = await request(origin, '/api/activities?q=Admin')
    assert.equal(adminCreatedIsPublic.status, 200)
    assert.equal(adminCreatedIsPublic.body.total, 1)
    assert.equal(adminCreatedIsPublic.body.items[0].id, adminCreated.body.item.id)
    assert.equal(adminCreatedIsPublic.body.items[0].timeTbd, true)

    for (const activity of reordered.body.items) {
      const removed = await request(origin, `/api/admin/activities/${activity.id}`, {
        method: 'DELETE',
        token,
      })
      assert.equal(removed.status, 200)
    }

    const removedAdminCreated = await request(
      origin,
      `/api/admin/activities/${adminCreated.body.item.id}`,
      { method: 'DELETE', token },
    )
    assert.equal(removedAdminCreated.status, 200)

    const removedImage = await requestBuffer(origin, uploadedImage.body.item.url)
    assert.equal(removedImage.status, 404)

    console.log(
      'Activity flow test passed: submit, admin create/image/edit, approve, pin order, privacy, reject, delete.',
    )
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
