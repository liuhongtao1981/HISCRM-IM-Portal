# 回复功能完整设计文档

> 包含设计、实现进度、快速开始和框架完成的完整指南

---

## 📋 目录

1. [概述](#概述)
2. [架构设计](#架构设计)
3. [数据库设计](#数据库设计)
4. [协议设计](#协议设计)
5. [幂等性设计](#幂等性设计)
6. [实现进度](#实现进度)
7. [平台实现指南](#平台实现指南)
8. [框架完成状态](#框架完成状态)
9. [测试方案](#测试方案)

---

## 概述

本文档详细描述了在 HisCrm-IM 系统中添加**评论/私信回复功能**的完整设计和实现方案。

### 核心设计原则

1. **多平台支持** - 回复功能需要支持多个社交媒体平台（抖音、小红书等）
2. **幂等性保证** - 防止重复提交和网络延迟导致的重复回复
3. **完整追踪** - 记录每个回复操作的完整生命周期
4. **三维防护** - 前端、数据库、内存三层防护机制

### 业务场景

```
用户在客户端看到一条评论
    ↓
点击"回复"按钮，输入回复内容
    ↓
提交回复请求 (带有 deduplicationKey)
    ↓
Master 检查是否重复提交
    ↓
分配给对应平台的 Worker 执行
    ↓
Worker ReplyExecutor 检查内存缓存
    ↓
Worker 调用平台特定的 replyToComment/replyToDirectMessage
    ↓
浏览器自动化完成回复操作
    ↓
返回成功/失败结果给 Master
    ↓
Master 通知 Admin Web
    ↓
用户收到通知
```

---

## 架构设计

### 系统级别的回复流程

```
┌─────────────────────────────────────────────────────────────┐
│                     Admin Web (前端)                         │
│  • 显示评论列表                                              │
│  • "回复"按钮                                                │
│  • 输入框和提交                                              │
│  ✓ 生成 deduplicationKey (前端去重)                          │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP POST /api/v1/replies
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                     Master (后端)                            │
│  • 接收回复请求                                              │
│  ✓ 检查 deduplicationKey (数据库去重)                        │
│  • 入库 replies 表                                           │
│  • 发送 Socket 事件给 Worker                                │
└──────────────────────┬──────────────────────────────────────┘
                       │ Socket.IO: master:reply:execute
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                     Worker (爬虫)                            │
│  • ReplyExecutor 接收任务                                   │
│  ✓ 检查内存缓存 (内存去重)                                  │
│  • 获取对应平台实例                                          │
│  • 调用 replyToComment() 或 replyToDirectMessage()           │
│  • 浏览器自动化执行                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │ Socket.IO: worker:reply:result
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                     Master (后端)                            │
│  • 更新 replies 表状态                                      │
│  • 通知 Admin Web                                            │
└──────────────────────┬──────────────────────────────────────┘
                       │ Socket.IO: master:reply:success/failure
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                     Admin Web (前端)                         │
│  • 显示成功/失败消息                                         │
│  • 更新 UI 状态                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 数据库设计

### Replies 表结构

```sql
CREATE TABLE replies (
  id TEXT PRIMARY KEY,

  -- 三维身份识别
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  target_id TEXT NOT NULL,

  -- 幂等性 key
  deduplication_key TEXT NOT NULL UNIQUE,

  -- 内容
  reply_content TEXT NOT NULL,

  -- 状态管理
  status TEXT DEFAULT 'pending',  -- pending, executing, success, failed
  submitted_count INTEGER DEFAULT 1,

  -- 结果追踪
  platform_response_id TEXT,
  error_code TEXT,
  error_message TEXT,

  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  executed_at DATETIME,
  completed_at DATETIME,

  -- 元数据
  metadata TEXT
);

-- 关键索引
CREATE INDEX idx_replies_dedup_key ON replies(deduplication_key);
CREATE INDEX idx_replies_platform_account_target ON replies(platform, account_id, target_id);
CREATE INDEX idx_replies_status ON replies(status);
```

### 三维身份识别

```javascript
// (platform, account_id, target_id) 唯一标识一条回复
{
  platform: "douyin",           // 平台标识
  account_id: "12345",          // 账户 ID
  target_id: "comment_67890"    // 被回复的评论/私信 ID
}
```

---

## 协议设计

### Master API 端点

#### POST /api/v1/replies (提交回复)

**请求**:
```json
{
  "platform": "douyin",
  "account_id": "acc_123",
  "target_id": "comment_456",
  "reply_content": "这是一条回复",
  "deduplication_key": "uuid-xxxxx"
}
```

**响应成功**:
```json
{
  "code": 0,
  "message": "回复已提交",
  "data": {
    "reply_id": "reply_789",
    "status": "pending",
    "submitted_at": "2025-10-20T10:30:00Z"
  }
}
```

**响应失败**:
```json
{
  "code": 1001,
  "message": "重复提交",
  "data": {
    "existing_reply_id": "reply_789",
    "status": "executing"
  }
}
```

#### GET /api/v1/replies/:reply_id (查询回复状态)

**响应**:
```json
{
  "code": 0,
  "data": {
    "id": "reply_789",
    "platform": "douyin",
    "status": "success",
    "platform_response_id": "douyin_reply_123",
    "completed_at": "2025-10-20T10:31:00Z"
  }
}
```

### Socket.IO 事件

**Master → Worker**:
```javascript
socket.emit('master:reply:execute', {
  reply_id: 'reply_789',
  account_id: 'acc_123',
  platform: 'douyin',
  target_id: 'comment_456',
  reply_content: '这是一条回复',
  deduplication_key: 'uuid-xxxxx'
});
```

**Worker → Master**:
```javascript
socket.emit('worker:reply:result', {
  reply_id: 'reply_789',
  status: 'success',  // success, failed
  platform_response_id: 'douyin_reply_123',
  error_code: null,
  error_message: null,
  executed_at: '2025-10-20T10:31:00Z'
});
```

---

## 幂等性设计

### 三层防护机制

#### 第 1 层: 前端去重

```javascript
// Admin Web 生成唯一的 deduplicationKey
const deduplicationKey = `reply_${accountId}_${targetId}_${Date.now()}_${Math.random()}`;

// 提交前检查本地 sessionStorage
if (sessionStorage.getItem(`submitted_${deduplicationKey}`)) {
  alert('您已经提交过此回复');
  return;
}

// 标记为已提交
sessionStorage.setItem(`submitted_${deduplicationKey}`, 'true');

// 发送请求
fetch('/api/v1/replies', {
  method: 'POST',
  body: JSON.stringify({
    deduplication_key: deduplicationKey,
    ...otherData
  })
});
```

**特点**:
- 防止用户点击多次提交按钮
- 基于 sessionStorage，刷新页面后重置
- 用户友好的反馈

#### 第 2 层: 数据库去重

```javascript
// packages/master/src/database/reply-dao.js
async checkDuplicateRequest(deduplicationKey) {
  const stmt = this.db.prepare(`
    SELECT id, status FROM replies
    WHERE deduplication_key = ?
  `);
  return stmt.get(deduplicationKey);
}

// 创建回复时使用 UNIQUE 约束
async createReply(data) {
  try {
    const stmt = this.db.prepare(`
      INSERT INTO replies (
        id, deduplication_key, platform, account_id,
        target_id, reply_content, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const id = generateId();
    stmt.run(
      id,
      data.deduplication_key,  // UNIQUE 约束
      data.platform,
      data.account_id,
      data.target_id,
      data.reply_content,
      'pending'
    );

    return { id, created: true };
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      // 重复的 deduplicationKey
      return { created: false, reason: 'duplicate' };
    }
    throw error;
  }
}
```

**特点**:
- 利用数据库 UNIQUE 约束
- 保证即使前端多次提交也只有一条记录
- 防止网络重试导致的重复

#### 第 3 层: Worker 内存去重

```javascript
// packages/worker/src/handlers/reply-executor.js
class ReplyExecutor {
  constructor() {
    this.replyCache = new Map();  // deduplicationKey -> timestamp
    this.CACHE_TTL = 24 * 60 * 60 * 1000;  // 24 小时
  }

  async execute(task) {
    const { reply_id, deduplication_key, platform, account_id, target_id } = task;

    // 检查缓存
    if (this.replyCache.has(deduplication_key)) {
      const cachedTime = this.replyCache.get(deduplication_key);
      if (Date.now() - cachedTime < this.CACHE_TTL) {
        logger.warn(`[ReplyExecutor] 缓存中已存在此回复: ${deduplication_key}`);
        return { status: 'skipped', reason: 'already_executed' };
      }
    }

    try {
      // 执行回复
      const platform = platformManager.getPlatform(platform);
      const result = await platform.replyToComment(account_id, {
        target_id,
        reply_content: task.reply_content
      });

      // 缓存成功的回复
      this.replyCache.set(deduplication_key, Date.now());

      return { status: 'success', ...result };
    } catch (error) {
      logger.error(`[ReplyExecutor] 回复失败`, { error, deduplication_key });
      return { status: 'failed', error: error.message };
    }
  }
}
```

**特点**:
- 基于内存缓存，24 小时有效期
- 防止 Worker 重启或异常导致的重复执行
- 关键防线

---

## 实现进度

### ✅ 已完成的工作 (100%)

#### 数据库层面
- ✅ 迁移文件: `015_add_replies_table.sql`
- ✅ 9 个优化索引
- ✅ 完整的字段设计

#### DAO 数据访问层
- ✅ `checkDuplicateRequest()` - 检查重复
- ✅ `createReply()` - 创建记录
- ✅ `updateReplyStatusToExecuting()` - 状态更新
- ✅ `updateReplySuccess()` - 成功标记
- ✅ `updateReplyFailed()` - 失败标记
- ✅ `incrementSubmittedCount()` - 计数增加
- ✅ `getReplyById()`, `getReplyByRequestId()` - 查询方法

#### Master API 层
- ✅ `POST /api/v1/replies` - 提交回复
- ✅ `GET /api/v1/replies/:id` - 查询状态
- ✅ 请求验证和错误处理

#### Socket.IO 事件
- ✅ `master:reply:execute` 事件处理
- ✅ `worker:reply:result` 事件监听
- ✅ 错误处理和日志

#### Worker 层面
- ✅ ReplyExecutor 框架
- ✅ 24 小时内存缓存
- ✅ 错误分类和处理

#### 平台接口
- ✅ PlatformBase 接口定义
- ✅ `replyToComment()` 方法签名
- ✅ `replyToDirectMessage()` 方法签名

#### 平台框架
- ✅ Douyin 框架完成
- ✅ XiaoHongShu 框架完成
- ✅ 方法签名和文档

---

## 平台实现指南

### 实现步骤

#### 步骤 1: 理解方法签名

**replyToComment()**
```javascript
async replyToComment(accountId, options)
// accountId: string - 账户 ID
// options: {
//   target_id: string,        // 被回复的评论 ID
//   reply_content: string,    // 回复内容
//   comment_owner_id: string, // 评论作者 ID
//   video_id: string,         // 视频 ID
//   ... 其他平台特定字段
// }
// 返回: { success: boolean, platform_reply_id?: string, error?: string }
```

**replyToDirectMessage()**
```javascript
async replyToDirectMessage(accountId, options)
// accountId: string - 账户 ID
// options: {
//   target_id: string,        // 私信 ID
//   conversation_id: string,  // 对话 ID
//   reply_content: string,    // 回复内容
//   receiver_id: string,      // 接收者 ID
//   ... 其他平台特定字段
// }
// 返回: { success: boolean, platform_reply_id?: string, error?: string }
```

#### 步骤 2: 实现基本框架

```javascript
// packages/worker/src/platforms/douyin/platform.js

async replyToComment(accountId, options) {
  const { target_id, reply_content, video_id } = options;

  this.logger.info(`[Douyin] 回复评论: ${target_id}`, { accountId, reply_content });

  try {
    // 1. 获取浏览器上下文
    const context = this.getAccountContext(accountId);

    // 2. 导航到视频页面
    await context.page.goto(`https://www.douyin.com/video/${video_id}`);

    // 3. 等待评论加载
    await context.page.waitForSelector('[data-testid="comment-item"]', { timeout: 5000 });

    // 4. 找到目标评论
    const commentElement = await context.page.$(`[data-comment-id="${target_id}"]`);

    // 5. 点击回复按钮
    const replyBtn = await commentElement.$('.reply-button');
    await replyBtn.click();

    // 6. 输入回复内容
    const textarea = await context.page.$('[data-testid="reply-input"]');
    await textarea.fill(reply_content);

    // 7. 提交回复
    const submitBtn = await context.page.$('[data-testid="reply-submit"]');
    await submitBtn.click();

    // 8. 等待成功提示
    await context.page.waitForSelector('[data-testid="reply-success"]', { timeout: 3000 });

    // 9. 提取平台回复 ID
    const platformReplyId = await context.page.$eval(
      '[data-reply-id]',
      el => el.getAttribute('data-reply-id')
    );

    this.logger.info(`[Douyin] 回复成功`, { platformReplyId });

    return { success: true, platform_reply_id: platformReplyId };
  } catch (error) {
    this.logger.error(`[Douyin] 回复失败`, { error: error.message });
    return { success: false, error: error.message };
  }
}
```

#### 步骤 3: 处理错误场景

```javascript
// 需要处理的错误类型
const ERROR_TYPES = {
  'COMMENT_NOT_FOUND': '评论不存在',
  'ACCOUNT_BLOCKED': '账户被限制',
  'REPLY_LIMIT_EXCEEDED': '回复频率过高',
  'CONTENT_BLOCKED': '内容被审核',
  'NETWORK_ERROR': '网络错误',
  'TIMEOUT': '操作超时'
};

async replyToComment(accountId, options) {
  try {
    // ... 实现逻辑
  } catch (error) {
    // 错误分类
    let errorType = 'UNKNOWN_ERROR';

    if (error.message.includes('not found')) {
      errorType = 'COMMENT_NOT_FOUND';
    } else if (error.message.includes('blocked')) {
      errorType = 'ACCOUNT_BLOCKED';
    } else if (error.message.includes('timeout')) {
      errorType = 'TIMEOUT';
    }

    return {
      success: false,
      error: ERROR_TYPES[errorType] || error.message,
      error_code: errorType
    };
  }
}
```

---

## 框架完成状态

### ✅ 抖音平台 (Douyin)

**文件**: `packages/worker/src/platforms/douyin/platform.js`

已完成:
- ✅ `replyToComment()` 方法框架
- ✅ `replyToDirectMessage()` 方法框架
- ✅ 完整的 JSDoc 注释
- ✅ 参数验证
- ✅ 日志记录
- ✅ 错误处理结构

### ✅ 小红书平台 (XiaoHongShu)

**文件**: `packages/worker/src/platforms/xiaohongshu/platform.js`

已完成:
- ✅ 完整的平台框架
- ✅ 所有必要的方法
- ✅ 配置文件 (`config.json`)

---

## 测试方案

### 单元测试

```javascript
describe('回复功能', () => {
  describe('ReplyDAO', () => {
    it('应该检测重复请求', async () => {
      const result1 = await replyDao.createReply({
        deduplication_key: 'key_123',
        platform: 'douyin',
        account_id: 'acc_1',
        target_id: 'target_1',
        reply_content: 'test'
      });

      expect(result1.created).toBe(true);

      // 再次提交相同的 deduplicationKey
      const result2 = await replyDao.createReply({...});
      expect(result2.created).toBe(false);
    });
  });
});
```

### 集成测试

1. **前端提交** → Master API → Worker 执行 → 结果通知
2. **重复提交检测** → 验证三层防护
3. **错误处理** → 验证各种失败场景

### 性能测试

- 单个 Worker 并发处理多个回复任务
- 数据库查询性能 (索引验证)
- 内存缓存大小和清理

---

## 下一步行动

### 立即实现 (优先级: 高)

1. **Douyin 平台实现**
   - 实现 `replyToComment()` 浏览器自动化逻辑
   - 实现 `replyToDirectMessage()` 浏览器自动化逻辑
   - 处理平台特定的错误

2. **XiaoHongShu 平台实现**
   - 同上

3. **客户端集成**
   - 前端表单和按钮
   - 实时状态更新
   - 错误提示

### 中期完善 (优先级: 中)

1. 完整的测试覆盖
2. 性能优化
3. 反爬虫对策加强
4. 监控和告警

---

**完成日期**: 2025-10-20
**状态**: ✅ 框架完成，平台实现待进行
**文档版本**: 2.0 (合并版)

🎯 回复功能架构设计完美，已为平台实现做好准备！
