# crm-pc-im → Master 集成 - 快速参考

**快速导航** 📍

```
🔶 完整规范: docs/13-crm-pc-im-Master协议集成实现规范.md
🔶 决策依据: docs/最终决策-方案4最优.md
🔶 实现周期: 4-5 天（32 小时）
🔶 改动范围: ~250 行代码（只改通讯层）
🔶 UI 改动: 0 行 ✅
```

---

## ⚡ 五步快速改造

### Step 1️⃣：创建转换器（protocol-converter.ts）

**新增文件** `src/services/protocol-converter.ts`

```typescript
// 最重要的两个函数：
convertMasterToCrm(masterMsg) → crmMessage
convertCrmToMaster(crmMsg) → masterMessage
```

**时间**: 1-2 小时 | **代码**: 80 行

---

### Step 2️⃣：改造 WebSocketService（websocket.ts）

**修改文件** `src/services/websocket.ts`

关键改动：
```typescript
// 1. 连接到 Master（不是 crm-im-server）
this.socket = io('http://localhost:3000', {...})

// 2. 添加三个新方法
registerClient(deviceId, deviceType)  // 向 Master 注册
startHeartbeat(interval)               // 启动心跳
sendNotificationAck(notificationId)    // 发送确认

// 3. 修改两个现有方法
onMessage(callback)    // 自动转换为 crm 格式
sendMessage(crmMsg)    // 自动转换为 Master 格式
```

**时间**: 2-3 小时 | **代码**: 90 行改动

---

### Step 3️⃣：更新事件常量（constants.ts）

**修改文件** `src/shared/constants.ts`

```typescript
// 替换 WS_EVENTS 对象
export const WS_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
  CLIENT_REGISTER: 'client:register',           // ✨ 新增
  CLIENT_HEARTBEAT: 'client:heartbeat',         // ✨ 新增
  CLIENT_NOTIFICATION_ACK: 'client:notification:ack', // ✨ 新增
  MESSAGE: 'message'
}
```

**时间**: 0.5 小时 | **代码**: 20 行改动

---

### Step 4️⃣：初始化应用（App.tsx）

**修改文件** `src/App.tsx`

```typescript
useEffect(() => {
  const initializeApp = async () => {
    // 1. 连接到 Master
    await websocketService.connect(
      process.env.REACT_APP_MASTER_URL || 'http://localhost:3000'
    )

    // 2. 注册客户端
    const deviceId = getOrCreateDeviceId()  // 从 localStorage 读取
    await websocketService.registerClient(deviceId, 'desktop')

    // 3. 启动心跳（必须！）
    websocketService.startHeartbeat(25000)

    // 4. 监听消息（crm 格式，UI 无需改）
    websocketService.onMessage((crmMessage) => {
      // crmMessage 已转换，可直接用
    })
  }

  initializeApp()

  return () => {
    websocketService.stopHeartbeat()  // ✨ 新增
    websocketService.disconnect()
  }
}, [])
```

**时间**: 1 小时 | **代码**: 30 行改动

---

### Step 5️⃣：环境变量（.env.example）

**修改文件** `.env.example`

```bash
REACT_APP_MASTER_URL=http://localhost:3000
```

**时间**: 5 分钟 | **代码**: 2 行

---

## 📊 改动对照表

| 文件 | 状态 | 行数 | 说明 |
|------|------|------|------|
| `protocol-converter.ts` | ✨ 新增 | +80 | 转换函数 |
| `websocket.ts` | 🔧 改 | ~90 | Master 连接 |
| `constants.ts` | 🔧 改 | ~20 | 事件常量 |
| `App.tsx` | 🔧 改 | ~30 | 初始化 |
| `.env.example` | 🔧 改 | +2 | 配置 |
| **其他所有文件** | ✅ 不改 | 0 | UI/Redux/业务逻辑 |

---

## 🧪 测试三步走

### Phase 1: 单元测试（1-2 小时）

```javascript
// protocol-converter.ts 测试
✅ convertMasterToCrm() 正确转换所有字段
✅ convertCrmToMaster() 正确反向转换
✅ 时间戳秒↔毫秒正确
✅ 缺失字段用默认值
```

### Phase 2: 集成测试（2-3 小时）

```javascript
✅ 连接到 Master
✅ 向 Master 注册成功
✅ 心跳定时发送
✅ 接收 Master 消息并自动转换
✅ 发送消息自动转换并到达 Master
✅ 多消息监听器都能收到
```

### Phase 3: 手动测试（1-2 小时）

```javascript
✅ 应用启动正常
✅ UI 界面显示正常
✅ 消息列表展示正确
✅ 发送消息功能正常
✅ 实时推送正常
```

---

## 🚨 常见问题速查

### Q: UI 真的不用改吗？

**A**: 真的不用！转换层在通讯层处理，UI 继续用 crm 格式的 `Message` 类型。

```typescript
// onMessage 回调给 UI 的消息格式
interface Message {
  id: string
  fromId: string          // 来自 sender_id
  fromName: string        // 来自 sender_name
  toId: string            // 空值（Master 没有）
  topic: string           // 来自 account_id
  content: string         // 消息内容
  type: 'text' | 'file'   // 转换后的类型
  timestamp: number       // 毫秒时间戳
  fileUrl?: string        // 文件 URL
  fileName?: string       // 文件名
}
```

### Q: 转换函数会不会很复杂？

**A**: 不会，就是字段映射。Master 有 10+ 个字段，crm 也有 10+ 个，一一对应即可。

### Q: Master 协议更新了怎么办？

**A**: 只需要改 `protocol-converter.ts`，crm 格式保持不变。

### Q: 性能会下降吗？

**A**: 不会，转换是简单的对象操作，< 1ms，完全无影响。

### Q: 怎样处理 Master 的 payload 嵌套？

**A**: 转换函数已处理：`const payload = masterMessage.payload || masterMessage`

### Q: 消息确认机制是什么？

**A**: Master 推送消息后，自动发送 `client:notification:ack`，告诉 Master 已收到。

### Q: 心跳间隔多少合适？

**A**: 25 秒（Master 要求 30 秒内至少一次）。可配置，改 `startHeartbeat(interval)` 参数。

### Q: 设备 ID 怎样保证唯一性？

**A**: 存在 `localStorage`，首次生成 UUID，之后复用。

```typescript
function getOrCreateDeviceId(): string {
  const key = 'crm_pc_im_device_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = `crm-pc-im_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem(key, id)
  }
  return id
}
```

---

## 📅 时间参考

```
Day 1: 分析和设计        (4 小时)
Day 2: 编码 Part 1        (8 小时)  ← 可能最长的一天
Day 3: 编码 Part 2        (6 小时)
Day 4: 测试和调试 Part 1  (5 小时)
Day 5: 测试和调试 Part 2  (5 小时)
─────────────────────────────────
总计：                    (32 小时 / 4-5 天)
```

---

## ✅ 成功检查清单

```
部署前：
  ☐ TypeScript 编译无错误
  ☐ 所有单元测试通过
  ☐ 集成测试通过
  ☐ UI 界面功能正常
  ☐ Master 能接收消息
  ☐ crm-pc-im 能接收推送

部署后：
  ☐ 应用启动无异常
  ☐ 能正常连接到 Master
  ☐ 消息推送实时到达
  ☐ 消息发送正常转发
  ☐ 日志显示转换正常
  ☐ 无内存泄漏
```

---

## 🔗 相关文件位置

```
源代码：
  packages/crm-pc-im/
  ├── src/services/
  │   ├── websocket.ts          ← 修改
  │   └── protocol-converter.ts ← 新增
  ├── src/shared/
  │   ├── constants.ts          ← 修改
  │   ├── types.ts              ← 不改 ✅
  │   └── types-monitor.ts      ← 不改 ✅
  ├── src/App.tsx               ← 修改
  └── .env.example              ← 修改

文档：
  docs/
  ├── 13-crm-pc-im-Master协议集成实现规范.md ← 完整规范
  ├── 13-crm-pc-im-Master集成-快速参考.md   ← 本文件
  └── 最终决策-方案4最优.md                ← 决策依据
```

---

## 🚀 立即开始

1. **阅读完整规范**: `docs/13-crm-pc-im-Master协议集成实现规范.md`
2. **复制代码片段**: 逐个文件按步骤改造
3. **运行测试**: 单元 → 集成 → 手动
4. **验证部署**: 灰度上线后全量

---

**快速参考版本**: 1.0
**最后更新**: 2025-10-22
**配合使用**: 13-crm-pc-im-Master协议集成实现规范.md
