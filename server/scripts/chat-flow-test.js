import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import { createApp } from '../src/index.js'
import { ChatRoomStore } from '../src/chat-store.js'
import { MetricsStore } from '../src/metrics-store.js'
import { GroupStore } from '../src/store.js'
import { ORACLE_DOCUMENT } from '../src/oracle-document.js'

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

async function readAdminPassword() {
  if (process.env.TEST_ADMIN_PASSWORD) return process.env.TEST_ADMIN_PASSWORD

  const reader = readline.createInterface({ input: process.stdin, terminal: false })
  for await (const line of reader) {
    reader.close()
    return line.trim()
  }
  return ''
}

async function loginTo(origin, username, password, portal) {
  return request(origin, '/api/auth/login', {
    method: 'POST',
    body: { username, password, portal },
  })
}

async function run() {
  const adminPassword = await readAdminPassword()
  assert.ok(adminPassword, '请通过标准输入提供管理员测试密码。')

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'naiwa-chat-'))
  const groupsFile = path.join(temporaryDirectory, 'groups.json')
  const metricsFile = path.join(temporaryDirectory, 'metrics.json')
  const chatRoomFile = path.join(temporaryDirectory, 'chat-room.json')
  await fs.writeFile(groupsFile, '[]\n')
  const savedLegacyDraft = { content: '原编辑器中已保存的内容应保持不变。', updatedBy: 'luodan' }
  await fs.writeFile(chatRoomFile, JSON.stringify({ messages: [], comments: [], document: savedLegacyDraft }))

  const app = createApp({
    store: new GroupStore(groupsFile),
    metricsStore: new MetricsStore(metricsFile),
    chatStore: new ChatRoomStore(chatRoomFile),
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address()
  const origin = `http://127.0.0.1:${port}`

  try {
    const unauthenticated = await request(origin, '/api/chat/room')
    assert.equal(unauthenticated.status, 401)
    const unauthenticatedDocument = await request(origin, '/api/chat/document')
    assert.equal(unauthenticatedDocument.status, 401)
    assert.equal(unauthenticatedDocument.body.document, undefined)

    const blockedAdminLogin = await loginTo(origin, 'luodan', '123456', 'admin')
    assert.equal(blockedAdminLogin.status, 403)
    assert.equal(blockedAdminLogin.body.token, undefined)

    const luodanLogin = await loginTo(origin, 'luodan', '123456', 'chat')
    assert.equal(luodanLogin.status, 200)
    assert.equal(luodanLogin.body.user.role, 'user')
    const luodanToken = luodanLogin.body.token

    const renyushengLogin = await loginTo(origin, 'renyusheng', '123456', 'chat')
    assert.equal(renyushengLogin.status, 200)
    assert.equal(renyushengLogin.body.user.role, 'user')
    const renyushengToken = renyushengLogin.body.token

    const adminLogin = await loginTo(
      origin,
      'MixxionGrace',
      adminPassword,
      'admin',
    )
    assert.equal(adminLogin.status, 200)
    assert.equal(adminLogin.body.user.role, 'superadmin')
    const adminToken = adminLogin.body.token

    const restoredSession = await request(origin, '/api/auth/me', {
      token: luodanToken,
    })
    assert.equal(restoredSession.status, 200)
    assert.equal(restoredSession.body.user.username, 'luodan')

    const adminRouteIsProtected = await request(origin, '/api/admin/groups', {
      token: luodanToken,
    })
    assert.equal(adminRouteIsProtected.status, 403)

    const message = await request(origin, '/api/chat/messages', {
      method: 'POST',
      token: luodanToken,
      body: { content: '先验证信念状态采样。' },
    })
    assert.equal(message.status, 201)
    assert.equal(message.body.item.authorUsername, 'luodan')
    assert.equal(message.body.item.canDelete, true)

    const roomForOtherUser = await request(origin, '/api/chat/room', {
      token: renyushengToken,
    })
    assert.equal(roomForOtherUser.status, 200)
    assert.equal(roomForOtherUser.body.messages[0].canDelete, false)

    const cannotDeleteOtherMessage = await request(
      origin,
      `/api/chat/messages/${message.body.item.id}`,
      { method: 'DELETE', token: renyushengToken },
    )
    assert.equal(cannotDeleteOtherMessage.status, 403)

    const deleteOwnMessage = await request(
      origin,
      `/api/chat/messages/${message.body.item.id}`,
      { method: 'DELETE', token: luodanToken },
    )
    assert.equal(deleteOwnMessage.status, 200)

    const roomBeforeComment = await request(origin, '/api/chat/room', {
      token: luodanToken,
    })
    assert.equal(roomBeforeComment.status, 200)
    assert.equal(roomBeforeComment.body.document.readOnly, true)
    assert.equal(roomBeforeComment.body.document.version, ORACLE_DOCUMENT.version)
    assert.equal(roomBeforeComment.body.document.content, undefined)

    const readOnlyDocument = await request(origin, '/api/chat/document', { token: luodanToken })
    assert.equal(readOnlyDocument.status, 200)
    assert.equal(readOnlyDocument.body.document.readOnly, true)
    assert.match(readOnlyDocument.body.document.html, /术语表/)
    assert.match(readOnlyDocument.body.document.html, /回归指标/)
    assert.match(readOnlyDocument.body.document.html, /优化指标/)
    assert.equal((readOnlyDocument.body.document.html.match(/<svg /g) || []).length, 3)
    assert.doesNotMatch(readOnlyDocument.body.document.html, /<script|contenteditable|<textarea/i)

    for (const token of [luodanToken, renyushengToken, adminToken]) {
      const cannotEditDocument = await request(origin, '/api/chat/document', {
        method: 'PUT',
        token,
        body: { content: '不能通过直接调用 API 修改只读文档。', baseUpdatedAt: null },
      })
      assert.equal(cannotEditDocument.status, 403)
    }

    const invalidComment = await request(origin, '/api/chat/comments', {
      method: 'POST',
      token: luodanToken,
      body: { content: '缺少选中文字。' },
    })
    assert.equal(invalidComment.status, 422)

    const comment = await request(origin, '/api/chat/comments', {
      method: 'POST',
      token: luodanToken,
      body: {
        content: '这里需要补充粒子权重的更新条件。',
        quote: '硬事实可排除粒子',
        sectionId: 'solution',
        documentVersion: ORACLE_DOCUMENT.version,
      },
    })
    assert.equal(comment.status, 201)
    assert.equal(comment.body.item.quote, '硬事实可排除粒子')
    assert.equal(comment.body.item.sectionId, 'solution')
    assert.equal(comment.body.item.documentVersion, ORACLE_DOCUMENT.version)

    const cannotDeleteOtherComment = await request(
      origin,
      `/api/chat/comments/${comment.body.item.id}`,
      { method: 'DELETE', token: renyushengToken },
    )
    assert.equal(cannotDeleteOtherComment.status, 403)

    const staleDocumentComment = await request(origin, '/api/chat/comments', {
      method: 'POST',
      token: luodanToken,
      body: {
        content: '旧版本评论不能混入新版文档。',
        quote: '旧文档文字',
        sectionId: 'solution',
        documentVersion: 'old-version',
      },
    })
    assert.equal(staleDocumentComment.status, 409)
    const savedRoom = JSON.parse(await fs.readFile(chatRoomFile, 'utf8'))
    assert.deepEqual(savedRoom.document, savedLegacyDraft)
    assert.equal(savedRoom.comments.length, 1)

    const adminDeletesComment = await request(
      origin,
      `/api/chat/comments/${comment.body.item.id}`,
      { method: 'DELETE', token: adminToken },
    )
    assert.equal(adminDeletesComment.status, 200)

    const logout = await request(origin, '/api/auth/logout', {
      method: 'POST',
      token: luodanToken,
    })
    assert.equal(logout.status, 200)

    const expiredAfterLogout = await request(origin, '/api/chat/room', {
      token: luodanToken,
    })
    assert.equal(expiredAfterLogout.status, 401)

    console.log('Chat flow test passed: roles, read-only document, anchored comments and permissions.')
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
