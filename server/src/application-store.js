import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultDataFile = path.resolve(currentDirectory, '../data/applications.json')

function normalizeSearchText(value) {
  return String(value)
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

function matchesApplication(application, query) {
  const terms = String(query).trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return true

  return terms.every(
    (term) =>
      fuzzyContains(application.name, term) ||
      application.keywords.some((keyword) => fuzzyContains(keyword, term)) ||
      fuzzyContains(application.qq, term) ||
      fuzzyContains(application.applicantQq, term),
  )
}

function matchesStatus(application, status) {
  if (!status) return true
  if (status === 'reviewed') return application.status !== 'pending'
  return application.status === status
}

function reviewedAtTimestamp(application) {
  const timestamp = Date.parse(application.reviewedAt || '')
  return Number.isFinite(timestamp) ? timestamp : 0
}

function toPositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, maximum)
}

export class ApplicationStore {
  constructor(dataFile = process.env.APPLICATIONS_FILE || defaultDataFile) {
    this.dataFile = dataFile
    this.writeQueue = Promise.resolve()
  }

  async readAll() {
    try {
      const contents = await fs.readFile(this.dataFile, 'utf8')
      const applications = JSON.parse(contents)
      if (!Array.isArray(applications)) throw new Error('申请资料文件格式错误。')
      return applications
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }

  async writeAll(applications) {
    await fs.mkdir(path.dirname(this.dataFile), { recursive: true })
    const temporaryFile = `${this.dataFile}.${process.pid}.tmp`
    await fs.writeFile(
      temporaryFile,
      `${JSON.stringify(applications, null, 2)}\n`,
      'utf8',
    )
    await fs.rename(temporaryFile, this.dataFile)
  }

  async list({ query = '', status = 'pending', page = 1, pageSize = 10 } = {}) {
    const safePageSize = toPositiveInteger(pageSize, 10, 100)
    const requestedPage = toPositiveInteger(page, 1, 100000)
    const applications = await this.readAll()
    const matchedApplications = applications
      .filter(
        (application) =>
          matchesStatus(application, status) &&
          matchesApplication(application, query),
      )
      .sort((first, second) =>
        status === 'reviewed'
          ? reviewedAtTimestamp(second) - reviewedAtTimestamp(first)
          : 0,
      )

    const total = matchedApplications.length
    const pageCount = Math.max(1, Math.ceil(total / safePageSize))
    const currentPage = Math.min(requestedPage, pageCount)
    const start = (currentPage - 1) * safePageSize

    return {
      items: matchedApplications.slice(start, start + safePageSize),
      total,
      page: currentPage,
      pageSize: safePageSize,
      pageCount,
    }
  }

  async findPendingByQq(qq, { excludeId = '' } = {}) {
    const normalizedQq = String(qq ?? '').replace(/\s+/g, '')
    const applications = await this.readAll()
    return applications.find(
      (application) =>
        application.qq === normalizedQq &&
        application.status === 'pending' &&
        application.id !== excludeId,
    ) || null
  }

  async mutate(operation) {
    const run = async () => {
      const applications = await this.readAll()
      const result = await operation(applications)
      await this.writeAll(applications)
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
    return this.mutate((applications) => {
      const now = new Date().toISOString()
      const application = {
        id: randomUUID(),
        ...input,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        reviewedAt: null,
        approvedGroupId: null,
      }
      applications.unshift(application)
      return application
    })
  }

  async updatePending(id, input) {
    return this.mutate((applications) => {
      const index = applications.findIndex((application) => application.id === id)
      if (index === -1) return { item: null, reason: 'missing' }
      if (applications[index].status !== 'pending') {
        return { item: null, reason: 'reviewed' }
      }

      applications[index] = {
        ...applications[index],
        ...input,
        updatedAt: new Date().toISOString(),
      }
      return { item: applications[index], reason: '' }
    })
  }

  async review(id, status, { approvedGroupId = null } = {}) {
    return this.mutate((applications) => {
      const index = applications.findIndex((application) => application.id === id)
      if (index === -1) return { item: null, reason: 'missing' }
      if (applications[index].status !== 'pending') {
        return { item: null, reason: 'reviewed' }
      }

      const now = new Date().toISOString()
      const reviewedApplication = {
        ...applications[index],
        status,
        approvedGroupId,
        reviewedAt: now,
        updatedAt: now,
      }
      applications[index] = reviewedApplication
      return { item: reviewedApplication, reason: '' }
    })
  }
}
