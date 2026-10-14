import assert from 'node:assert/strict'
import http from 'node:http'
import process from 'node:process'
import readline from 'node:readline'

const origin = process.env.TEST_API_ORIGIN || 'http://127.0.0.1:3002'

function request(path, { method = 'GET', token = '', body } = {}) {
  const url = new URL(path, origin)
  const payload = body === undefined ? '' : JSON.stringify(body)

  return new Promise((resolve, reject) => {
    const requestHandle = http.request(
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
          } catch (error) {
            reject(error)
            return
          }
          resolve({ status: response.statusCode, body: parsed })
        })
      },
    )

    requestHandle.on('error', reject)
    if (payload) requestHandle.write(payload)
    requestHandle.end()
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
  assert.ok(password, '请通过标准输入或 TEST_ADMIN_PASSWORD 提供测试密码。')

  const health = await request('/api/health')
  assert.equal(health.status, 200)
  assert.equal(health.body.ok, true)

  const unauthenticated = await request('/api/admin/groups')
  assert.equal(unauthenticated.status, 401)

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'MixxionGrace', password },
  })
  assert.equal(login.status, 200)
  assert.match(login.body.token, /^[a-f0-9]{64}$/)
  const token = login.body.token

  const created = await request('/api/admin/groups', {
    method: 'POST',
    token,
    body: {
      name: '接口回归测试群',
      keywords: ['回归测试', '临时数据'],
      qq: '123456789',
    },
  })
  assert.equal(created.status, 201)
  const createdId = created.body.item.id
  assert.ok(createdId)

  const updated = await request(`/api/admin/groups/${encodeURIComponent(createdId)}`, {
    method: 'PUT',
    token,
    body: {
      name: '接口回归测试群（已编辑）',
      keywords: ['回归测试', '编辑完成'],
      qq: '987654321',
    },
  })
  assert.equal(updated.status, 200)
  assert.equal(updated.body.item.qq, '987654321')

  for (const query of ['已编辑', '编辑完成', '987654321']) {
    const result = await request(`/api/admin/groups?q=${encodeURIComponent(query)}`, { token })
    assert.equal(result.status, 200)
    assert.equal(result.body.total, 1)
    assert.equal(result.body.items[0].id, createdId)
  }

  const removed = await request(`/api/admin/groups/${encodeURIComponent(createdId)}`, {
    method: 'DELETE',
    token,
  })
  assert.equal(removed.status, 200)

  const afterRemoval = await request('/api/admin/groups?q=接口回归测试群', { token })
  assert.equal(afterRemoval.status, 200)
  assert.equal(afterRemoval.body.total, 0)

  const logout = await request('/api/auth/logout', { method: 'POST', token })
  assert.equal(logout.status, 200)

  const expired = await request('/api/admin/groups', { token })
  assert.equal(expired.status, 401)

  console.log('API smoke test passed: auth, protected CRUD, three-field search, logout.')
}

run().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
