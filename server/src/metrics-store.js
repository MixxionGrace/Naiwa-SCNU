import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PV_START_DATE = '2026-10-15'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultMetricsFile = path.resolve(currentDirectory, '../data/metrics.json')

function createInitialMetrics() {
  return {
    startDate: PV_START_DATE,
    pv: 0,
    updatedAt: null,
  }
}

function validateMetrics(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    value.startDate !== PV_START_DATE ||
    !Number.isSafeInteger(value.pv) ||
    value.pv < 0
  ) {
    throw new Error('PV 统计文件格式错误。')
  }

  return value
}

export class MetricsStore {
  constructor(dataFile = process.env.METRICS_FILE || defaultMetricsFile) {
    this.dataFile = dataFile
    this.initialization = null
    this.writeQueue = Promise.resolve()
  }

  async write(metrics) {
    await fs.mkdir(path.dirname(this.dataFile), { recursive: true })
    const temporaryFile = `${this.dataFile}.${process.pid}.tmp`
    await fs.writeFile(temporaryFile, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8')
    await fs.rename(temporaryFile, this.dataFile)
  }

  async ensureFile() {
    if (!this.initialization) {
      this.initialization = (async () => {
        try {
          await fs.access(this.dataFile)
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
          await this.write(createInitialMetrics())
        }
      })()
    }

    return this.initialization
  }

  async read() {
    await this.ensureFile()
    const contents = await fs.readFile(this.dataFile, 'utf8')
    return validateMetrics(JSON.parse(contents))
  }

  async getPv() {
    const metrics = await this.read()
    return {
      startDate: metrics.startDate,
      pv: metrics.pv,
    }
  }

  async incrementPv() {
    const run = async () => {
      const metrics = await this.read()
      const nextMetrics = {
        ...metrics,
        pv: metrics.pv + 1,
        updatedAt: new Date().toISOString(),
      }
      await this.write(nextMetrics)
      return {
        startDate: nextMetrics.startDate,
        pv: nextMetrics.pv,
      }
    }

    const result = this.writeQueue.then(run, run)
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
