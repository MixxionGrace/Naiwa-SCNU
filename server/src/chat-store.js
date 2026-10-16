import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORACLE_DOCUMENT } from './oracle-document.js'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultDataFile = path.resolve(currentDirectory, '../data/chat-room.json')

function emptyRoom() {
  return {
    messages: [],
    comments: [],
  }
}

function parseTimestamp(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : 0
}

function canDelete(item, actor) {
  return actor.role === 'superadmin' || item.authorUsername === actor.username
}

export class ChatRoomStore {
  constructor(dataFile = process.env.CHAT_ROOM_FILE || defaultDataFile) {
    this.dataFile = dataFile
    this.writeQueue = Promise.resolve()
  }

  async read() {
    try {
      const contents = await fs.readFile(this.dataFile, 'utf8')
      const room = JSON.parse(contents)
      if (!room || !Array.isArray(room.messages) || !Array.isArray(room.comments)) {
        throw new Error('协作房间资料文件格式错误。')
      }
      return {
        // Preserve saved drafts from the former editor without displaying or changing them.
        ...(room.document ? { document: room.document } : {}),
        messages: room.messages,
        comments: room.comments.map((comment) => ({
          ...comment,
          quote: typeof comment.quote === 'string' ? comment.quote : '',
        })),
      }
    } catch (error) {
      if (error.code === 'ENOENT') return emptyRoom()
      throw error
    }
  }

  async write(room) {
    await fs.mkdir(path.dirname(this.dataFile), { recursive: true })
    const temporaryFile = `${this.dataFile}.${process.pid}.tmp`
    await fs.writeFile(
      temporaryFile,
      `${JSON.stringify(room, null, 2)}\n`,
      'utf8',
    )
    await fs.rename(temporaryFile, this.dataFile)
  }

  async mutate(operation) {
    const run = async () => {
      const room = await this.read()
      const result = await operation(room)
      await this.write(room)
      return result
    }

    const result = this.writeQueue.then(run, run)
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  async snapshot({ messageLimit = 150 } = {}) {
    const room = await this.read()
    const safeLimit = Math.min(Math.max(Number.parseInt(messageLimit, 10) || 150, 1), 300)
    const messages = [...room.messages]
      .sort((first, second) => parseTimestamp(first.createdAt) - parseTimestamp(second.createdAt))
      .slice(-safeLimit)
    const comments = [...room.comments].sort(
      (first, second) => parseTimestamp(second.createdAt) - parseTimestamp(first.createdAt),
    )
    return {
      messages,
      comments,
      document: { ...ORACLE_DOCUMENT },
    }
  }

  async createMessage(content, actor) {
    return this.mutate((room) => {
      const message = {
        id: randomUUID(),
        content,
        authorUsername: actor.username,
        authorRole: actor.role,
        createdAt: new Date().toISOString(),
      }
      room.messages.push(message)
      if (room.messages.length > 1000) room.messages.splice(0, room.messages.length - 1000)
      return message
    })
  }

  async removeMessage(id, actor) {
    return this.mutate((room) => {
      const index = room.messages.findIndex((message) => message.id === id)
      if (index === -1) return { item: null, reason: 'missing' }
      if (!canDelete(room.messages[index], actor)) {
        return { item: null, reason: 'forbidden' }
      }
      const [item] = room.messages.splice(index, 1)
      return { item, reason: '' }
    })
  }

  async createComment({ content, quote, sectionId, documentVersion }, actor) {
    return this.mutate((room) => {
      const comment = {
        id: randomUUID(),
        content,
        quote,
        sectionId,
        documentVersion,
        authorUsername: actor.username,
        authorRole: actor.role,
        createdAt: new Date().toISOString(),
      }
      room.comments.unshift(comment)
      if (room.comments.length > 2000) room.comments.length = 2000
      return comment
    })
  }

  async removeComment(id, actor) {
    return this.mutate((room) => {
      const index = room.comments.findIndex((comment) => comment.id === id)
      if (index === -1) return { item: null, reason: 'missing' }
      if (!canDelete(room.comments[index], actor)) {
        return { item: null, reason: 'forbidden' }
      }
      const [item] = room.comments.splice(index, 1)
      return { item, reason: '' }
    })
  }
}
