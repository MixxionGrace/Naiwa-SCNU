import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultDataFile = path.resolve(currentDirectory, '../data/feedbacks.json')

const categoryLabels = {
  feature: '功能建议',
  issue: '问题反馈',
  other: '其他反馈',
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s·_.\-—:：/\\|，,、]+/g, '')
}

function fuzzyContains(source, query) {
  const haystack = normalizeSearchText(source)
  const needle = normalizeSearchText(query)

  if (!needle) return true
  if (haystack.includes(needle)) return true

  let needleIndex = 0
  for (const character of haystack) {
    if (character === needle[needleIndex]) needleIndex += 1
    if (needleIndex === needle.length) return true
  }

  return false
}

function matchesFeedback(feedback, query) {
  const terms = String(query ?? '').trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return true

  const sources = [
    feedback.content,
    feedback.contactQq,
    feedback.category,
    categoryLabels[feedback.category],
  ]
  return terms.every((term) =>
    sources.some((source) => fuzzyContains(source, term)),
  )
}

function toPositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, maximum)
}

function timestamp(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : 0
}

export class FeedbackStore {
  constructor(dataFile = process.env.FEEDBACKS_FILE || defaultDataFile) {
    this.dataFile = dataFile
    this.writeQueue = Promise.resolve()
  }

  async readAll() {
    try {
      const contents = await fs.readFile(this.dataFile, 'utf8')
      const feedbacks = JSON.parse(contents)
      if (!Array.isArray(feedbacks)) throw new Error('反馈资料文件格式错误。')
      return feedbacks
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }

  async writeAll(feedbacks) {
    await fs.mkdir(path.dirname(this.dataFile), { recursive: true })
    const temporaryFile = `${this.dataFile}.${process.pid}.tmp`
    await fs.writeFile(
      temporaryFile,
      `${JSON.stringify(feedbacks, null, 2)}\n`,
      'utf8',
    )
    await fs.rename(temporaryFile, this.dataFile)
  }

  async mutate(operation) {
    const run = async () => {
      const feedbacks = await this.readAll()
      const result = await operation(feedbacks)
      await this.writeAll(feedbacks)
      return result
    }

    const result = this.writeQueue.then(run, run)
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  async create(input) {
    return this.mutate((feedbacks) => {
      const now = new Date().toISOString()
      const feedback = {
        id: randomUUID(),
        ...input,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        processedAt: null,
      }
      feedbacks.unshift(feedback)
      return feedback
    })
  }

  async list({ query = '', status = 'pending', page = 1, pageSize = 10 } = {}) {
    const safePageSize = toPositiveInteger(pageSize, 10, 100)
    const requestedPage = toPositiveInteger(page, 1, 100000)
    const matched = (await this.readAll())
      .filter((feedback) => feedback.status === status && matchesFeedback(feedback, query))
      .sort((first, second) => {
        const firstTime = status === 'processed' ? first.processedAt : first.createdAt
        const secondTime = status === 'processed' ? second.processedAt : second.createdAt
        return timestamp(secondTime) - timestamp(firstTime)
      })

    const total = matched.length
    const pageCount = Math.max(1, Math.ceil(total / safePageSize))
    const currentPage = Math.min(requestedPage, pageCount)
    const start = (currentPage - 1) * safePageSize

    return {
      items: matched.slice(start, start + safePageSize),
      total,
      page: currentPage,
      pageSize: safePageSize,
      pageCount,
    }
  }

  async setStatus(id, status) {
    return this.mutate((feedbacks) => {
      const index = feedbacks.findIndex((feedback) => feedback.id === id)
      if (index === -1) return null

      const now = new Date().toISOString()
      feedbacks[index] = {
        ...feedbacks[index],
        status,
        processedAt: status === 'processed' ? now : null,
        updatedAt: now,
      }
      return feedbacks[index]
    })
  }
}
