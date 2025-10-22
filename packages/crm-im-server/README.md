# CRM IM WebSocket Server

基于 Socket.IO 的实时通讯服务器,支持 PC 端和移动端客户端。

## 功能特性

### ✅ 已实现的功能

- **用户管理**
  - 用户登录/登出
  - 在线用户列表
  - 用户状态管理 (在线/离线)

- **实时消息**
  - 点对点消息发送
  - 消息送达回执
  - 离线消息提示
  - 多设备消息同步

- **扩展功能**
  - 文件传输支持
  - 正在输入提示
  - 用户状态变更广播
  - 服务器状态监控

## 快速开始

### 1. 安装依赖

```bash
cd crm-im-server
npm install
```

### 2. 启动服务器

```bash
npm start
```

服务器将在 `http://localhost:8080` 启动。

### 3. 检查服务状态

打开浏览器访问: `http://localhost:8080`

你会看到服务器状态信息:
```json
{
  "status": "running",
  "message": "CRM IM WebSocket Server",
  "version": "1.0.0",
  "onlineUsers": 0,
  "timestamp": "2025-10-19T..."
}
```

## 客户端配置

### PC 端配置

在 PC 端登录页面设置中输入:
```
ws://localhost:8080
```

### 移动端配置

1. 获取你的本机 IP 地址:
   ```bash
   # Windows
   ipconfig

   # Linux/Mac
   ifconfig
   ```

2. 在移动端登录页面设置中输入:
   ```
   ws://YOUR_IP:8080
   ```
   例如: `ws://192.168.1.100:8080`

**注意**: 确保移动设备和服务器在同一局域网内。

## WebSocket 事件

### 客户端 → 服务器

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `user:login` | `{ id, name, avatar }` | 用户登录 |
| `message` | `Message` 对象 | 发送消息 |
| `status_change` | `{ status }` | 更改状态 |
| `file_transfer` | `FileData` 对象 | 发送文件 |
| `typing` | `{ toId, fromId, fromName, isTyping }` | 正在输入 |
| `get_history` | `{ friendId, topic }` | 获取历史消息 |

### 服务器 → 客户端

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `user:login:success` | `User` 对象 | 登录成功 |
| `online_users` | `User[]` | 在线用户列表 |
| `message` | `Message` 对象 | 接收消息 |
| `message:sent` | `{ messageId, status, timestamp }` | 消息送达回执 |
| `status_change` | `{ userId, status, timestamp }` | 用户状态变更 |
| `file_transfer` | `FileData` 对象 | 接收文件 |
| `typing` | `{ fromId, fromName, isTyping }` | 对方正在输入 |
| `error` | `{ message }` | 错误信息 |
| `server:shutdown` | `{ message }` | 服务器关闭通知 |

## 数据结构

### Message (消息)

```javascript
{
  id: string,              // 消息 ID
  fromId: string,          // 发送者 ID
  fromName: string,        // 发送者名称
  toId: string,            // 接收者 ID
  topic: string,           // 会话主题
  content: string,         // 消息内容
  type: 'text' | 'file',   // 消息类型
  timestamp: number,       // 客户端时间戳
  serverTimestamp: number, // 服务器时间戳 (由服务器添加)
  fileUrl?: string,        // 文件 URL (可选)
  fileName?: string        // 文件名 (可选)
}
```

### User (用户)

```javascript
{
  id: string,                      // 用户 ID
  name: string,                    // 用户名
  avatar: string,                  // 头像 URL
  status: 'online' | 'offline'     // 在线状态
}
```

## API 接口

### GET /

获取服务器状态

**响应:**
```json
{
  "status": "running",
  "message": "CRM IM WebSocket Server",
  "version": "1.0.0",
  "onlineUsers": 3,
  "timestamp": "2025-10-19T12:00:00.000Z"
}
```

### GET /api/online-users

获取在线用户列表

**响应:**
```json
{
  "users": [
    {
      "id": "user_001",
      "name": "张三",
      "avatar": "...",
      "status": "online"
    }
  ]
}
```

## 连接示例

### JavaScript/Node.js

```javascript
import { io } from 'socket.io-client'

const socket = io('ws://localhost:8080')

// 登录
socket.emit('user:login', {
  id: 'user_001',
  name: '张三',
  avatar: 'https://...'
})

// 监听登录成功
socket.on('user:login:success', (user) => {
  console.log('登录成功:', user)
})

// 发送消息
socket.emit('message', {
  id: 'msg_001',
  fromId: 'user_001',
  fromName: '张三',
  toId: 'friend_001',
  topic: '项目讨论',
  content: '你好',
  type: 'text',
  timestamp: Date.now()
})

// 接收消息
socket.on('message', (message) => {
  console.log('收到消息:', message)
})

// 接收状态变更
socket.on('status_change', (data) => {
  console.log('用户状态变更:', data)
})
```

## 调试

### 查看服务器日志

服务器会在控制台输出详细的日志:

```
[连接] 新客户端连接: abc123
[登录] 用户 张三(user_001) 已登录
[消息] 从 张三 到 friend_001: 你好
[消息] 已转发给 friend_001
[断开] 用户 张三(user_001) 已离线
```

### 测试连接

使用在线工具测试 WebSocket 连接:
- [websocket.org Echo Test](https://www.websocket.org/echo.html)
- [Postman](https://www.postman.com/) (支持 WebSocket)

## 配置

### 修改端口

编辑 `server.js`:

```javascript
const PORT = process.env.PORT || 8080  // 修改为其他端口
```

或使用环境变量:

```bash
PORT=3000 npm start
```

### CORS 配置

默认允许所有来源,生产环境建议修改:

```javascript
const io = new Server(httpServer, {
  cors: {
    origin: 'http://your-client-domain.com',  // 指定允许的域名
    methods: ['GET', 'POST']
  }
})
```

## 生产部署建议

### 1. 使用进程管理器

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start server.js --name crm-im-server

# 查看状态
pm2 status

# 查看日志
pm2 logs crm-im-server
```

### 2. 添加消息持久化

当前消息仅在内存中,建议集成数据库:
- MongoDB (文档存储)
- Redis (缓存 + 发布/订阅)
- PostgreSQL/MySQL (关系型数据库)

### 3. 负载均衡

使用 Socket.IO Redis Adapter 支持多服务器:

```bash
npm install @socket.io/redis-adapter redis
```

### 4. HTTPS/WSS

生产环境使用加密连接:

```javascript
const https = require('https')
const fs = require('fs')

const httpsServer = https.createServer({
  key: fs.readFileSync('/path/to/key.pem'),
  cert: fs.readFileSync('/path/to/cert.pem')
}, app)

const io = new Server(httpsServer)
```

## 故障排查

### 问题 1: 连接失败

**原因**: 防火墙阻止端口

**解决**:
```bash
# Windows
netsh advfirewall firewall add rule name="CRM IM Server" dir=in action=allow protocol=TCP localport=8080

# Linux
sudo ufw allow 8080
```

### 问题 2: 移动端无法连接

**原因**: 使用了 localhost

**解决**: 使用实际 IP 地址,如 `ws://192.168.1.100:8080`

### 问题 3: 消息发送失败

**检查**:
1. 接收者是否在线
2. 消息格式是否正确
3. 查看服务器日志

## 下一步开发

- [ ] 添加用户认证 (JWT)
- [ ] 消息持久化到数据库
- [ ] 群组聊天功能
- [ ] 文件上传存储
- [ ] 消息已读/未读状态
- [ ] 离线消息推送
- [ ] 消息加密
- [ ] 聊天室功能
- [ ] 管理后台

## 技术栈

- Node.js
- Express.js
- Socket.IO 4.x
- CORS

## 许可

MIT License

## 支持

如有问题,请提交 Issue 或 Pull Request。
