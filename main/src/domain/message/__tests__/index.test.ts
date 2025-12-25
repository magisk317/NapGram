import { describe, expect, it } from 'vitest'
import * as message from '../index'

describe('message index', () => {
  it('re-exports converter API', () => {
    expect(typeof message.MessageConverter).toBe('function')
    expect(message.messageConverter).toBeTruthy()
  })
})
