import COS from 'cos-nodejs-sdk-v5'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultImagesDirectory = path.resolve(currentDirectory, '../data/activity-images')
const imageFilePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/
const imageUrlPattern = /^\/api\/activity-images\/([^/?#]+)$/
const defaultCosPrefix = 'activity-images'
const requiredCosEnvironmentVariables = [
  'COS_SECRET_ID',
  'COS_SECRET_KEY',
  'COS_BUCKET',
  'COS_REGION',
]

const formats = [
  {
    extension: 'jpg',
    contentType: 'image/jpeg',
    matches: (buffer) =>
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff,
  },
  {
    extension: 'png',
    contentType: 'image/png',
    matches: (buffer) =>
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
  },
  {
    extension: 'webp',
    contentType: 'image/webp',
    matches: (buffer) =>
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP',
  },
]

function getFormat(buffer) {
  return formats.find((format) => format.matches(buffer)) || null
}

function getFormatByFilename(filename) {
  const extension = path.extname(filename).slice(1)
  return formats.find((format) => format.extension === extension) || null
}

function normalizeCosPrefix(value) {
  const prefix = String(value || defaultCosPrefix)
    .trim()
    .replace(/^\/+|\/+$/g, '')

  if (!prefix || prefix.includes('..') || prefix.includes('\\')) {
    throw new Error('COS_PREFIX 不是有效的对象目录。')
  }
  return prefix
}

function getCosConfiguration(environment) {
  const values = Object.fromEntries(
    requiredCosEnvironmentVariables.map((name) => [
      name,
      String(environment[name] || '').trim(),
    ]),
  )
  const configuredNames = requiredCosEnvironmentVariables.filter(
    (name) => values[name],
  )

  if (!configuredNames.length) return null

  const missingNames = requiredCosEnvironmentVariables.filter(
    (name) => !values[name],
  )
  if (missingNames.length) {
    throw new Error(`COS 配置不完整，缺少：${missingNames.join(', ')}`)
  }

  return {
    secretId: values.COS_SECRET_ID,
    secretKey: values.COS_SECRET_KEY,
    securityToken: String(environment.COS_SECURITY_TOKEN || '').trim(),
    bucket: values.COS_BUCKET,
    region: values.COS_REGION,
    prefix: normalizeCosPrefix(environment.COS_PREFIX),
  }
}

function isMissingCosObject(error) {
  return (
    error?.statusCode === 404 ||
    error?.code === 'NoSuchKey' ||
    error?.code === 'NoSuchResource'
  )
}

function getFilenameFromUrl(url) {
  const match = String(url ?? '').match(imageUrlPattern)
  return match && isActivityImageFilename(match[1]) ? match[1] : ''
}

function createImageResult(filename, format, size, buffer) {
  return {
    filename,
    ...(buffer ? { buffer } : {}),
    contentType: format.contentType,
    size,
    url: `/api/activity-images/${filename}`,
  }
}

export class ActivityImageStore {
  constructor(options = {}) {
    if (typeof options === 'string') {
      this.directory = options
      this.cos = null
      this.cosConfiguration = null
      this.provider = 'local'
      return
    }

    const environment = options.environment || process.env
    const cosConfiguration =
      options.cosConfiguration === undefined
        ? getCosConfiguration(environment)
        : options.cosConfiguration

    if (options.cosClient && !cosConfiguration) {
      throw new Error('注入 COS 客户端时必须同时提供 cosConfiguration。')
    }

    this.directory =
      options.directory || environment.ACTIVITY_IMAGES_DIR || defaultImagesDirectory
    this.cosConfiguration = cosConfiguration
    this.cos =
      options.cosClient ||
      (cosConfiguration
        ? new COS({
            SecretId: cosConfiguration.secretId,
            SecretKey: cosConfiguration.secretKey,
            ...(cosConfiguration.securityToken
              ? { SecurityToken: cosConfiguration.securityToken }
              : {}),
            Protocol: 'https:',
            Timeout: 10000,
          })
        : null)
    this.provider = this.cos ? 'cos' : 'local'
  }

  getCosObjectKey(filename) {
    return `${this.cosConfiguration.prefix}/${filename}`
  }

  getCosTarget() {
    if (!this.cosConfiguration) return null
    return {
      bucket: this.cosConfiguration.bucket,
      region: this.cosConfiguration.region,
      prefix: this.cosConfiguration.prefix,
    }
  }

  async write(filename, buffer, format) {
    if (this.cos) {
      await this.cos.putObject({
        Bucket: this.cosConfiguration.bucket,
        Region: this.cosConfiguration.region,
        Key: this.getCosObjectKey(filename),
        Body: buffer,
        ContentLength: buffer.length,
        ContentType: format.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    } else {
      await fs.mkdir(this.directory, { recursive: true })
      await fs.writeFile(path.join(this.directory, filename), buffer, { mode: 0o640 })
    }

    return createImageResult(filename, format, buffer.length)
  }

  async save(buffer) {
    const format = getFormat(buffer)
    if (!format) return null
    return this.write(`${randomUUID()}.${format.extension}`, buffer, format)
  }

  async importExisting(filename, buffer) {
    if (!isActivityImageFilename(filename)) return null

    const format = getFormat(buffer)
    const filenameFormat = getFormatByFilename(filename)
    if (!format || format.extension !== filenameFormat?.extension) return null

    return this.write(filename, buffer, format)
  }

  async get(filename) {
    if (!isActivityImageFilename(filename)) return null

    const format = getFormatByFilename(filename)
    if (!format) return null

    if (this.cos) {
      try {
        const response = await this.cos.getObject({
          Bucket: this.cosConfiguration.bucket,
          Region: this.cosConfiguration.region,
          Key: this.getCosObjectKey(filename),
        })
        const buffer = Buffer.isBuffer(response.Body)
          ? response.Body
          : Buffer.from(response.Body || '')
        return createImageResult(filename, format, buffer.length, buffer)
      } catch (error) {
        if (isMissingCosObject(error)) return null
        throw error
      }
    }

    try {
      const buffer = await fs.readFile(path.join(this.directory, filename))
      return createImageResult(filename, format, buffer.length, buffer)
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }

  async remove(filename) {
    if (!isActivityImageFilename(filename)) return false

    if (this.cos) {
      await this.cos.deleteObject({
        Bucket: this.cosConfiguration.bucket,
        Region: this.cosConfiguration.region,
        Key: this.getCosObjectKey(filename),
      })
      return true
    }

    try {
      await fs.unlink(path.join(this.directory, filename))
      return true
    } catch (error) {
      if (error.code === 'ENOENT') return false
      throw error
    }
  }

  async removeByUrl(url) {
    const filename = getFilenameFromUrl(url)
    return filename ? this.remove(filename) : false
  }
}

export function isActivityImageFilename(value) {
  return imageFilePattern.test(String(value))
}

export function isActivityImageUrl(value) {
  return Boolean(getFilenameFromUrl(value))
}
