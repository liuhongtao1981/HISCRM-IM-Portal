# 时间戳格式诊断报告

## 问题症状

评论显示在 Web 上显示的是爬虫抓取时间，而不是抖音平台上的评论真实发布时间。

示例：
- **显示时间**: 2025-10-18 13:34:46 (爬虫运行时间)
- **平台时间**:
  - 2019-05-08 23:15 (评论1)
  - 2022-11-24 04:35 (评论2)
  - 2023-12-18 19:51 (评论3)

---

## 根本原因分析

### 可能的问题

**问题1: Douyin API 返回的 `create_time` 格式不是预期的秒级**

Douyin API 可能返回的是：
1. **毫秒级时间戳** (13位数字，如: 1557328500000)
2. **字符串格式** (如: "1557328500")
3. **其他格式** (如: Date 对象、ISO 字符串等)

**原始假设**:
```javascript
create_time: parseInt(c.create_time)  // 假设为秒级
```

如果 API 返回的是毫秒级，这个值会很大，但存储在秒级的 Unix 时间戳字段中会导致时间显示错误（或非常遥远的未来时间）。

---

## 修复策略

### 1. 平台层 (platform.js) - 添加诊断和转换

**文件**: `packages/worker/src/platforms/douyin/platform.js`

添加了诊断代码来检测 `create_time` 的格式：

```javascript
// 获取原始 create_time 值
const rawCreateTime = c.create_time;
let createTimeSeconds = parseInt(rawCreateTime);

// 诊断: 打印原始值（仅第一条评论）
if (respIdx === 0 && cIdx === 0) {
  logger.info(`🔍 Create time debug:`);
  logger.info(`   Raw value: ${rawCreateTime} (type: ${typeof rawCreateTime})`);
  logger.info(`   As seconds: ${createTimeSeconds}`);

  // 检查是否为毫秒级（13位数字）
  if (createTimeSeconds > 9999999999) {
    logger.info(`   ⚠️  Detected milliseconds format, converting to seconds`);
    createTimeSeconds = Math.floor(createTimeSeconds / 1000);
  }
}
```

**关键阈值**: `9999999999` (10位数字)
- 秒级范围: 0 - 9999999999 (足以覆盖 1970-2286 年)
- 毫秒级: 从 10000000000 开始 (13位)

### 2. 解析层 (comment-parser.js) - 毫秒级转换

**文件**: `packages/worker/src/parsers/comment-parser.js`

```javascript
if (item.create_time) {
  let timeValue = item.create_time;

  // 检查是否为毫秒级（13位数字）并转换为秒级
  if (timeValue > 9999999999) {
    timeValue = Math.floor(timeValue / 1000);
    logger.debug(`Comment: converted milliseconds to seconds`);
  }

  createdAt = timeValue;
}
```

### 3. 直接消息层 - 相同处理

在 `crawlDirectMessages` 中的消息映射处理毫秒级转换。

---

## 修复后的数据流

```
Douyin API
  ↓ (返回 create_time，可能是毫秒级)

平台层 (platform.js)
  ↓ (诊断: 检测格式)
  ↓ (转换: 毫秒→秒)

Parser (comment-parser.js)
  ↓ (二次检查: 再次转换毫秒→秒)
  ↓ (保留: 使用 create_time 字段)

Master (comments-dao.js)
  ↓ (存储: 入库秒级 Unix 时间戳)

数据库 (schema.sql)
  ↓ (显示: created_at 为正确的发布时间)
```

---

## 验证方法

### 1. 查看诊断日志

启动 Worker 后查看 logs 目录：

```bash
tail -f packages/worker/logs/worker.log | grep "Create time debug"
```

输出应该显示:
```
🔍 Create time debug:
   Raw value: 1557328500000 (type: number)
   As seconds: 1557328500000
   ⚠️  Detected milliseconds format, converting to seconds
   After conversion: 1557328500
   Formatted (corrected): 2019/5/8 23:15:00
```

### 2. 检查数据库时间

```sql
SELECT
  id,
  content,
  created_at,
  datetime(created_at, 'unixepoch', 'localtime') as publish_time
FROM comments
LIMIT 5;
```

**期望结果**:
- 评论1: created_at=1557328500, publish_time=2019-05-08 23:15:00
- 评论2: created_at=1669235700, publish_time=2022-11-24 04:35:00
- 评论3: created_at=1702900260, publish_time=2023-12-18 19:51:00

### 3. Web UI 验证

在 Admin Web 中检查评论时间显示是否与真实平台时间匹配。

---

## 时间戳参考

### 常见时间戳值

| 日期时间 | 秒级 (10位) | 毫秒级 (13位) |
|---------|-----------|-------------|
| 2019-05-08 23:15 | 1557328500 | 1557328500000 |
| 2022-11-24 04:35 | 1669235700 | 1669235700000 |
| 2023-12-18 19:51 | 1702900260 | 1702900260000 |
| 2025-10-18 13:34 | 1760765674 | 1760765674000 |

### 格式检测规则

```javascript
function detectTimestampFormat(timestamp) {
  const num = Number(timestamp);

  if (num > 9999999999) {
    return 'milliseconds (>10B, 需转换为秒)';
  } else if (num > 1000000000) {
    return 'seconds (10B以上, 1970年之后)';
  } else {
    return 'seconds or error (<10B, 可能是1970年前或错误的值)';
  }
}
```

---

## 完整的时间转换逻辑

```javascript
/**
 * 将任意格式的时间戳转换为秒级 Unix 时间戳
 * @param {*} timestamp - 可能是秒级、毫秒级或其他格式
 * @returns {number} 秒级 Unix 时间戳
 */
function normalizeTimestamp(timestamp) {
  if (!timestamp) {
    return Math.floor(Date.now() / 1000);
  }

  let seconds = Number(timestamp);

  // 如果是毫秒级（>9999999999），转换为秒级
  if (seconds > 9999999999) {
    seconds = Math.floor(seconds / 1000);
  }

  // 如果值过小，可能是无效的
  if (seconds < 0 || seconds > 253402300799) {
    console.warn(`Invalid timestamp: ${timestamp}`);
    return Math.floor(Date.now() / 1000);
  }

  return seconds;
}
```

---

## 影响的组件

| 组件 | 文件 | 修改 | 状态 |
|------|------|------|------|
| **平台爬虫** | platform.js (评论) | 添加诊断和转换 | ✅ |
| **平台爬虫** | platform.js (私信) | 添加毫秒级转换 | ✅ |
| **解析器** | comment-parser.js | 添加毫秒级转换 | ✅ |
| **Master DAO** | comments-dao.js | 已有兼容逻辑 | ✓ |
| **Web UI** | MessageManagementPage.js | 无需修改 | ✓ |

---

## 后续验证步骤

1. **启动系统**: `npm run dev`
2. **查看诊断日志**: 确认 `Create time debug` 输出
3. **手动抓取**: 添加一些测试评论
4. **检查数据库**: 验证时间是否正确转换
5. **查看 Web**: 确认显示的时间符合预期
6. **提交代码**: 完成修复

---

## 相关文档

- [COMMENT_TIMESTAMP_REAL_TIME_FIX.md](./COMMENT_TIMESTAMP_REAL_TIME_FIX.md) - 详细的时间处理修复
- [COMMENT_TIMESTAMP_QUICK_FIX.md](./COMMENT_TIMESTAMP_QUICK_FIX.md) - 快速参考指南

---

## 修改记录

| 日期 | 修改项 | 状态 |
|------|--------|------|
| 2025-10-18 | 添加毫秒级时间戳检测和转换 | ✅ |
| 2025-10-18 | 在平台层添加诊断日志 | ✅ |
| 2025-10-18 | 在解析器添加毫秒级转换 | ✅ |
| 2025-10-18 | 在私信处理添加毫秒级转换 | ✅ |
