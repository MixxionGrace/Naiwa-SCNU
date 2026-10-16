import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultActivitiesFile = path.resolve(currentDirectory, '../data/activities.json')
const defaultApplicationsFile = path.resolve(
  currentDirectory,
  '../data/activity-applications.json',
)

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

function matchesActivity(activity, query, { includeApplicant = false } = {}) {
  const terms = String(query ?? '').trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return true

  const sources = [
    activity.title,
    activity.content,
    activity.groupName,
    activity.groupQq,
    ...(activity.modes || []),
    ...(activity.modes || []).map((mode) =>
      mode === 'online' ? '线上' : mode === 'offline' ? '线下' : mode,
    ),
    ...(includeApplicant ? [activity.applicantQq] : []),
  ]

  return terms.every((term) => sources.some((source) => fuzzyContains(source, term)))
}

function toPositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, maximum)
}

function paginate(items, { page = 1, pageSize = 12 } = {}) {
  const safePageSize = toPositiveInteger(pageSize, 12, 100)
  const requestedPage = toPositiveInteger(page, 1, 100000)
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / safePageSize))
  const currentPage = Math.min(requestedPage, pageCount)
  const start = (currentPage - 1) * safePageSize

  return {
    items: items.slice(start, start + safePageSize),
    total,
    page: currentPage,
    pageSize: safePageSize,
    pageCount,
  }
}

function matchesApplicationStatus(application, status) {
  if (!status) return true
  if (status === 'reviewed') return application.status !== 'pending'
  return application.status === status
}

function reviewedAtTimestamp(application) {
  const timestamp = Date.parse(application.reviewedAt || '')
  return Number.isFinite(timestamp) ? timestamp : 0
}

function compareTitles(first, second) {
  return String(first.title).localeCompare(String(second.title), 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  })
}

function earliestTime(activity) {
  const timestamps = (activity.times || [])
    .map((value) => Date.parse(value))
    .filter(Number.isFinite)
  return timestamps.length ? Math.min(...timestamps) : Number.MAX_SAFE_INTEGER
}

class JsonCollectionStore {
  constructor(dataFile) {
    this.dataFile = dataFile
    this.writeQueue = Promise.resolve()
  }

  async readAll() {
    try {
      const contents = await fs.readFile(this.dataFile, 'utf8')
      const items = JSON.parse(contents)
      if (!Array.isArray(items)) throw new Error('活动资料文件格式错误。')
      return items
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }

  async writeAll(items) {
    await fs.mkdir(path.dirname(this.dataFile), { recursive: true })
    const temporaryFile = `${this.dataFile}.${process.pid}.tmp`
    await fs.writeFile(temporaryFile, `${JSON.stringify(items, null, 2)}\n`, 'utf8')
    await fs.rename(temporaryFile, this.dataFile)
  }

  async mutate(operation) {
    const run = async () => {
      const items = await this.readAll()
      const result = await operation(items)
      await this.writeAll(items)
      return result
    }

    const result = this.writeQueue.then(run, run)
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

export class ActivityStore extends JsonCollectionStore {
  constructor(dataFile = process.env.ACTIVITIES_FILE || defaultActivitiesFile) {
    super(dataFile)
  }

  async list({ query = '', page = 1, pageSize = 12 } = {}) {
    const activities = (await this.readAll())
      .filter((activity) => matchesActivity(activity, query))
      .sort((first, second) => {
        if (Boolean(first.pinned) !== Boolean(second.pinned)) {
          return first.pinned ? -1 : 1
        }
        if (first.pinned && second.pinned) return compareTitles(first, second)
        return earliestTime(first) - earliestTime(second) || compareTitles(first, second)
      })

    return paginate(activities, { page, pageSize })
  }

  async create(input) {
    return this.mutate((activities) => {
      const now = new Date().toISOString()
      const activity = {
        id: randomUUID(),
        ...input,
        pinned: Boolean(input.pinned),
        createdAt: now,
        updatedAt: now,
      }
      activities.push(activity)
      return activity
    })
  }

  async update(id, input) {
    return this.mutate((activities) => {
      const index = activities.findIndex((activity) => activity.id === id)
      if (index === -1) return null
      activities[index] = {
        ...activities[index],
        ...input,
        pinned: Boolean(input.pinned),
        updatedAt: new Date().toISOString(),
      }
      return activities[index]
    })
  }

  async setPinned(id, pinned) {
    return this.mutate((activities) => {
      const index = activities.findIndex((activity) => activity.id === id)
      if (index === -1) return null
      activities[index] = {
        ...activities[index],
        pinned: Boolean(pinned),
        updatedAt: new Date().toISOString(),
      }
      return activities[index]
    })
  }

  async remove(id) {
    return this.mutate((activities) => {
      const index = activities.findIndex((activity) => activity.id === id)
      if (index === -1) return null
      const [removed] = activities.splice(index, 1)
      return removed
    })
  }
}

export class ActivityApplicationStore extends JsonCollectionStore {
  constructor(
    dataFile = process.env.ACTIVITY_APPLICATIONS_FILE || defaultApplicationsFile,
  ) {
    super(dataFile)
  }

  async list({ query = '', status = 'pending', page = 1, pageSize = 10 } = {}) {
    const applications = (await this.readAll())
      .filter(
        (application) =>
          matchesApplicationStatus(application, status) &&
          matchesActivity(application, query, { includeApplicant: true }),
      )
      .sort((first, second) =>
        status === 'reviewed'
          ? reviewedAtTimestamp(second) - reviewedAtTimestamp(first)
          : 0,
      )
    return paginate(applications, { page, pageSize })
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
        approvedActivityId: null,
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

  async review(id, status, { approvedActivityId = null } = {}) {
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
        approvedActivityId,
        reviewedAt: now,
        updatedAt: now,
      }
      applications[index] = reviewedApplication
      return { item: reviewedApplication, reason: '' }
    })
  }
}
