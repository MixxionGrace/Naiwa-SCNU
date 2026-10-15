import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  ActivityImageStore,
  isActivityImageFilename,
} from './activity-image-store.js'

const markerFilename = '.cos-migration.json'

async function readMarker(markerPath) {
  try {
    return JSON.parse(await fs.readFile(markerPath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null
    throw error
  }
}

async function listLocalImages(directory) {
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }

  const filenames = entries
    .filter((entry) => entry.isFile() && isActivityImageFilename(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'))

  return Promise.all(
    filenames.map(async (filename) => {
      const stats = await fs.stat(path.join(directory, filename))
      return {
        filename,
        size: stats.size,
        mtimeMs: Math.trunc(stats.mtimeMs),
      }
    }),
  )
}

function markerMatches(marker, target, files) {
  return (
    marker?.version === 1 &&
    JSON.stringify(marker.target) === JSON.stringify(target) &&
    JSON.stringify(marker.files) === JSON.stringify(files)
  )
}

export async function migrateActivityImagesToCos({
  store = new ActivityImageStore(),
  directory = store.directory,
} = {}) {
  if (store.provider !== 'cos') {
    throw new Error('未配置腾讯云 COS，不能执行本地图片迁移。')
  }

  const target = store.getCosTarget()
  const files = await listLocalImages(directory)
  const markerPath = path.join(directory, markerFilename)
  const marker = await readMarker(markerPath)

  if (markerMatches(marker, target, files)) {
    return { uploaded: 0, total: files.length, skipped: true }
  }

  for (const file of files) {
    const buffer = await fs.readFile(path.join(directory, file.filename))
    const uploaded = await store.importExisting(file.filename, buffer)
    if (!uploaded) {
      throw new Error(`本地图片格式不正确：${file.filename}`)
    }
  }

  await fs.mkdir(directory, { recursive: true })
  const temporaryMarkerPath = `${markerPath}.${process.pid}.tmp`
  await fs.writeFile(
    temporaryMarkerPath,
    `${JSON.stringify(
      {
        version: 1,
        target,
        files,
        migratedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  )
  await fs.rename(temporaryMarkerPath, markerPath)

  return { uploaded: files.length, total: files.length, skipped: false }
}

const isMainModule =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMainModule) {
  migrateActivityImagesToCos()
    .then((result) => {
      console.log(
        `COS_MIGRATION_OK uploaded=${result.uploaded} total=${result.total} skipped=${result.skipped}`,
      )
    })
    .catch((error) => {
      console.error(`COS_MIGRATION_FAILED ${error.message}`)
      process.exitCode = 1
    })
}
