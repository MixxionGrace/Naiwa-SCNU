import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import { ApplicationStore } from '../src/application-store.js'
import { createApp } from '../src/index.js'
import { MetricsStore } from '../src/metrics-store.js'
import { GroupStore } from '../src/store.js'

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

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'naiwa-review-'))
  const groupsFile = path.join(temporaryDirectory, 'groups.json')
  const applicationsFile = path.join(temporaryDirectory, 'applications.json')
  const metricsFile = path.join(temporaryDirectory, 'metrics.json')
  const seedGroups = JSON.parse(
    await fs.readFile(new URL('../data/groups.json', import.meta.url), 'utf8'),
  )
  await fs.writeFile(groupsFile, `${JSON.stringify(seedGroups, null, 2)}\n`)
  await fs.writeFile(applicationsFile, '[]\n')

  const app = createApp({
    store: new GroupStore(groupsFile),
    applicationStore: new ApplicationStore(applicationsFile),
    metricsStore: new MetricsStore(metricsFile),
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address()
  const origin = `http://127.0.0.1:${port}`

  try {
    const approvedCheck = await request(
      origin,
      '/api/group-applications/check?qq=779237255',
    )
    assert.equal(approvedCheck.status, 200)
    assert.equal(approvedCheck.body.status, 'approved')

    const approvedDuplicate = await request(origin, '/api/group-applications', {
      method: 'POST',
      body: {
        name: '重复群',
        keywords: ['舞萌'],
        qq: '779237255',
        applicantQq: '778899001',
      },
    })
    assert.equal(approvedDuplicate.status, 409)
    assert.equal(approvedDuplicate.body.code, 'ALREADY_APPROVED')

    const applicationPayload = {
      name: '接口审核测试群',
      keywords: ['测试游戏', '流程验证'],
      qq: '123450987',
      applicantQq: '778899001',
    }
    const submitted = await request(origin, '/api/group-applications', {
      method: 'POST',
      body: applicationPayload,
    })
    assert.equal(submitted.status, 201)
    const applicationId = submitted.body.item.id

    const pendingIsHidden = await request(
      origin,
      `/api/groups?q=${encodeURIComponent(applicationPayload.qq)}`,
    )
    assert.equal(pendingIsHidden.status, 200)
    assert.equal(pendingIsHidden.body.total, 0)

    const pendingDuplicate = await request(origin, '/api/group-applications', {
      method: 'POST',
      body: applicationPayload,
    })
    assert.equal(pendingDuplicate.status, 409)
    assert.equal(pendingDuplicate.body.code, 'ALREADY_PENDING')

    const login = await request(origin, '/api/auth/login', {
      method: 'POST',
      body: { username: 'MixxionGrace', password },
    })
    assert.equal(login.status, 200)
    const token = login.body.token

    const pendingList = await request(origin, '/api/admin/applications?q=778899001', {
      token,
    })
    assert.equal(pendingList.status, 200)
    assert.equal(pendingList.body.total, 1)

    const edited = await request(
      origin,
      `/api/admin/applications/${encodeURIComponent(applicationId)}`,
      {
        method: 'PUT',
        token,
        body: {
          ...applicationPayload,
          name: '接口审核测试群（已编辑）',
          keywords: ['测试游戏', '编辑完成'],
        },
      },
    )
    assert.equal(edited.status, 200)

    const approved = await request(
      origin,
      `/api/admin/applications/${encodeURIComponent(applicationId)}/approve`,
      { method: 'POST', token },
    )
    assert.equal(approved.status, 200)
    assert.equal(approved.body.group.qq, applicationPayload.qq)

    const publicGroup = await request(
      origin,
      `/api/groups?q=${encodeURIComponent('编辑完成')}`,
    )
    assert.equal(publicGroup.status, 200)
    assert.equal(publicGroup.body.total, 1)
    assert.equal(publicGroup.body.items[0].name, '接口审核测试群（已编辑）')

    const approvedAfterReview = await request(
      origin,
      `/api/group-applications/check?qq=${applicationPayload.qq}`,
    )
    assert.equal(approvedAfterReview.body.status, 'approved')

    const rejectSubmission = await request(origin, '/api/group-applications', {
      method: 'POST',
      body: { ...applicationPayload, qq: '123450988' },
    })
    const rejectId = rejectSubmission.body.item.id
    const rejected = await request(
      origin,
      `/api/admin/applications/${encodeURIComponent(rejectId)}/reject`,
      { method: 'POST', token },
    )
    assert.equal(rejected.status, 200)
    assert.equal(rejected.body.item.status, 'rejected')

    const rejectedIsHidden = await request(origin, '/api/groups?q=123450988')
    assert.equal(rejectedIsHidden.status, 200)
    assert.equal(rejectedIsHidden.body.total, 0)

    const pendingAfterReview = await request(origin, '/api/admin/applications', { token })
    assert.equal(pendingAfterReview.status, 200)
    assert.equal(pendingAfterReview.body.total, 0)

    const removed = await request(
      origin,
      `/api/admin/groups/${encodeURIComponent(approved.body.group.id)}`,
      { method: 'DELETE', token },
    )
    assert.equal(removed.status, 200)

    const availableAgain = await request(
      origin,
      `/api/group-applications/check?qq=${applicationPayload.qq}`,
    )
    assert.equal(availableAgain.body.status, 'available')

    console.log(
      'Review flow test passed: pending/rejected hidden, edit, approve, publish, duplicate checks.',
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
