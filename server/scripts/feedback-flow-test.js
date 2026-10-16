import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import { createApp } from '../src/index.js'
import { FeedbackStore } from '../src/feedback-store.js'
import { MetricsStore } from '../src/metrics-store.js'

function request(origin, route, { method = 'GET', token = '', body } = {}) {
  const url = new URL(route, origin)
  const payload = body === undefined ? '' : JSON.stringify(body)

  return new Promise((resolve, reject) => {
    const handle = http.request(
      url,
      {
        method,
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined
            ? {}
            : {
                'Content-Type': 'application/json',
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
          let parsed = {}
          try {
            parsed = contents ? JSON.parse(contents) : {}
          } catch {
            parsed = { raw: contents }
          }
          resolve({
            status: response.statusCode,
            body: parsed,
          })
        })
      },
    )

    handle.on('error', reject)
    if (payload) handle.write(payload)
    handle.end()
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

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'naiwa-feedback-'))
  const feedbacksFile = path.join(temporaryDirectory, 'feedbacks.json')
  const metricsFile = path.join(temporaryDirectory, 'metrics.json')
  await fs.writeFile(feedbacksFile, '[]\n')

  const app = createApp({
    feedbackStore: new FeedbackStore(feedbacksFile),
    metricsStore: new MetricsStore(metricsFile),
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address()
  const origin = `http://127.0.0.1:${port}`

  try {
    const invalid = await request(origin, '/api/feedbacks', {
      method: 'POST',
      body: { category: 'unknown', content: '', contactQq: 'abc' },
    })
    assert.equal(invalid.status, 422)
    assert.ok(invalid.body.fields.category)
    assert.ok(invalid.body.fields.content)
    assert.ok(invalid.body.fields.contactQq)

    const submitted = await request(origin, '/api/feedbacks', {
      method: 'POST',
      body: {
        category: 'feature',
        content: '希望增加活动日历订阅功能',
        contactQq: '123456789',
      },
    })
    assert.equal(submitted.status, 201)
    assert.equal(submitted.body.item.status, 'pending')
    const feedbackId = submitted.body.item.id

    const publicListIsPrivate = await request(origin, '/api/feedbacks')
    assert.equal(publicListIsPrivate.status, 405)

    const unauthenticated = await request(origin, '/api/admin/feedbacks')
    assert.equal(unauthenticated.status, 401)

    const login = await request(origin, '/api/auth/login', {
      method: 'POST',
      body: { username: 'MixxionGrace', password },
    })
    assert.equal(login.status, 200)
    const token = login.body.token

    const pending = await request(
      origin,
      `/api/admin/feedbacks?q=${encodeURIComponent('日历')}`,
      { token },
    )
    assert.equal(pending.status, 200)
    assert.equal(pending.body.total, 1)
    assert.equal(pending.body.items[0].contactQq, '123456789')

    const processed = await request(
      origin,
      `/api/admin/feedbacks/${encodeURIComponent(feedbackId)}/status`,
      { method: 'POST', token, body: { status: 'processed' } },
    )
    assert.equal(processed.status, 200)
    assert.equal(processed.body.item.status, 'processed')
    assert.ok(processed.body.item.processedAt)

    const pendingAfterProcessing = await request(origin, '/api/admin/feedbacks', {
      token,
    })
    assert.equal(pendingAfterProcessing.body.total, 0)

    const processedList = await request(
      origin,
      '/api/admin/feedbacks?status=processed',
      { token },
    )
    assert.equal(processedList.body.total, 1)

    const restored = await request(
      origin,
      `/api/admin/feedbacks/${encodeURIComponent(feedbackId)}/status`,
      { method: 'POST', token, body: { status: 'pending' } },
    )
    assert.equal(restored.status, 200)
    assert.equal(restored.body.item.status, 'pending')
    assert.equal(restored.body.item.processedAt, null)

    console.log('Feedback flow test passed: private list, validation, search and status updates.')
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
