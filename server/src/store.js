import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultDataFile = path.resolve(currentDirectory, '../data/groups.json')

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

function matchGroup(group, query) {
  const terms = String(query).trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return { matches: true, matchLabel: '全部群聊', score: 3 }

  const nameMatched = terms.some((term) => fuzzyContains(group.name, term))
  const keywordMatched = terms.some((term) =>
    group.keywords.some((keyword) => fuzzyContains(keyword, term)),
  )
  const qqMatched = terms.some((term) => fuzzyContains(group.qq, term))
  const allTermsMatch = terms.every(
    (term) =>
      fuzzyContains(group.name, term) ||
      group.keywords.some((keyword) => fuzzyContains(keyword, term)) ||
      fuzzyContains(group.qq, term),
  )

  if (!allTermsMatch) return { matches: false }

  let matchLabel = '关键词匹配'
  if (nameMatched && keywordMatched) matchLabel = '群名与关键词匹配'
  else if (nameMatched) matchLabel = '群名匹配'
  else if (qqMatched) matchLabel = 'QQ 群号匹配'

  return {
    matches: true,
    matchLabel,
    score: nameMatched ? 0 : keywordMatched ? 1 : 2,
  }
}

function toPositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, maximum)
}

export class GroupStore {
  constructor(dataFile = process.env.DATA_FILE || defaultDataFile) {
    this.dataFile = dataFile
    this.writeQueue = Promise.resolve()
  }

  async readAll() {
    const contents = await fs.readFile(this.dataFile, 'utf8')
    const groups = JSON.parse(contents)
    if (!Array.isArray(groups)) throw new Error('群资料文件格式错误。')
    return groups
  }

  async writeAll(groups) {
    await fs.mkdir(path.dirname(this.dataFile), { recursive: true })
    const temporaryFile = `${this.dataFile}.${process.pid}.tmp`
    await fs.writeFile(temporaryFile, `${JSON.stringify(groups, null, 2)}\n`, 'utf8')
    await fs.rename(temporaryFile, this.dataFile)
  }

  async list({ query = '', page = 1, pageSize = 20 } = {}) {
    const safePageSize = toPositiveInteger(pageSize, 20, 100)
    const requestedPage = toPositiveInteger(page, 1, 100000)
    const groups = await this.readAll()
    const matchedGroups = groups
      .map((group, index) => {
        const match = matchGroup(group, query)
        return match.matches
          ? { ...group, matchLabel: match.matchLabel, matchScore: match.score, sourceIndex: index }
          : null
      })
      .filter(Boolean)
      .sort(
        (first, second) =>
          first.matchScore - second.matchScore || first.sourceIndex - second.sourceIndex,
      )
      .map(({ matchScore, sourceIndex, ...group }) => group)

    const total = matchedGroups.length
    const pageCount = Math.max(1, Math.ceil(total / safePageSize))
    const currentPage = Math.min(requestedPage, pageCount)
    const start = (currentPage - 1) * safePageSize

    return {
      items: matchedGroups.slice(start, start + safePageSize),
      total,
      page: currentPage,
      pageSize: safePageSize,
      pageCount,
    }
  }

  async findByQq(qq, { excludeId = '' } = {}) {
    const normalizedQq = String(qq ?? '').replace(/\s+/g, '')
    const groups = await this.readAll()
    return groups.find(
      (group) => group.qq === normalizedQq && group.id !== excludeId,
    ) || null
  }

  async mutate(operation) {
    const run = async () => {
      const groups = await this.readAll()
      const result = await operation(groups)
      await this.writeAll(groups)
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
    return this.mutate((groups) => {
      const now = new Date().toISOString()
      const group = {
        id: randomUUID(),
        ...input,
        createdAt: now,
        updatedAt: now,
      }
      groups.unshift(group)
      return group
    })
  }

  async createUnique(input) {
    return this.mutate((groups) => {
      const duplicate = groups.find((group) => group.qq === input.qq)
      if (duplicate) return { item: null, duplicate }

      const now = new Date().toISOString()
      const group = {
        id: randomUUID(),
        ...input,
        createdAt: now,
        updatedAt: now,
      }
      groups.unshift(group)
      return { item: group, duplicate: null }
    })
  }

  async update(id, input) {
    return this.mutate((groups) => {
      const index = groups.findIndex((group) => group.id === id)
      if (index === -1) return null

      groups[index] = {
        ...groups[index],
        ...input,
        updatedAt: new Date().toISOString(),
      }
      return groups[index]
    })
  }

  async updateUnique(id, input) {
    return this.mutate((groups) => {
      const index = groups.findIndex((group) => group.id === id)
      if (index === -1) return { item: null, duplicate: null, missing: true }

      const duplicate = groups.find(
        (group) => group.qq === input.qq && group.id !== id,
      )
      if (duplicate) return { item: null, duplicate, missing: false }

      groups[index] = {
        ...groups[index],
        ...input,
        updatedAt: new Date().toISOString(),
      }
      return { item: groups[index], duplicate: null, missing: false }
    })
  }

  async remove(id) {
    return this.mutate((groups) => {
      const index = groups.findIndex((group) => group.id === id)
      if (index === -1) return null
      const [removed] = groups.splice(index, 1)
      return removed
    })
  }
}
