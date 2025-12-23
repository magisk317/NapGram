/**
 * 通用API响应工具类
 * 用于统一Web API的响应格式
 */
export class ApiResponse {
  /**
   * 创建成功响应
   */
  static success<T = any>(data?: T, message?: string) {
    const response: any = {
      success: true,
    }

    if (data !== undefined) {
      response.data = data
    }

    if (message) {
      response.message = message
    }

    return response
  }

  /**
   * 创建错误响应
   */
  static error(message: string, error?: any) {
    const response: any = {
      success: false,
      message,
    }

    if (error) {
      response.error = typeof error === 'string' ? error : (error?.message || String(error))
    }

    return response
  }

  /**
   * 创建分页响应
   */
  static paginated<T = any>(
    items: T[],
    total: number,
    page: number,
    pageSize: number,
  ) {
    return {
      success: true as const,
      items,
      total,
      page,
      pageSize,
    }
  }
}

/**
 * API响应类型定义
 */
export interface ApiSuccessResponse<T = any> {
  success: true
  data?: T
  message?: string
}

export interface ApiErrorResponse {
  success: false
  message: string
  error?: any
  details?: any
}

export interface ApiPaginatedResponse<T = any> {
  success: true
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type ApiResult<T = any> = ApiSuccessResponse<T> | ApiErrorResponse
