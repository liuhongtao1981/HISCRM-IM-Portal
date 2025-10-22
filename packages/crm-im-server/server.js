/**
 * CRM IM WebSocket 服务器
 * 支持 PC 端和移动端的实时通讯
 */

const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(cors())
app.use(express.json())

// 提供静态文件服务 (管理界面)
app.use('/admin', express.static(path.join(__dirname, 'public')))
app.use(express.static(path.join(__dirname, 'public')))

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

// 读取频道配置
let channelsConfig = { channels: [] }
const channelsConfigPath = path.join(__dirname, 'config', 'channels.json')

try {
  const configData = fs.readFileSync(channelsConfigPath, 'utf8')
  channelsConfig = JSON.parse(configData)
  console.log(`[配置] 已加载 ${channelsConfig.channels.length} 个频道配置`)
} catch (error) {
  console.warn('[配置] 未找到频道配置文件，使用默认配置')
}

// 读取主题配置
let topicsConfig = { topics: [] }
const topicsConfigPath = path.join(__dirname, 'config', 'topics.json')
try {
  const topicsData = fs.readFileSync(topicsConfigPath, 'utf8')
  topicsConfig = JSON.parse(topicsData)
  console.log(`[配置] 已加载 ${topicsConfig.topics.length} 个主题配置`)
} catch (error) {
  console.warn('[配置] 未找到主题配置文件,使用默认配置')
}

// 读取消息存储
let messagesStore = { messages: [] }
const messagesStorePath = path.join(__dirname, 'config', 'messages.json')
try {
  const messagesData = fs.readFileSync(messagesStorePath, 'utf8')
  messagesStore = JSON.parse(messagesData)
  console.log(`[配置] 已加载 ${messagesStore.messages.length} 条历史消息`)
} catch (error) {
  console.warn('[配置] 未找到消息存储文件,使用默认配置')
}

// 读取会话存储
let sessionsStore = { sessions: [] }
const sessionsStorePath = path.join(__dirname, 'config', 'sessions.json')
try {
  const sessionsData = fs.readFileSync(sessionsStorePath, 'utf8')
  sessionsStore = JSON.parse(sessionsData)
  console.log(`[配置] 已加载 ${sessionsStore.sessions.length} 个会话`)
} catch (error) {
  console.warn('[配置] 未找到会话存储文件,使用默认配置')
}

// 读取回复存储
let repliesStore = { replies: [] }
const repliesStorePath = path.join(__dirname, 'config', 'replies.json')
try {
  const repliesData = fs.readFileSync(repliesStorePath, 'utf8')
  repliesStore = JSON.parse(repliesData)
  console.log(`[配置] 已加载 ${repliesStore.replies.length} 条回复`)
} catch (error) {
  console.warn('[配置] 未找到回复存储文件,使用默认配置')
}

// 启动时同步频道的lastMessageTime
function syncChannelLastMessageTime() {
  console.log('[初始化] 开始同步频道的最后消息时间...')

  // 为每个频道计算最后消息时间
  channelsConfig.channels.forEach(channel => {
    // 找到该频道的所有消息
    const channelMessages = messagesStore.messages.filter(msg => msg.channelId === channel.id)

    if (channelMessages.length > 0) {
      // 找到最新的消息
      const latestMessage = channelMessages.reduce((latest, current) => {
        return (current.timestamp > latest.timestamp) ? current : latest
      })

      // 更新频道的最后消息时间和内容
      channel.lastMessageTime = latestMessage.timestamp
      channel.lastMessage = latestMessage.content
      channel.messageCount = channelMessages.length

      console.log(`[初始化] 频道 ${channel.name} (${channel.id}): 最后消息时间=${new Date(latestMessage.timestamp).toLocaleString()}, 消息数=${channelMessages.length}`)
    }
  })

  console.log('[初始化] 频道同步完成')
}

// 启动时执行同步
syncChannelLastMessageTime()

// 在线用户管理
const onlineUsers = new Map() // userId -> { socketId, userInfo }
const userSockets = new Map() // socketId -> userId
const monitorClients = new Map() // clientId -> socketId (使用持久化的客户端ID，不包括管理页面)
const adminClients = new Map() // clientId -> socketId (管理页面连接)
const socketToClientId = new Map() // socketId -> clientId (反向映射)

// Mock 用户数据库
const users = {
  'user_001': { id: 'user_001', name: '张三', password: 'demo', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John' },
  'friend_001': { id: 'friend_001', name: '李四', password: 'demo', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice' },
  'friend_002': { id: 'friend_002', name: '王五', password: 'demo', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob' },
  'friend_003': { id: 'friend_003', name: '赵六', password: 'demo', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carol' },
  'friend_004': { id: 'friend_004', name: '钱七', password: 'demo', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David' }
}

// HTTP 路由 - 健康检查
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: 'CRM IM WebSocket Server',
    version: '1.0.0',
    onlineUsers: onlineUsers.size,
    timestamp: new Date().toISOString()
  })
})

// HTTP 路由 - 获取在线用户列表
app.get('/api/online-users', (req, res) => {
  const users = Array.from(onlineUsers.values()).map(({ userInfo }) => ({
    id: userInfo.id,
    name: userInfo.name,
    avatar: userInfo.avatar,
    status: 'online'
  }))
  res.json({ users })
})

// HTTP 路由 - 获取所有频道列表 (包括禁用的)
app.get('/api/channels', (req, res) => {
  const showAll = req.query.all === 'true'
  const channels = showAll ? channelsConfig.channels : channelsConfig.channels.filter(ch => ch.enabled)
  res.json({ channels })
})

// HTTP 路由 - 获取单个频道
app.get('/api/channels/:id', (req, res) => {
  const channel = channelsConfig.channels.find(ch => ch.id === req.params.id)
  if (!channel) {
    return res.status(404).json({ error: '频道不存在' })
  }
  res.json({ channel })
})

// HTTP 路由 - 创建新频道
app.post('/api/channels', (req, res) => {
  const { id, name, avatar, description, isPinned, enabled } = req.body

  if (!id || !name) {
    return res.status(400).json({ error: 'ID 和名称为必填项' })
  }

  // 检查 ID 是否已存在
  if (channelsConfig.channels.find(ch => ch.id === id)) {
    return res.status(400).json({ error: '频道 ID 已存在' })
  }

  const newChannel = {
    id,
    name,
    avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`,
    description: description || '',
    isPinned: isPinned || false,
    enabled: enabled !== false
  }

  channelsConfig.channels.push(newChannel)

  // 保存到文件
  saveChannelsConfig()

  // 通知所有监控客户端更新
  broadcastChannelsUpdate()

  console.log(`[频道管理] 创建新频道: ${name} (${id})`)
  res.json({ success: true, channel: newChannel })
})

// HTTP 路由 - 更新频道
app.put('/api/channels/:id', (req, res) => {
  const channelIndex = channelsConfig.channels.findIndex(ch => ch.id === req.params.id)

  if (channelIndex === -1) {
    return res.status(404).json({ error: '频道不存在' })
  }

  const { name, avatar, description, isPinned, enabled } = req.body

  // 更新频道信息
  if (name !== undefined) channelsConfig.channels[channelIndex].name = name
  if (avatar !== undefined) channelsConfig.channels[channelIndex].avatar = avatar
  if (description !== undefined) channelsConfig.channels[channelIndex].description = description
  if (isPinned !== undefined) channelsConfig.channels[channelIndex].isPinned = isPinned
  if (enabled !== undefined) channelsConfig.channels[channelIndex].enabled = enabled

  // 保存到文件
  saveChannelsConfig()

  // 通知所有监控客户端更新
  broadcastChannelsUpdate()

  console.log(`[频道管理] 更新频道: ${channelsConfig.channels[channelIndex].name} (${req.params.id})`)
  res.json({ success: true, channel: channelsConfig.channels[channelIndex] })
})

// HTTP 路由 - 删除频道
app.delete('/api/channels/:id', (req, res) => {
  const channelIndex = channelsConfig.channels.findIndex(ch => ch.id === req.params.id)

  if (channelIndex === -1) {
    return res.status(404).json({ error: '频道不存在' })
  }

  const deletedChannel = channelsConfig.channels.splice(channelIndex, 1)[0]

  // 保存到文件
  saveChannelsConfig()

  // 通知所有监控客户端更新
  broadcastChannelsUpdate()

  console.log(`[频道管理] 删除频道: ${deletedChannel.name} (${deletedChannel.id})`)
  res.json({ success: true, channel: deletedChannel })
})

// 保存频道配置到文件
function saveChannelsConfig() {
  try {
    fs.writeFileSync(channelsConfigPath, JSON.stringify(channelsConfig, null, 2), 'utf8')
    console.log('[频道管理] 配置已保存到文件')
  } catch (error) {
    console.error('[频道管理] 保存配置失败:', error)
  }
}

// 广播消息给所有监控客户端和管理页面
function broadcastToMonitors(event, data) {
  // 发送给监控客户端
  monitorClients.forEach((socketId, clientId) => {
    io.to(socketId).emit(event, data)
  })
  // 发送给管理页面
  adminClients.forEach((socketId, clientId) => {
    io.to(socketId).emit(event, data)
  })
}

// 广播频道更新给所有监控客户端和管理页面
function broadcastChannelsUpdate() {
  const enabledChannels = channelsConfig.channels.filter(ch => ch.enabled)
  broadcastToMonitors('monitor:channels', { channels: enabledChannels })
  console.log(`[频道管理] 已通知 ${monitorClients.size} 个监控客户端和 ${adminClients.size} 个管理页面更新频道列表`)
}

// 保存主题配置到文件
function saveTopicsConfig() {
  try {
    fs.writeFileSync(topicsConfigPath, JSON.stringify(topicsConfig, null, 2), 'utf8')
    console.log('[配置] 主题配置已保存')
  } catch (error) {
    console.error('[配置] 保存主题配置失败:', error)
  }
}

// 保存消息存储到文件
function saveMessagesStore() {
  try {
    fs.writeFileSync(messagesStorePath, JSON.stringify(messagesStore, null, 2), 'utf8')
    console.log('[存储] 消息已保存')
  } catch (error) {
    console.error('[存储] 保存消息失败:', error)
  }
}


// ============ 主题管理 API ============

// 获取某个频道的主题列表
app.get('/api/channels/:channelId/topics', (req, res) => {
  const topics = topicsConfig.topics.filter(t => t.channelId === req.params.channelId)
  res.json({ topics })
})

// 创建新主题
app.post('/api/topics', (req, res) => {
  const { id, channelId, title, description, isPinned } = req.body
  if (!id || !channelId || !title) {
    return res.status(400).json({ error: 'ID、频道ID和标题为必填项' })
  }
  if (topicsConfig.topics.find(t => t.id === id)) {
    return res.status(400).json({ error: '主题ID已存在' })
  }
  const newTopic = {
    id, channelId, title,
    description: description || '',
    createdTime: Date.now(),
    lastMessageTime: null,
    messageCount: 0,
    isPinned: isPinned || false
  }
  topicsConfig.topics.push(newTopic)
  saveTopicsConfig()
  res.json({ success: true, topic: newTopic })
})

// 更新主题
app.put('/api/topics/:id', (req, res) => {
  const index = topicsConfig.topics.findIndex(t => t.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: '主题不存在' })
  }
  const { title, description, isPinned } = req.body
  if (title) topicsConfig.topics[index].title = title
  if (description !== undefined) topicsConfig.topics[index].description = description
  if (isPinned !== undefined) topicsConfig.topics[index].isPinned = isPinned
  saveTopicsConfig()
  res.json({ success: true, topic: topicsConfig.topics[index] })
})

// 删除主题
app.delete('/api/topics/:id', (req, res) => {
  const index = topicsConfig.topics.findIndex(t => t.id === req.params.id)
  if (index === -1) {
    return res.status(404).json({ error: '主题不存在' })
  }
  topicsConfig.topics.splice(index, 1)
  saveTopicsConfig()
  res.json({ success: true })
})

// ============ 消息管理 API ============

// 获取某个主题的消息列表
app.get('/api/topics/:topicId/messages', (req, res) => {
  const messages = messagesStore.messages.filter(m => m.topicId === req.params.topicId)
  res.json({ messages })
})

// 获取服务器统计信息
app.get('/api/stats', (req, res) => {
  res.json({
    monitorClients: monitorClients.size,
    channels: channelsConfig.channels.length,
    topics: topicsConfig.topics.length,
    messages: messagesStore.messages.length
  })
})

// 获取消息列表(可按频道和主题筛选)
app.get('/api/messages', (req, res) => {
  const { channelId, topicId } = req.query

  let messages = messagesStore.messages

  // 按频道筛选
  if (channelId) {
    messages = messages.filter(msg => msg.channelId === channelId)
  }

  // 按主题筛选
  if (topicId) {
    messages = messages.filter(msg => msg.topicId === topicId)
  }

  res.json({ messages })
})

// HTTP 路由 - 向指定频道发送测试消息 (用于测试)
app.post('/api/send-test-message', (req, res) => {
  const { channelId, topicId, content, fromUserId, fromUserName, parentId } = req.body

  if (!channelId || !topicId || !content) {
    return res.status(400).json({ error: '缺少必要参数(channelId, topicId, content)' })
  }

  const message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    channelId,
    topicId,
    fromName: fromUserName || '测试发送',
    fromId: fromUserId || 'admin_test',
    content,
    type: 'text',
    timestamp: Date.now(),
    serverTimestamp: Date.now()
  }

  // 如果提供了 parentId，则添加到消息对象中（用于评论的2级讨论）
  if (parentId !== undefined && parentId !== null) {
    message.parentId = parentId
  }

  // 保存到消息存储
  messagesStore.messages.push(message)
  saveMessagesStore()

  // 更新主题信息
  const topic = topicsConfig.topics.find(t => t.id === topicId)
  if (topic) {
    topic.lastMessage = content
    topic.lastMessageTime = Date.now()
    topic.messageCount = messagesStore.messages.filter(m => m.topicId === topicId).length
    saveTopicsConfig()
  }

  // 更新频道信息
  const channel = channelsConfig.channels.find(ch => ch.id === channelId)
  if (channel) {
    channel.lastMessage = content
    channel.lastMessageTime = Date.now()
    channel.messageCount = messagesStore.messages.filter(m => m.channelId === channelId).length
    saveChannelsConfig()
  }

  // 发送给所有监控客户端和管理页面
  broadcastToMonitors('channel:message', message)

  console.log(`[测试消息] 发送到频道 ${channelId} / 主题 ${topicId}: ${content}`)
  res.json({ success: true, message })
})

// ==================== 会话管理 API ====================

// 获取所有会话
app.get('/api/sessions', (req, res) => {
  res.json({ sessions: sessionsStore.sessions })
})

// 获取会话的所有回复
app.get('/api/sessions/:sessionId/replies', (req, res) => {
  const { sessionId } = req.params
  const sessionReplies = repliesStore.replies.filter(r => r.sessionId === sessionId)
  // 按时间排序
  sessionReplies.sort((a, b) => a.timestamp - b.timestamp)
  res.json({ replies: sessionReplies })
})

// 创建新会话
app.post('/api/sessions', (req, res) => {
  const { userId, userName, channelId, topicId, firstMessage } = req.body

  if (!userId || !userName || !channelId || !topicId || !firstMessage) {
    return res.status(400).json({
      error: '缺少必要参数(userId, userName, channelId, topicId, firstMessage)'
    })
  }

  const session = {
    id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    userName,
    channelId,
    topicId,
    firstMessage,
    createdTime: Date.now(),
    lastReplyTime: null,
    replyCount: 0,
    status: 'active'
  }

  sessionsStore.sessions.push(session)
  saveSessionsStore()

  console.log(`[会话] 创建新会话: ${userName} (${userId})`)

  // 通知所有管理员客户端
  io.emit('session:new', session)

  res.json({ success: true, session })
})

// 会话回复
app.post('/api/sessions/reply', (req, res) => {
  const { sessionId, content, fromName, fromId } = req.body

  if (!sessionId || !content || !fromName) {
    return res.status(400).json({
      error: '缺少必要参数(sessionId, content, fromName)'
    })
  }

  const session = sessionsStore.sessions.find(s => s.id === sessionId)
  if (!session) {
    return res.status(404).json({ error: '会话不存在' })
  }

  const reply = {
    id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sessionId,
    fromName,
    fromId: fromId || `staff_${Date.now()}`,
    content,
    timestamp: Date.now(),
    type: 'text'
  }

  repliesStore.replies.push(reply)
  saveRepliesStore()

  // 更新会话信息
  session.lastReplyTime = Date.now()
  session.replyCount = repliesStore.replies.filter(r => r.sessionId === sessionId).length
  saveSessionsStore()

  console.log(`[会话回复] ${fromName} 回复会话 ${sessionId}: ${content}`)

  // 通知所有管理员客户端
  io.emit('session:reply', reply)

  // 发送给监控客户端
  const message = {
    id: reply.id,
    channelId: session.channelId,
    topicId: session.topicId,
    fromName: reply.fromName,
    fromId: reply.fromId,
    content: reply.content,
    type: 'text',
    timestamp: reply.timestamp,
    serverTimestamp: reply.timestamp,
    replyToId: sessionId,
    replyToContent: session.firstMessage
  }

  broadcastToMonitors('channel:message', message)

  res.json({ success: true, reply })
})

// 保存会话到文件
function saveSessionsStore() {
  try {
    fs.writeFileSync(sessionsStorePath, JSON.stringify(sessionsStore, null, 2), 'utf8')
  } catch (error) {
    console.error('[保存会话失败]', error)
  }
}

// 保存回复到文件
function saveRepliesStore() {
  try {
    fs.writeFileSync(repliesStorePath, JSON.stringify(repliesStore, null, 2), 'utf8')
  } catch (error) {
    console.error('[保存回复失败]', error)
  }
}

// WebSocket 连接处理
io.on('connection', (socket) => {
  console.log(`[连接] 新客户端连接: ${socket.id}`)

  // 监控客户端注册
  socket.on('monitor:register', (data) => {
    try {
      const clientId = data.clientId || socket.id // 使用客户端提供的ID,如果没有则用socket ID
      const clientType = data.clientType || 'monitor' // 客户端类型: 'admin' 或 'monitor'

      // 根据客户端类型保存到不同的Map
      if (clientType === 'admin') {
        // 管理页面连接，不计入监控客户端数量
        adminClients.set(clientId, socket.id)
        console.log(`[管理页面] 管理页面已连接: ${clientId} (socket: ${socket.id})`)
        console.log(`[管理页面] 当前在线管理页面数: ${adminClients.size}`)
      } else {
        // 监控客户端连接
        monitorClients.set(clientId, socket.id)
        console.log(`[监控] 监控客户端已注册: ${clientId} (socket: ${socket.id})`)
        console.log(`[监控] 当前在线监控客户端数: ${monitorClients.size}`)
      }

      socketToClientId.set(socket.id, clientId)

      // 发送频道列表
      const enabledChannels = channelsConfig.channels.filter(ch => ch.enabled)
      socket.emit('monitor:channels', { channels: enabledChannels })

      socket.emit('monitor:registered', {
        success: true,
        channelCount: enabledChannels.length,
        clientId: clientId,
        clientType: clientType
      })
    } catch (error) {
      console.error('[监控注册错误]', error)
      socket.emit('error', { message: '监控注册失败' })
    }
  })

  // 监控客户端请求频道列表
  socket.on('monitor:request_channels', () => {
    const enabledChannels = channelsConfig.channels.filter(ch => ch.enabled)
    socket.emit('monitor:channels', { channels: enabledChannels })
  })

  // 监控客户端请求主题列表
  socket.on('monitor:request_topics', (data) => {
    const { channelId } = data
    console.log(`[监控] 请求频道 ${channelId} 的主题列表`)

    const topics = topicsConfig.topics.filter(t => t.channelId === channelId)
    socket.emit('monitor:topics', { channelId, topics })
  })

  // 监控客户端请求消息列表
  socket.on('monitor:request_messages', (data) => {
    const { topicId } = data
    console.log(`[监控] 请求主题 ${topicId} 的消息列表`)

    const messages = messagesStore.messages.filter(m => m.topicId === topicId)
    socket.emit('monitor:messages', { topicId, messages })
  })

  // 监控客户端发送回复
  socket.on('monitor:reply', (data) => {
    const { channelId, topicId, content, replyToId, replyToContent } = data
    console.log(`[监控] 收到回复消息:`, data)

    // 创建回复消息
    const replyMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      topicId: topicId,
      channelId: channelId,
      fromName: '客服',
      fromId: 'monitor_client',
      content: content,
      type: 'text',
      timestamp: Date.now(),
      serverTimestamp: Date.now(),
      replyToId: replyToId,
      replyToContent: replyToContent
    }

    // 保存到消息存储
    messagesStore.messages.push(replyMessage)
    saveMessagesStore()

    // 更新主题信息
    const topic = topicsConfig.topics.find(t => t.id === topicId)
    if (topic) {
      topic.lastMessageTime = Date.now()
      topic.messageCount = messagesStore.messages.filter(m => m.topicId === topicId).length
      saveTopicsConfig()
    }

    // 广播给所有监控客户端和管理页面
    broadcastToMonitors('channel:message', {
      ...replyMessage,
      channelId: channelId,
      topicId: topicId
    })

    // 确认回复成功
    socket.emit('reply:success', { messageId: replyMessage.id })
  })

  // 用户登录/注册
  socket.on('user:login', (userInfo) => {
    try {
      const { id, name, avatar } = userInfo

      if (!id || !name) {
        socket.emit('error', { message: '用户信息不完整' })
        return
      }

      // 保存用户信息
      onlineUsers.set(id, {
        socketId: socket.id,
        userInfo: { id, name, avatar, status: 'online' }
      })
      userSockets.set(socket.id, id)

      console.log(`[登录] 用户 ${name}(${id}) 已登录`)

      // 通知客户端登录成功
      socket.emit('user:login:success', {
        id,
        name,
        avatar,
        status: 'online'
      })

      // 广播用户上线状态
      socket.broadcast.emit('status_change', {
        userId: id,
        userName: name,
        status: 'online',
        timestamp: Date.now()
      })

      // 发送在线用户列表
      const onlineUsersList = Array.from(onlineUsers.values()).map(({ userInfo }) => userInfo)
      socket.emit('online_users', onlineUsersList)

    } catch (error) {
      console.error('[登录错误]', error)
      socket.emit('error', { message: '登录失败' })
    }
  })

  // 接收消息
  socket.on('message', (message) => {
    try {
      console.log(`[消息] 从 ${message.fromName} 到 ${message.toId}:`, message.content.substring(0, 50))

      // 添加服务器时间戳
      const enrichedMessage = {
        ...message,
        serverTimestamp: Date.now()
      }

      // 查找接收者的 socket
      const recipient = onlineUsers.get(message.toId)

      if (recipient) {
        // 发送给指定接收者
        io.to(recipient.socketId).emit('message', enrichedMessage)
        console.log(`[消息] 已转发给 ${message.toId}`)

        // 发送回执给发送者
        socket.emit('message:sent', {
          messageId: message.id,
          status: 'delivered',
          timestamp: Date.now()
        })
      } else {
        console.log(`[消息] 接收者 ${message.toId} 不在线`)

        // 通知发送者接收者离线
        socket.emit('message:sent', {
          messageId: message.id,
          status: 'offline',
          timestamp: Date.now()
        })
      }

      // 发送给发送者自己(多设备同步)
      const senderId = userSockets.get(socket.id)
      if (senderId && senderId === message.fromId) {
        socket.emit('message', enrichedMessage)
      }

      // 转发给所有监控客户端
      const monitorMessage = {
        id: enrichedMessage.id,
        channelId: message.toId,  // 接收者ID作为频道ID
        topicId: message.topicId || 'default', // 添加主题ID
        content: enrichedMessage.content,
        fromName: enrichedMessage.fromName,
        fromId: enrichedMessage.fromId,
        type: enrichedMessage.type,
        timestamp: enrichedMessage.timestamp,
        serverTimestamp: enrichedMessage.serverTimestamp,
        fileUrl: enrichedMessage.fileUrl,
        fileName: enrichedMessage.fileName
      }

      // 保存消息到存储
      messagesStore.messages.push({
        ...monitorMessage,
        topicId: monitorMessage.topicId
      })
      saveMessagesStore()

      // 更新主题信息
      const topic = topicsConfig.topics.find(t => t.id === monitorMessage.topicId && t.channelId === message.toId)
      if (topic) {
        topic.lastMessageTime = Date.now()
        topic.messageCount = messagesStore.messages.filter(m => m.topicId === topic.id).length
        saveTopicsConfig()
      }

      broadcastToMonitors('channel:message', monitorMessage)

      console.log(`[监控] 消息已推送给 ${monitorClients.size} 个监控客户端和 ${adminClients.size} 个管理页面`)

    } catch (error) {
      console.error('[消息错误]', error)
      socket.emit('error', { message: '消息发送失败' })
    }
  })

  // 状态变更
  socket.on('status_change', (data) => {
    const userId = userSockets.get(socket.id)
    if (userId) {
      const userSession = onlineUsers.get(userId)
      if (userSession) {
        userSession.userInfo.status = data.status

        // 广播状态变更
        socket.broadcast.emit('status_change', {
          userId,
          status: data.status,
          timestamp: Date.now()
        })

        console.log(`[状态] 用户 ${userId} 状态变更为: ${data.status}`)
      }
    }
  })

  // 文件传输
  socket.on('file_transfer', (fileData) => {
    try {
      console.log(`[文件] 从 ${fileData.fromId} 到 ${fileData.toId}: ${fileData.fileName}`)

      const recipient = onlineUsers.get(fileData.toId)
      if (recipient) {
        io.to(recipient.socketId).emit('file_transfer', fileData)
        socket.emit('file:sent', { fileId: fileData.id, status: 'delivered' })
      } else {
        socket.emit('file:sent', { fileId: fileData.id, status: 'offline' })
      }
    } catch (error) {
      console.error('[文件错误]', error)
      socket.emit('error', { message: '文件传输失败' })
    }
  })

  // 正在输入
  socket.on('typing', (data) => {
    const recipient = onlineUsers.get(data.toId)
    if (recipient) {
      io.to(recipient.socketId).emit('typing', {
        fromId: data.fromId,
        fromName: data.fromName,
        isTyping: data.isTyping
      })
    }
  })

  // 获取历史消息 (简单实现)
  socket.on('get_history', (data) => {
    // TODO: 从数据库获取历史消息
    // 现在返回空数组
    socket.emit('history_messages', {
      friendId: data.friendId,
      topic: data.topic,
      messages: []
    })
  })

  // 断开连接
  socket.on('disconnect', () => {
    const userId = userSockets.get(socket.id)

    if (userId) {
      const userSession = onlineUsers.get(userId)
      const userName = userSession?.userInfo?.name || userId

      // 移除用户
      onlineUsers.delete(userId)
      userSockets.delete(socket.id)

      console.log(`[断开] 用户 ${userName}(${userId}) 已离线`)

      // 广播用户离线状态
      socket.broadcast.emit('status_change', {
        userId,
        userName,
        status: 'offline',
        timestamp: Date.now()
      })
    } else {
      // 检查是否是监控客户端或管理页面
      const clientId = socketToClientId.get(socket.id)
      if (clientId) {
        // 只移除socket映射,不移除clientId(允许重新连接)
        socketToClientId.delete(socket.id)

        // 检查是管理页面还是监控客户端
        if (adminClients.has(clientId)) {
          // 管理页面断开
          console.log(`[断开] 管理页面 ${clientId} 的socket ${socket.id} 已断开,但客户端ID保留`)
          console.log(`[管理页面] 当前在线管理页面数: ${adminClients.size}`)
        } else if (monitorClients.has(clientId)) {
          // 监控客户端断开
          console.log(`[断开] 监控客户端 ${clientId} 的socket ${socket.id} 已断开,但客户端ID保留`)
          console.log(`[监控] 当前在线监控客户端数: ${monitorClients.size}`)
        }
      } else {
        console.log(`[断开] 客户端 ${socket.id} 断开连接`)
      }
    }
  })

  // 错误处理
  socket.on('error', (error) => {
    console.error(`[错误] Socket ${socket.id}:`, error)
  })
})

// 启动服务器
const PORT = process.env.PORT || 8080
httpServer.listen(PORT, () => {
  console.log('╔═══════════════════════════════════════════════════╗')
  console.log('║                                                   ║')
  console.log('║   🚀 CRM IM WebSocket Server 已启动               ║')
  console.log('║                                                   ║')
  console.log(`║   📡 监听端口: ${PORT}                              ║`)
  console.log(`║   🌐 HTTP:  http://localhost:${PORT}                 ║`)
  console.log(`║   🔌 WebSocket: ws://localhost:${PORT}               ║`)
  console.log('║                                                   ║')
  console.log('║   ✅ 支持功能:                                     ║')
  console.log('║      - 用户登录/登出                              ║')
  console.log('║      - 实时消息收发                               ║')
  console.log('║      - 在线状态管理                               ║')
  console.log('║      - 文件传输                                   ║')
  console.log('║      - 正在输入提示                               ║')
  console.log('║                                                   ║')
  console.log('╚═══════════════════════════════════════════════════╝')
  console.log('')
  console.log('💡 提示:')
  console.log('   - PC 端配置: ws://localhost:8080')
  console.log('   - 移动端配置: ws://YOUR_IP:8080')
  console.log('   - 查看状态: http://localhost:8080')
  console.log('')
})

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n正在关闭服务器...')

  // 通知所有客户端服务器即将关闭
  io.emit('server:shutdown', { message: '服务器正在维护' })

  httpServer.close(() => {
    console.log('服务器已关闭')
    process.exit(0)
  })
})
