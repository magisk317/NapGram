import type { FastifyInstance } from 'fastify'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { authMiddleware, env } from '@napgram/runtime-kit'

/**
 * 系统日志 API
 */
export default async function (fastify: FastifyInstance) {
  /**
   * GET /api/admin/logs
   * 获取最近的系统日志
   */
  fastify.get('/api/admin/logs', {
    preHandler: authMiddleware,
  }, async (request) => {
    const { limit = 100, level } = request.query as { limit?: number, level?: string }

    try {
      const logDir = path.dirname(env.LOG_FILE)

      // 获取当前日期的日志文件
      const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: process.env.TZ || 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      const currentDate = dateFormatter.format(new Date())
      const todayLogFile = path.join(logDir, `${currentDate}.1.log`)

      // 尝试读取今天和昨天的日志文件
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayDate = dateFormatter.format(yesterday)
      const yesterdayLogFile = path.join(logDir, `${yesterdayDate}.1.log`)

      const possibleFiles = [
        todayLogFile,
        yesterdayLogFile,
        env.LOG_FILE, // 原始路径
      ].filter(Boolean)

      let allLogs: any[] = []

      for (const logFile of possibleFiles) {
        try {
          const content = await fs.readFile(logFile, 'utf-8')
          const lines = content.split('\n').filter(line => line.trim())

          // Parse JSON log entries
          for (const line of lines) {
            try {
              const entry = JSON.parse(line)
              allLogs.push({
                time: entry.time,
                level: entry.level?.toUpperCase() || 'INFO',
                module: entry.logger || 'System',
                message: Array.isArray(entry.messages) ? entry.messages.join(' ') : String(entry.messages || ''),
              })
            }
            catch {
              // Skip invalid JSON lines
            }
          }

          // If we got enough logs from today, break
          if (allLogs.length >= limit * 2)
            break
        }
        catch {
          // File doesn't exist or can't be read, try next
          continue
        }
      }

      // Filter by level if specified
      if (level) {
        allLogs = allLogs.filter(log => log.level.toLowerCase() === level.toLowerCase())
      }

      // Sort by time descending and limit
      allLogs.sort((a, b) => b.time.localeCompare(a.time))
      const logs = allLogs.slice(0, limit)

      return {
        success: true,
        data: logs,
        total: logs.length,
        logFile: possibleFiles[0],
      }
    }
    catch (err: any) {
      fastify.log.error(err, 'Failed to read log file')
      // 返回系统启动日志作为fallback
      return {
        success: true,
        data: [{
          time: new Date().toISOString(),
          level: 'INFO',
          module: 'System',
          message: `NapGram is running. Log files in: ${path.dirname(env.LOG_FILE)}`,
        }, {
          time: new Date().toISOString(),
          level: 'WARN',
          module: 'LogReader',
          message: `Could not read log files: ${err.message}`,
        }],
        total: 2,
      }
    }
  })
}
