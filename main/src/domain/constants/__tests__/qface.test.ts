import { describe, expect, it } from 'vitest'
import qface from '../qface'

describe('qface constants', () => {
  it('contains expected face mappings', () => {
    expect(qface[14]).toBe('/微笑')
    expect(qface[1]).toBe('/撇嘴')
    expect(qface[179]).toBe('/doge')
  })

  it('has a non-empty mapping table', () => {
    expect(Object.keys(qface).length).toBeGreaterThan(0)
  })
})
