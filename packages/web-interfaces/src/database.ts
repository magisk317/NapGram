import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authMiddleware, db, getLogger } from '@napgram/runtime-kit'

const logger = getLogger('database')

function normalizeBigInt(value: any): any {
  if (typeof value === 'bigint')
    return value.toString()
  if (Array.isArray(value))
    return value.map(normalizeBigInt)
  if (value && typeof value === 'object') {
    if (value instanceof Date)
      return value
    const entries = Object.entries(value).map(([key, item]) => [key, normalizeBigInt(item)])
    return Object.fromEntries(entries)
  }
  return value
}

/**
 * 数据库管理 API
 * 提供数据库表查询、SQL 执行等功能
 */
export default async function (fastify: FastifyInstance) {
  /**
   * 获取所有表名
   */
  fastify.get<{
    Querystring: { schema?: string }
  }>('/api/admin/database/tables', {
    preHandler: authMiddleware,
  }, async (request) => {
    try {
      const schemaName = request.query.schema || 'public'
      const result = await db.$queryRaw<{ tablename: string }[]>`
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = ${schemaName}
                ORDER BY tablename;
            `
      return {
        success: true,
        data: result.map(r => r.tablename),
      }
    }
    catch (error: any) {
      logger.error(error, 'database_tables_list_failed')
      throw error
    }
  })

  /**
   * 获取 schema 列表
   */
  fastify.get('/api/admin/database/schemas', {
    preHandler: authMiddleware,
  }, async () => {
    try {
      const result = await db.$queryRaw<{ schema_name: string }[]>`
                SELECT schema_name
                FROM information_schema.schemata
                WHERE schema_name NOT LIKE 'pg_%'
                  AND schema_name <> 'information_schema'
                ORDER BY schema_name;
            `
      return {
        success: true,
        data: result.map(r => r.schema_name),
      }
    }
    catch (error: any) {
      logger.error(error, 'database_schema_list_failed')
      throw error
    }
  })

  /**
   * 获取表结构
   */
  fastify.get<{
    Params: { tableName: string }
    Querystring: { schema?: string }
  }>('/api/admin/database/tables/:tableName/schema', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { tableName } = request.params
    const schemaName = request.query.schema || 'public'

    try {
      // 验证表名是否存在
      const tables = await db.$queryRaw<{ tablename: string }[]>`
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = ${schemaName} AND tablename = ${tableName};
            `

      if (tables.length === 0) {
        return reply.code(404).send({
          success: false,
          error: '表不存在',
        })
      }

      const columns = await db.$queryRaw<{
        column_name: string
        data_type: string
        is_nullable: string
        column_default: string | null
      }[]>`
                SELECT 
                    column_name,
                    data_type,
                    is_nullable,
                    column_default
                FROM information_schema.columns
                WHERE table_schema = ${schemaName} 
                  AND table_name = ${tableName}
                ORDER BY ordinal_position;
            `

      return { success: true, data: columns }
    }
    catch (error: any) {
      logger.error(error, 'database_schema_fetch_failed')
      return reply.code(500).send({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * 查询表数据（分页）
   */
  fastify.get<{
    Params: { tableName: string }
    Querystring: {
      page?: string
      pageSize?: string
      sortBy?: string
      sortOrder?: string
      schema?: string
    }
  }>('/api/admin/database/tables/:tableName/data', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { tableName } = request.params
    const {
      page = '1',
      pageSize = '50',
      sortBy,
      sortOrder = 'ASC',
      schema = 'public',
    } = request.query

    try {
      // 验证表名
      const tables = await db.$queryRaw<{ tablename: string }[]>`
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = ${schema} AND tablename = ${tableName};
            `

      if (tables.length === 0) {
        return reply.code(404).send({
          success: false,
          error: '表不存在',
        })
      }

      const pageNum = Number.parseInt(page, 10)
      const pageSizeNum = Math.min(Number.parseInt(pageSize, 10), 200) // 最大 200 条
      const offset = (pageNum - 1) * pageSizeNum

      // 构建排序子句
      let orderClause = ''
      if (sortBy) {
        // 验证列名存在
        const columns = await db.$queryRaw<{ column_name: string }[]>`
                    SELECT column_name 
                    FROM information_schema.columns
                    WHERE table_schema = ${schema} 
                      AND table_name = ${tableName}
                      AND column_name = ${sortBy};
                `

        if (columns.length > 0) {
          const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
          orderClause = `ORDER BY "${sortBy}" ${order}`
        }
      }

      // 查询数据
      const data = await db.$queryRawUnsafe(
        `SELECT * FROM "${schema}"."${tableName}" ${orderClause} LIMIT $1 OFFSET $2`,
        pageSizeNum,
        offset,
      )

      // 查询总数
      const countResult = await db.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) as count FROM "${schema}"."${tableName}"`,
      )

      return {
        success: true,
        data: {
          rows: normalizeBigInt(data),
          total: Number(countResult[0].count),
          page: pageNum,
          pageSize: pageSizeNum,
        },
      }
    }
    catch (error: any) {
      logger.error(error, 'database_data_fetch_failed')
      return reply.code(500).send({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * 执行自定义 SQL 查询
   */
  const querySchema = z.object({
    sql: z.string().min(1, 'SQL 不能为空'),
    readOnly: z.boolean().default(true),
  })

  fastify.post<{
    Body: {
      sql: string
      readOnly?: boolean
    }
  }>('/api/admin/database/query', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    try {
      const { sql, readOnly } = querySchema.parse(request.body)
      const auth = (request as any).auth

      // 只读模式检查
      if (readOnly && !/^\s*SELECT/i.test(sql.trim())) {
        return reply.code(403).send({
          success: false,
          error: '只读模式下仅允许 SELECT 查询',
        })
      }

      // 危险操作检测
      const dangerousKeywords = ['DROP', 'TRUNCATE', 'ALTER', 'CREATE']

      for (const keyword of dangerousKeywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i')
        if (regex.test(sql)) {
          return reply.code(403).send({
            success: false,
            error: `不允许执行包含 ${keyword} 的操作`,
          })
        }
      }

      // 执行查询
      const result = await db.$queryRawUnsafe(sql)
      const rowCount = Array.isArray(result) ? result.length : 0

      // 记录审计日志
      await db.adminAuditLog.create({
        data: {
          userId: auth.userId,
          action: 'database_query',
          resource: 'database',
          details: {
            sql: sql.substring(0, 500), // 截断过长的 SQL
            rowCount,
          },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
      }).catch((err) => {
        logger.warn(err, 'audit_log_failed')
      })

      return {
        success: true,
        data: normalizeBigInt(result),
        rowCount,
      }
    }
    catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: error.issues[0].message,
        })
      }

      logger.error(error, 'database_query_failed')
      return reply.code(400).send({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * 更新记录
   */
  fastify.put<{
    Params: { tableName: string, id: string }
    Querystring: { schema?: string }
    Body: Record<string, any>
  }>('/api/admin/database/tables/:tableName/rows/:id', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { tableName, id } = request.params
    const schemaName = request.query.schema || 'public'
    const updates = request.body
    const auth = (request as any).auth

    try {
      // 验证表名
      const tables = await db.$queryRaw<{ tablename: string }[]>`
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = ${schemaName} AND tablename = ${tableName};
            `

      if (tables.length === 0) {
        return reply.code(404).send({
          success: false,
          error: '表不存在',
        })
      }

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({
          success: false,
          error: '没有要更新的字段',
        })
      }

      // 构建 UPDATE SQL
      const setEntries = Object.entries(updates)
      const setClauses = setEntries
        .map((_, idx) => `"${setEntries[idx][0]}" = $${idx + 1}`)
        .join(', ')
      const values = setEntries.map(([_, value]) => value)

      await db.$executeRawUnsafe(
        `UPDATE "${schemaName}"."${tableName}" SET ${setClauses} WHERE id = $${values.length + 1}`,
        ...values,
        id,
      )

      // 审计日志
      await db.adminAuditLog.create({
        data: {
          userId: auth.userId,
          action: 'database_update',
          resource: tableName,
          resourceId: String(id),
          details: updates,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
      }).catch((err) => {
        logger.warn(err, 'audit_log_failed')
      })

      return { success: true }
    }
    catch (error: any) {
      logger.error(error, 'database_update_failed')
      return reply.code(400).send({
        success: false,
        error: error.message,
      })
    }
  })

  /**
   * 删除记录
   */
  fastify.delete<{
    Params: { tableName: string, id: string }
    Querystring: { schema?: string }
  }>('/api/admin/database/tables/:tableName/rows/:id', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { tableName, id } = request.params
    const schemaName = request.query.schema || 'public'
    const auth = (request as any).auth

    try {
      // 验证表名
      const tables = await db.$queryRaw<{ tablename: string }[]>`
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = ${schemaName} AND tablename = ${tableName};
            `

      if (tables.length === 0) {
        return reply.code(404).send({
          success: false,
          error: '表不存在',
        })
      }

      // 删除记录
      await db.$executeRawUnsafe(
        `DELETE FROM "${schemaName}"."${tableName}" WHERE id = $1`,
        id,
      )

      // 审计日志
      await db.adminAuditLog.create({
        data: {
          userId: auth.userId,
          action: 'database_delete',
          resource: tableName,
          resourceId: String(id),
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
      }).catch((err) => {
        logger.warn(err, 'audit_log_failed')
      })

      return { success: true }
    }
    catch (error: any) {
      logger.error(error, 'database_delete_failed')
      return reply.code(400).send({
        success: false,
        error: error.message,
      })
    }
  })
}
