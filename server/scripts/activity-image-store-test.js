import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ActivityImageStore } from '../src/activity-image-store.js'
import { migrateActivityImagesToCos } from '../src/migrate-activity-images.js'

const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function run() {
  assert.throws(
    () =>
      new ActivityImageStore({
        environment: { COS_BUCKET: 'incomplete-1250000000' },
      }),
    /COS 配置不完整/,
  )

  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'naiwa-cos-images-'),
  )
  const objects = new Map()
  const calls = []
  const cosClient = {
    async putObject(input) {
      calls.push({ method: 'putObject', input })
      objects.set(input.Key, Buffer.from(input.Body))
      return { statusCode: 200 }
    },
    async getObject(input) {
      calls.push({ method: 'getObject', input })
      const body = objects.get(input.Key)
      if (!body) throw { statusCode: 404, code: 'NoSuchKey' }
      return { Body: Buffer.from(body), statusCode: 200 }
    },
    async deleteObject(input) {
      calls.push({ method: 'deleteObject', input })
      objects.delete(input.Key)
      return { statusCode: 204 }
    },
  }
  const cosConfiguration = {
    secretId: 'test-secret-id',
    secretKey: 'test-secret-key',
    securityToken: '',
    bucket: 'naiwa-test-1250000000',
    region: 'ap-hongkong',
    prefix: 'activity-images',
  }
  const store = new ActivityImageStore({
    directory: temporaryDirectory,
    cosClient,
    cosConfiguration,
  })

  try {
    assert.equal(store.provider, 'cos')
    assert.equal(await store.save(Buffer.from('not-an-image')), null)

    const uploaded = await store.save(imageBytes)
    assert.match(uploaded.filename, /^[0-9a-f-]+\.png$/)
    assert.equal(uploaded.url, `/api/activity-images/${uploaded.filename}`)
    assert.equal(calls[0].method, 'putObject')
    assert.equal(calls[0].input.Bucket, cosConfiguration.bucket)
    assert.equal(calls[0].input.Region, cosConfiguration.region)
    assert.equal(
      calls[0].input.Key,
      `activity-images/${uploaded.filename}`,
    )
    assert.equal(calls[0].input.ContentType, 'image/png')

    const downloaded = await store.get(uploaded.filename)
    assert.equal(downloaded.contentType, 'image/png')
    assert.deepEqual(downloaded.buffer, imageBytes)

    assert.equal(await store.removeByUrl(uploaded.url), true)
    assert.equal(await store.get(uploaded.filename), null)

    const localStore = new ActivityImageStore(temporaryDirectory)
    const legacyImage = await localStore.save(imageBytes)
    assert.equal(await store.get(legacyImage.filename), null)

    const firstMigration = await migrateActivityImagesToCos({
      store,
      directory: temporaryDirectory,
    })
    assert.deepEqual(firstMigration, { uploaded: 1, total: 1, skipped: false })
    const migratedImage = await store.get(legacyImage.filename)
    assert.deepEqual(migratedImage.buffer, imageBytes)

    const cosWritesBeforeSecondMigration = calls.filter(
      (call) => call.method === 'putObject',
    ).length
    const secondMigration = await migrateActivityImagesToCos({
      store,
      directory: temporaryDirectory,
    })
    assert.deepEqual(secondMigration, { uploaded: 0, total: 1, skipped: true })
    assert.equal(
      calls.filter((call) => call.method === 'putObject').length,
      cosWritesBeforeSecondMigration,
    )

    assert.equal(await store.removeByUrl(legacyImage.url), true)
    assert.ok(await localStore.get(legacyImage.filename))
    assert.equal(await localStore.remove(legacyImage.filename), true)

    console.log(
      'Activity image store test passed: COS upload/read/delete, strict config, idempotent local migration.',
    )
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
