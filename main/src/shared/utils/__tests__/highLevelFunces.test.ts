import { describe, expect, it, vi } from 'vitest'
import { debounce, throttle, consumer } from '../highLevelFunces'

describe('highLevelFunces', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('debounce', () => {
        const fn = vi.fn()
        const debounced = debounce(fn, 1000)

        debounced('a')
        debounced('b')
        debounced('c')

        expect(fn).not.toHaveBeenCalled()
        vi.advanceTimersByTime(500)
        debounced('d')
        vi.advanceTimersByTime(500)
        expect(fn).not.toHaveBeenCalled()

        vi.advanceTimersByTime(500) // Total 1000 since 'd'
        expect(fn).toHaveBeenCalledTimes(1)
        expect(fn).toHaveBeenCalledWith('d')
    })

    it('throttle', () => {
        const fn = vi.fn()
        const throttled = throttle(fn, 1000)

        // First call immediate
        throttled('a')
        expect(fn).toHaveBeenCalledWith('a')

        // Subsequent ignored
        throttled('b')
        vi.advanceTimersByTime(500)
        throttled('c')
        expect(fn).toHaveBeenCalledTimes(1)

        // After timer reset
        vi.advanceTimersByTime(501)
        throttled('d')
        expect(fn).toHaveBeenCalledTimes(2)
        expect(fn).toHaveBeenLastCalledWith('d')
    })

    it('consumer', () => {
        const fn = vi.fn()
        const consume = consumer(fn, 100) // 100ms interval

        consume('a')
        consume('b')
        consume('c')

        // First one immediate?
        // Code: if (timer == null) { nextTask(); timer = setInterval... }
        // nextTask shifts and executes.
        // So 'a' immediate.
        expect(fn).toHaveBeenCalledTimes(1)
        expect(fn).toHaveBeenCalledWith('a')

        // 100ms later -> 'b'
        vi.advanceTimersByTime(100)
        expect(fn).toHaveBeenCalledTimes(2)
        expect(fn).toHaveBeenCalledWith('b')

        // 100ms later -> 'c'
        vi.advanceTimersByTime(100)
        expect(fn).toHaveBeenCalledTimes(3)
        expect(fn).toHaveBeenCalledWith('c')

        // 100ms later -> nothing, timer clears
        vi.advanceTimersByTime(100)
        expect(fn).toHaveBeenCalledTimes(3)

        // New task starts new timer
        consume('d')
        expect(fn).toHaveBeenCalledTimes(4)
    })
})
