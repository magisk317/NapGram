import { describe, expect, it, vi } from 'vitest'
import { registerDualRoute, ErrorResponses } from '../fastify'

describe('fastify utility', () => {
    describe('registerDualRoute', () => {
        it('should register handler for both paths', () => {
            const fastify = {
                get: vi.fn()
            } as any
            const handler = vi.fn()
            const opts = { schema: { foo: 'bar' } }

            registerDualRoute(fastify, '/p1', '/p2', handler, opts)

            expect(fastify.get).toHaveBeenCalledTimes(2)
            expect(fastify.get).toHaveBeenNthCalledWith(1, '/p1', { schema: opts.schema }, handler)
            expect(fastify.get).toHaveBeenNthCalledWith(2, '/p2', { schema: opts.schema }, handler)
        })

        it('should handle missing opts', () => {
            const fastify = { get: vi.fn() } as any
            const handler = vi.fn()
            registerDualRoute(fastify, '/p1', '/p2', handler)
            expect(fastify.get).toHaveBeenCalledWith('/p1', {}, handler)
        })
    })

    describe('ErrorResponses', () => {
        const createMockReply = () => {
            const reply = {
                code: vi.fn().mockReturnThis(),
                send: vi.fn().mockReturnThis()
            } as any
            return reply
        }

        it('should send notFound', () => {
            const reply = createMockReply()
            ErrorResponses.notFound(reply)
            expect(reply.code).toHaveBeenCalledWith(404)
            expect(reply.send).toHaveBeenCalledWith({ error: 'Not Found' })

            ErrorResponses.notFound(reply, 'Custom')
            expect(reply.send).toHaveBeenCalledWith({ error: 'Custom' })
        })

        it('should send badRequest', () => {
            const reply = createMockReply()
            ErrorResponses.badRequest(reply)
            expect(reply.code).toHaveBeenCalledWith(400)
            expect(reply.send).toHaveBeenCalledWith({ error: 'Bad Request' })
        })

        it('should send unauthorized', () => {
            const reply = createMockReply()
            ErrorResponses.unauthorized(reply)
            expect(reply.code).toHaveBeenCalledWith(401)
            expect(reply.send).toHaveBeenCalledWith({ error: 'Unauthorized' })
        })

        it('should send forbidden', () => {
            const reply = createMockReply()
            ErrorResponses.forbidden(reply)
            expect(reply.code).toHaveBeenCalledWith(403)
            expect(reply.send).toHaveBeenCalledWith({ error: 'Forbidden' })
        })

        it('should send internalError', () => {
            const reply = createMockReply()
            ErrorResponses.internalError(reply)
            expect(reply.code).toHaveBeenCalledWith(500)
            expect(reply.send).toHaveBeenCalledWith({ error: 'Internal Server Error' })
        })
    })
})
