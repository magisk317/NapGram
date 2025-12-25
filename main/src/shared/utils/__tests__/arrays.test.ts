import { describe, expect, it } from 'vitest'
import arrays from '../arrays'

describe('arrays utility', () => {
    it('should paginate correctly', () => {
        const list = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

        // Page 0, size 3 -> start 0, end 3 -> [1, 2, 3]
        expect(arrays.pagination(list, 3, 0)).toEqual([1, 2, 3])

        // Page 1, size 3 -> start 3, end 6 -> [4, 5, 6]
        expect(arrays.pagination(list, 3, 1)).toEqual([4, 5, 6])

        // Page 3, size 3 -> start 9, end 12 (slice stops at len) -> [10]
        expect(arrays.pagination(list, 3, 3)).toEqual([10])

        // Page 4, size 3 -> start 12 -> []
        expect(arrays.pagination(list, 3, 4)).toEqual([])

        // Exact fit
        // Page 1, size 10 (page 0) -> all
        expect(arrays.pagination(list, 10, 0)).toEqual(list)
    })
})
