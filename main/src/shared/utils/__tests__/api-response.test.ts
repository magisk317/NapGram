import { describe, expect, it } from 'vitest'
import { ApiResponse } from '../api-response'

describe('apiResponse', () => {
  it('should create success response', () => {
    // With data
    expect(ApiResponse.success('data')).toEqual({ success: true, data: 'data' })
    // With message
    expect(ApiResponse.success(undefined, 'msg')).toEqual({ success: true, message: 'msg' })
    // With both
    expect(ApiResponse.success('data', 'msg')).toEqual({ success: true, data: 'data', message: 'msg' })
    // Empty
    expect(ApiResponse.success()).toEqual({ success: true })
  })

  it('should create error response', () => {
    // Only message
    expect(ApiResponse.error('fail')).toEqual({ success: false, message: 'fail' })

    // With error string
    expect(ApiResponse.error('fail', 'err_str')).toEqual({
      success: false,
      message: 'fail',
      error: 'err_str',
    })

    // With error object
    const errObj = new Error('oops')
    expect(ApiResponse.error('fail', errObj)).toEqual({
      success: false,
      message: 'fail',
      error: 'oops',
    })

    // With object without message?
    expect(ApiResponse.error('fail', { foo: 'bar' })).toEqual({
      success: false,
      message: 'fail',
      error: '[object Object]', // String(error)
    })
  })

  it('should create paginated response', () => {
    const items = [1, 2]
    const resp = ApiResponse.paginated(items, 10, 1, 2)
    expect(resp).toEqual({
      success: true,
      items,
      total: 10,
      page: 1,
      pageSize: 2,
    })
  })
})
