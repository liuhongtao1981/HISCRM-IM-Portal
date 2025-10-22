/**
 * Master → crm-pc-im 集成测试脚本
 *
 * 模拟 Master 推送消息到 crm-pc-im 客户端
 * 验证完整的通信流程
 */

const http = require('http')
const { Server } = require('socket.io')
const ioClient = require('socket.io-client')

// 协议转换函数（与 protocol-converter.ts 相同逻辑）
function convertMasterToCrm(masterMessage) {
  const payload = masterMessage.payload || masterMessage
  return {
    id: payload.id || `master_${Date.now()}_${Math.random()}`,
    fromId: payload.sender_id || 'unknown',
    fromName: payload.sender_name || 'Unknown User',
    toId: '',
    topic: payload.account_id || 'default',
    content: payload.content || '',
    type: convertMessageType(payload.type || 'TEXT', true),
    timestamp: (payload.created_at || Math.floor(Date.now() / 1000)) * 1000,
    fileUrl: payload.file_url,
    fileName: payload.file_name,
  }
}

function convertMessageType(masterType, isMasterToCrm = true) {
  if (isMasterToCrm) {
    switch ((masterType || 'TEXT').toUpperCase()) {
      case 'TEXT':
      case 'SYSTEM':
      case 'NOTIFICATION':
      case 'COMMENT':
      case 'DIRECT_MESSAGE':
        return 'text'
      case 'FILE':
      case 'IMAGE':
        return 'file'
      default:
        return 'text'
    }
  } else {
    switch ((masterType || 'text').toLowerCase()) {
      case 'text':
        return 'TEXT'
      case 'file':
        return 'FILE'
      default:
        return 'TEXT'
    }
  }
}

// 模拟 Master 服务器
class MockMaster {
  constructor(port = 3001) {
    this.port = port
    this.server = null
    this.io = null
    this.clients = new Map()
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = http.createServer()
        this.io = new Server(this.server, {
          cors: { origin: '*' },
        })

        // 处理客户端连接
        this.io.on('connection', (socket) => {
          console.log(`[Master] 客户端连接: ${socket.id}`)

          // 处理客户端注册
          socket.on('client:register', (data) => {
            console.log(`[Master] 客户端注册: ${data.device_id}`)
            this.clients.set(socket.id, data)

            socket.emit('client:register:success', {
              session_id: `session_${Date.now()}`,
              device_id: data.device_id,
              connected_at: new Date().toISOString(),
            })
          })

          // 处理心跳
          socket.on('client:heartbeat', (data) => {
            console.log(`[Master] 收到心跳来自: ${data.client_id}`)
          })

          // 处理消息确认
          socket.on('client:notification:ack', (data) => {
            console.log(`[Master] 消息已确认: ${data.notification_id}`)
          })

          // 处理客户端断开
          socket.on('disconnect', () => {
            console.log(`[Master] 客户端断开: ${socket.id}`)
            this.clients.delete(socket.id)
          })
        })

        this.server.listen(this.port, () => {
          console.log(`[Master] 服务器启动在 http://localhost:${this.port}`)
          resolve()
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  // 向所有连接的客户端推送消息
  pushMessageToClients(masterMessage) {
    console.log(`[Master] 向客户端推送消息: ${masterMessage.content}`)
    this.io.emit('message', masterMessage)
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[Master] 服务器已停止')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}

// 模拟 crm-pc-im 客户端
class MockCrmClient {
  constructor(url = 'http://localhost:3001') {
    this.url = url
    this.socket = null
    this.receivedMessages = []
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.socket = ioClient(this.url, {
          reconnection: true,
          reconnectionAttempts: 5,
        })

        this.socket.on('connect', () => {
          console.log(`[Client] 已连接到 Master`)
          resolve()
        })

        this.socket.on('error', (error) => {
          console.error(`[Client] 连接错误: ${error}`)
          reject(error)
        })

        this.socket.on('message', (masterMessage) => {
          console.log(`[Client] 收到 Master 消息: ${masterMessage.content}`)

          // 转换为 crm 格式
          const crmMessage = convertMasterToCrm(masterMessage)
          this.receivedMessages.push(crmMessage)

          console.log(`[Client] 已转换为 crm 格式: ${JSON.stringify(crmMessage, null, 2)}`)

          // 发送确认
          this.socket.emit('client:notification:ack', {
            notification_id: masterMessage.id,
            client_id: 'test-client',
            timestamp: Date.now(),
          })
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  register() {
    return new Promise((resolve, reject) => {
      const successHandler = (data) => {
        console.log(`[Client] 注册成功: ${data.device_id}`)
        this.socket.off('client:register:error', errorHandler)
        resolve(data)
      }

      const errorHandler = (error) => {
        console.error(`[Client] 注册失败: ${error}`)
        reject(error)
      }

      this.socket.once('client:register:success', successHandler)
      this.socket.once('client:register:error', errorHandler)

      this.socket.emit('client:register', {
        client_id: 'test-client',
        device_id: 'test-device-id',
        device_type: 'desktop',
        app_version: '0.0.1',
      })

      // 30 秒超时
      setTimeout(() => {
        this.socket.off('client:register:success', successHandler)
        this.socket.off('client:register:error', errorHandler)
        reject(new Error('注册超时'))
      }, 30000)
    })
  }

  startHeartbeat() {
    console.log('[Client] 启动心跳')
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('client:heartbeat', {
          client_id: 'test-client',
          timestamp: Date.now(),
        })
      }
    }, 5000) // 每 5 秒（测试用）
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      console.log('[Client] 停止心跳')
    }
  }

  disconnect() {
    this.stopHeartbeat()
    if (this.socket) {
      this.socket.disconnect()
      console.log('[Client] 已断开连接')
    }
  }

  getReceivedMessages() {
    return this.receivedMessages
  }
}

// 运行集成测试
async function runIntegrationTest() {
  console.log('🧪 Master ↔ crm-pc-im 集成测试\n')
  console.log('='.repeat(60))

  let master = null
  let client = null

  try {
    // 1. 启动 Master
    console.log('\n📍 Step 1: 启动 Master 服务器')
    master = new MockMaster(3001)
    await master.start()

    // 2. 连接客户端
    console.log('\n📍 Step 2: 连接客户端到 Master')
    client = new MockCrmClient('http://localhost:3001')
    await client.connect()

    // 3. 注册客户端
    console.log('\n📍 Step 3: 向 Master 注册客户端')
    await client.register()

    // 4. 启动心跳
    console.log('\n📍 Step 4: 启动客户端心跳')
    client.startHeartbeat()

    // 5. 等待一下确保都已连接
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // 6. Master 推送测试消息
    console.log('\n📍 Step 5: Master 推送测试消息到客户端')
    const testMessages = [
      {
        id: 'msg-test-1',
        account_id: 'account-test',
        sender_id: 'user-test-1',
        sender_name: 'Test User 1',
        type: 'TEXT',
        content: 'Hello from Master!',
        created_at: Math.floor(Date.now() / 1000),
        is_new: 1,
        is_sent: 0,
      },
      {
        id: 'msg-test-2',
        account_id: 'account-test',
        sender_id: 'user-test-2',
        sender_name: 'Test User 2',
        type: 'FILE',
        content: 'test-file.pdf',
        created_at: Math.floor(Date.now() / 1000),
        is_new: 1,
        is_sent: 0,
        file_url: 'http://example.com/test.pdf',
        file_name: 'test-file.pdf',
      },
    ]

    for (const msg of testMessages) {
      master.pushMessageToClients(msg)
      // 等待一下让消息传递
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // 7. 等待客户端处理
    console.log('\n📍 Step 6: 等待客户端处理消息')
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // 8. 验证结果
    console.log('\n📍 Step 7: 验证测试结果')
    const receivedMessages = client.getReceivedMessages()
    console.log(`\n已收到 ${receivedMessages.length} 条消息:\n`)

    let allValid = true
    receivedMessages.forEach((msg, index) => {
      console.log(`消息 ${index + 1}:`)
      console.log(`  ID: ${msg.id}`)
      console.log(`  fromId: ${msg.fromId}`)
      console.log(`  fromName: ${msg.fromName}`)
      console.log(`  topic: ${msg.topic}`)
      console.log(`  content: ${msg.content}`)
      console.log(`  type: ${msg.type}`)
      console.log(`  timestamp: ${msg.timestamp}`)
      if (msg.fileUrl) {
        console.log(`  fileUrl: ${msg.fileUrl}`)
      }
      console.log('')
    })

    // 9. 验证消息完整性
    if (receivedMessages.length === 2) {
      const msg1 = receivedMessages[0]
      const msg2 = receivedMessages[1]

      if (msg1.type === 'text' && msg1.content === 'Hello from Master!') {
        console.log('✅ 消息 1 验证通过 (TEXT 类型)')
      } else {
        console.log('❌ 消息 1 验证失败')
        allValid = false
      }

      if (msg2.type === 'file' && msg2.fileUrl === 'http://example.com/test.pdf') {
        console.log('✅ 消息 2 验证通过 (FILE 类型)')
      } else {
        console.log('❌ 消息 2 验证失败')
        allValid = false
      }

      if (allValid) {
        console.log('\n✅ 集成测试通过！Master 和 crm-pc-im 通信正常')
      } else {
        console.log('\n❌ 集成测试失败！部分消息验证不通过')
      }
    } else {
      console.log(`❌ 预期收到 2 条消息，实际收到 ${receivedMessages.length} 条`)
      allValid = false
    }

    // 清理
    console.log('\n📍 Step 8: 清理资源')
    client.disconnect()
    await master.stop()

    console.log('\n' + '='.repeat(60))
    console.log(allValid ? '\n🎉 测试完成！' : '\n⚠️ 测试存在问题')

    return allValid ? 0 : 1
  } catch (error) {
    console.error(`\n❌ 测试错误: ${error.message}`)
    console.error(error.stack)

    // 清理
    if (client) client.disconnect()
    if (master) await master.stop()

    return 1
  }
}

// 运行测试
runIntegrationTest().then((exitCode) => {
  process.exit(exitCode)
})
