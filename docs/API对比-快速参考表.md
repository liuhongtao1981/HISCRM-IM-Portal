# API 对比 - 快速参考表

**用途**: 快速查看原版 IM 和 Master 各接口的对标情况

---

## 接口对标速查表

### 账户管理 (6/6 ✅ 100%)

| # | 原版 IM | Master | 状态 |
|---|---------|--------|------|
| 1 | 获取账户列表 | GET /api/v1/accounts | ✅ 完全匹配 |
| 2 | 获取单个账户 | GET /api/v1/accounts/:id | ✅ 完全匹配 |
| 3 | 创建账户 | POST /api/v1/accounts | ✅ 完全匹配 |
| 4 | 更新账户 | PATCH /api/v1/accounts/:id | ✅ 完全匹配 |
| 5 | 删除账户 | DELETE /api/v1/accounts/:id | ✅ 完全匹配 |
| 6 | 账户状态 | GET /api/v1/accounts/status/all | ✅ 完全匹配 |

---

### 会话查询 (1/4 ⚠️ 25%)

| # | 原版 IM | Master | 状态 | 工作 |
|---|---------|--------|------|------|
| 7 | 会话列表 (初始) | GET /api/v1/conversations | ⚠️ 部分 | 改进分页 6h |
| 8 | 会话详情 | ❌ 无 | ❌ 缺失 | 新增 8h |
| 9 | 搜索会话 | ❌ 无 | ❌ 缺失 | 新增 6h |
| 10 | 置顶/静音 | PATCH /api/v1/conversations/:id | ⚠️ 部分 | 新增 4h |

---

### 消息查询 (2/6 ⚠️ 33%)

| # | 原版 IM | Master | 状态 | 工作 |
|---|---------|--------|------|------|
| 11 | 消息历史 | GET /api/v1/direct-messages | ⚠️ 部分 | 改进 6h |
| 12 | 单条消息 | GET /api/v1/messages/:id | ✅ 完全匹配 | - |
| 13 | 按类型查询 | ❌ 无 | ❌ 缺失 | 新增 4h |
| 14 | 搜索消息 | ❌ 无 | ❌ 缺失 | 新增 8h |
| 15 | 消息统计 | ❌ 无 | ❌ 缺失 | 新增 3h |

---

### 消息操作 (1/5 ⚠️ 20%)

| # | 原版 IM | Master | 状态 | 工作 |
|---|---------|--------|------|------|
| 16 | 标记已读 | POST /api/v1/messages/:id/read | ⚠️ 部分 | 改进 4h |
| 17 | 发送消息 | Socket.IO (无 HTTP) | ⚠️ 部分 | 新增 6h |
| 18 | 编辑消息 | ❌ 无 | ❌ 缺失 | 新增 6h |
| 19 | 删除消息 | ❌ 无 | ❌ 缺失 | 新增 4h |
| 20 | 会话静音 | ❌ 无 | ❌ 缺失 | 新增 2h |

---

### 用户管理 (0/3 ❌ 0%)

| # | 原版 IM | Master | 状态 | 工作 |
|---|---------|--------|------|------|
| 21 | 用户信息 | ❌ 无 | ❌ 缺失 | 新增 6h |
| 22 | 搜索用户 | ❌ 无 | ❌ 缺失 | 新增 3h |
| 23 | 黑名单管理 | ❌ 无 | ❌ 缺失 | 新增 4h |

---

## 工作量总结

### 按优先级分组

| 优先级 | 类别 | 接口数 | 工作量 | 目标 |
|--------|------|--------|--------|------|
| 🔴 P1 | 必须 | 14 | 50h | 100% 兼容原版 |
| 🟡 P2 | 重要 | 5 | 21h | 高级功能 |
| 🟢 P3 | 可选 | 2 | 7h | 增强功能 |

### 按工作类型分组

| 类型 | 接口数 | 工作量 | 说明 |
|------|--------|--------|------|
| ✅ 完全实现 | 6 | 0h | 账户管理已完成 |
| ⚠️ 需改进 | 4 | 20h | 修改现有接口 |
| ❌ 需新增 | 14 | 58h | 创建新接口 |

---

## 按优先级的实现路线

### 🔴 P1 必须实现 (50 小时)

#### 第一阶段：改进现有接口 (20 小时)

```
1. 会话列表改进 (6h)
   位置: GET /api/v1/conversations
   改进: cursor分页 + unread_count + has_more + sort_by

2. 消息历史改进 (6h)
   位置: GET /api/v1/direct-messages
   改进: direction + has_more + 时间筛选

3. 标记已读改进 (4h)
   位置: POST /api/v1/messages/:id/read
   改进: 支持批量 + 对话级标记

4. 发送消息HTTP API (4h)
   位置: POST /api/v1/messages/send
   新增: HTTP 直接发送接口
```

#### 第二阶段：新增核心接口 (30 小时)

```
1. 会话详情 (8h)
   新增: GET /api/v1/conversations/:id?include_messages=true
   功能: 返回对话详情 + 消息列表

2. 搜索消息 (8h)
   新增: GET /api/v1/messages/search
   功能: 全文搜索 + 日期过滤 + 类型过滤

3. 用户信息 (6h)
   新增: GET /api/v1/users/:userId
   功能: 用户详情查询

4. 用户搜索 (3h)
   新增: GET /api/v1/users/search
   功能: 用户名搜索

5. 用户黑名单 (4h)
   新增: POST /api/v1/users/:userId/block
   功能: 拉黑/解除黑名单

6. 会话搜索 (6h) - 可选并入消息搜索
   新增: GET /api/v1/conversations/search
   功能: 搜索会话
```

---

### 🟡 P2 重要功能 (21 小时)

```
1. 会话置顶/静音 (4h)
   新增: PATCH /api/v1/conversations/:id/pin
   新增: PATCH /api/v1/conversations/:id/mute

2. 编辑消息 (6h)
   新增: PATCH /api/v1/messages/:id
   功能: 编辑 + 历史记录

3. 删除消息 (4h)
   新增: DELETE /api/v1/messages/:id
   功能: 软删除 + 审计

4. 消息统计 (3h)
   新增: GET /api/v1/messages/stats
   功能: 统计数据

5. 按类型查询 (4h)
   新增: GET /api/v1/messages?type=image
   功能: 按消息类型过滤
```

---

### 🟢 P3 可选功能 (7 小时)

```
1. 高级搜索 (3h)
2. 消息缓存优化 (4h)
```

---

## 关键数据转换

### 时间单位转换

```javascript
// 从 Master (秒) 转换到 IM (毫秒)
const imTimestamp = masterTimestamp * 1000;

// 从 IM (毫秒) 转换到 Master (秒)
const masterTimestamp = Math.floor(imTimestamp / 1000);

// 示例
masterTimestamp = 1697980000      // 秒
imTimestamp = 1697980000000       // 毫秒
```

---

### 分页方式转换

```javascript
// IM 的 cursor 分页
const imRequest = {
  cursor: 0,
  count: 50
};

// Master 的 offset/limit
const masterQuery = {
  offset: 0,
  limit: 50
};

// 相互转换
const cursor = offset / limit;     // IM cursor = Master offset / limit
const offset = cursor * limit;     // Master offset = IM cursor × limit
```

---

### 会话 ID 格式

| 系统 | 格式 | 说明 | 示例 |
|-----|------|------|------|
| 原版 IM | user_id 或特殊格式 | 对方的 user_id 或 MD5 | `user_456` 或 `123456_abcdef` |
| Master | 自增 ID | 评论 ID 或对话 ID | `comment_123` 或 `conv_456` |

需要建立映射表将两者关联。

---

## 重点查询

### "某个功能 Master 有吗？"

直接看表中状态列：
- ✅ 完全匹配 = 完全兼容
- ⚠️ 部分 = 有但需改进
- ❌ 缺失 = 完全没有

### "这个功能要花多久？"

看对应行的"工作"列：
- 0h = 已完成
- 2-4h = 小修改
- 6h = 中等工作
- 8h = 大工作

### "按优先级实现需要多久？"

- P1 必须: 50 小时 (约 6-7 个工作日)
- P1+P2: 71 小时 (约 9 个工作日)
- 全部: 78 小时 (约 10 个工作日)

---

## 相关文档

| 文档 | 用途 | 内容 |
|------|------|------|
| [原版IM-API清单.md](./原版IM-API清单.md) | ✓ 详细参考 | 原版 24 个接口的完整定义 |
| [Master-API现有清单.md](./Master-API现有清单.md) | ✓ 详细参考 | Master 50+ 个接口的完整列表 |
| [13-Master缺失接口精准对比.md](./13-Master缺失接口精准对比.md) | ✓ 实现指南 | 缺失接口 + 代码框架 |
| [API对比总结-原版IM-vs-Master.md](./API对比总结-原版IM-vs-Master.md) | ✓ 深度分析 | 详细的差异分析和建议 |

---

## 快速导航

### 我想...

- **了解原版 IM 有什么功能**: 看[原版IM-API清单.md](./原版IM-API清单.md)
- **了解 Master 现在有什么**: 看[Master-API现有清单.md](./Master-API现有清单.md)
- **快速对比两者的差异**: **看这个文档** (本文) ← 你在这里
- **了解详细实现细节**: 看[13-Master缺失接口精准对比.md](./13-Master缺失接口精准对比.md)
- **做深度分析了解影响**: 看[API对比总结-原版IM-vs-Master.md](./API对比总结-原版IM-vs-Master.md)

---

## 统计速览

```
原版 IM 接口统计
━━━━━━━━━━━━━━━━━━━━━
账户管理    6 个 ✅ 100%
会话查询    4 个 ⚠️  25%
消息查询    6 个 ⚠️  33%
消息操作    5 个 ⚠️  20%
用户管理    3 个 ❌  0%
━━━━━━━━━━━━━━━━━━━━━
总计       24 个 42%

工作量估计
━━━━━━━━━━━━━━━━━━━━━
改进现有    20 小时
新增核心    30 小时
新增高级    21 小时
新增可选     7 小时
━━━━━━━━━━━━━━━━━━━━━
总计       78 小时

优先级分组
━━━━━━━━━━━━━━━━━━━━━
P1 必须    50 小时 ← 建议首先完成
P2 重要    21 小时
P3 可选     7 小时
━━━━━━━━━━━━━━━━━━━━━
总计       78 小时
```

---

**最后更新**: 2025-10-23

