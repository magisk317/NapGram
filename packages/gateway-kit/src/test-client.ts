import type { Buffer } from 'node:buffer'
/**
 * Gateway 测试客户端
 * 用于测试 Gateway Server 的连接、认证和事件接收
 */

import process from 'node:process'
import WebSocket from 'ws'

const GATEWAY_URL = 'ws://localhost:8765'
const AUTH_TOKEN = process.env.ADMIN_TOKEN || 'your-admin-token'

interface Frame {
  op: string
  v: number
  t: number
  data?: any
}

async function testGatewayClient() {
  console.log('🚀 Connecting to Gateway:', GATEWAY_URL)

  const ws = new WebSocket(GATEWAY_URL)

  ws.on('open', () => {
    console.log('✅ Connected to Gateway')
  })

  ws.on('message', (data: Buffer) => {
    const frame: Frame = JSON.parse(data.toString())
    console.log(`📥 Received frame: ${frame.op}`, frame)

    switch (frame.op) {
      case 'hello': {
        console.log('👋 Received Hello, sending Identify...')
        // 发送 Identify 帧
        const identify = {
          op: 'identify',
          v: 1,
          t: Date.now(),
          data: {
            token: AUTH_TOKEN,
            scope: {
              instances: [0], // 订阅实例 0
            },
          },
        }
        ws.send(JSON.stringify(identify))
        break
      }

      case 'ready':
        console.log('✅ Authenticated! Ready to receive events')
        console.log('User:', frame.data.user)
        console.log('Instances:', frame.data.instances)
        if (frame.data.instances?.[0]?.pairs) {
          console.log('Pairs (instance 0):', frame.data.instances[0].pairs)
        }

        // 开始心跳
        setInterval(() => {
          const ping = {
            op: 'ping',
            v: 1,
            t: Date.now(),
          }
          ws.send(JSON.stringify(ping))
          console.log('💓 Sent ping')
        }, 25000)
        break

      case 'pong':
        console.log('💓 Received pong')
        break

      case 'event':
        console.log('🎉 Event received:', frame.data.type)
        console.log('Event data:', JSON.stringify(frame.data, null, 2))

        // 如果是 message.created，尝试回复
        if (frame.data.type === 'message.created') {
          const channelId = frame.data.channelId
          const messageId = frame.data.message.messageId
          const instanceId = frame.data.instanceId ?? 0

          console.log(`📨 Message from ${frame.data.actor.name} in ${channelId}`)

          // 发送回复（Echo）
          const call = {
            op: 'call',
            v: 1,
            t: Date.now(),
            data: {
              id: `call-${Date.now()}`,
              instanceId,
              action: 'message.send',
              params: {
                channelId,
                segments: [
                  {
                    type: 'text',
                    data: { text: `Echo: 收到消息 ${messageId}` },
                  },
                ],
              },
            },
          }
          ws.send(JSON.stringify(call))
          console.log('🔄 Sent echo reply')
        }
        break

      case 'result':
        console.log('📤 Action result:', frame.data)
        if (frame.data.success) {
          console.log('✅ Action executed successfully')
        }
        else {
          console.log('❌ Action failed:', frame.data.error)
        }
        break

      case 'error':
        console.error('❌ Error from server:', frame.data)
        if (frame.data.fatal) {
          console.log('💀 Fatal error, closing connection')
          ws.close()
        }
        break

      default:
        console.warn('Unknown op:', frame.op)
    }
  })

  ws.on('close', (code, reason) => {
    console.log(`🔌 Connection closed: ${code} - ${reason}`)
    process.exit(0)
  })

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error)
    process.exit(1)
  })
}

// 运行测试客户端
testGatewayClient().catch((err) => {
  console.error('Failed to start test client:', err)
  process.exit(1)
})
