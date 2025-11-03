# BUG: 私信会话数据抓取不准确

**发现时间**: 2025-11-03 13:45
**严重程度**: 🔴 高
**影响范围**: 抖音平台私信会话抓取

---

## 问题描述

Worker 爬虫抓取的私信会话数据与抖音创作中心实际显示的会话列表**不一致**。

### 实际情况对比

| 数据源 | 会话数量 | 会话列表 |
|-------|---------|---------|
| **抖音创作中心** (真实数据) | 6+ 个 | 1. 派爱你 (10-29)<br>2. 时光对话 (10-27)<br>3. Tommy (10-27)<br>4. 沉年雪 (10-26)<br>5. 巨寶 (10-24)<br>6. 福盖样浪汤牛肉面 (10-24) |
| **CRM-PC-IM 客户端** (爬虫数据) | 4 个 | 1. 李艳（售诚护理服务）(10/31) ⚠️<br>2. 派爱你 (10/29) ✅<br>3. 时光对话 (10/27) ✅<br>4. Tommy (10/27) ✅ |
| **Master 内存** | 37 个 | 总计 37 个会话（历史累计） |

### 问题分析

1. ❌ **"李艳（售诚护理服务）10/31"** - 这个会话在抖音创作中心不存在
   - 可能是已删除的历史会话
   - 或者是错误识别的数据

2. ❌ **缺少的会话** - 抖音有 6 个会话，但客户端只显示 4 个
   - 缺少：沉年雪 (10-26)
   - 缺少：巨寶 (10-24)
   - 缺少：福盖样浪汤牛肉面 (10-24)

3. ⚠️ **会话总数不符** - Master 内存中有 37 个会话
   - 可能包含大量历史已删除的会话
   - 需要实现会话的自动清理机制

---

## 根本原因分析

### 1. 虚拟列表滚动问题

**文件**: `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js`

**可能的问题**:
- 虚拟列表没有滚动到底部
- 只抓取了当前可见的 4 个会话
- 滚动逻辑不够健壮

```javascript
// 当前实现（推测）
// 1. 加载页面
// 2. 等待虚拟列表渲染
// 3. 提取可见的会话元素 ← 问题：只提取了可见的部分
// 4. 返回数据

// 应该改为:
// 1. 加载页面
// 2. 等待虚拟列表渲染
// 3. 滚动到底部，触发所有数据加载 ← 需要添加
// 4. 提取所有会话元素
// 5. 返回数据
```

### 2. React Fiber 数据提取不完整

**当前方法**:
- 通过 DOM 元素的 `__reactFiber$` 属性提取数据
- 可能只提取了当前挂载的 Fiber 节点
- 虚拟列表中未挂载的节点无法提取

**解决方案**:
- 方案 A: 滚动虚拟列表，逐步加载所有节点
- 方案 B: 拦截 API 请求，直接获取会话列表数据

### 3. 数据过滤或排序问题

**可能的问题**:
- 爬虫有额外的过滤条件（如只抓取未读会话）
- 排序逻辑导致旧会话被忽略
- 时间戳计算错误，导致会话顺序混乱

---

## 影响范围

### 功能影响
- ❌ 客户端显示的会话列表不完整
- ❌ 用户可能错过重要的私信消息
- ❌ 历史会话累积过多，占用内存

### 数据影响
- ⚠️ Master 内存中有 37 个会话（包含历史数据）
- ⚠️ 数据库中也保存了这 37 个会话
- ⚠️ 需要清理无效的历史会话

---

## 复现步骤

1. 启动 Master 和 Worker
2. Worker 自动抓取抖音私信会话
3. 打开 CRM-PC-IM 客户端
4. 对比客户端显示的会话列表与抖音创作中心
5. 发现会话数量和内容不一致

---

## 建议修复方案

### 方案 1: 改进虚拟列表滚动逻辑（推荐）

**优点**:
- 直接从 UI 层面提取数据
- 不依赖 API 拦截
- 可以获取完整的会话列表

**实现步骤**:
1. 修改 `crawl-direct-messages-v2.js`
2. 添加虚拟列表滚动逻辑：
```javascript
async function scrollToLoadAllConversations(page) {
  const listSelector = '.conversation-list'; // 实际选择器
  let previousCount = 0;
  let stableCount = 0;

  while (stableCount < 3) {
    // 获取当前会话数量
    const currentCount = await page.$$eval(listSelector, (items) => items.length);

    if (currentCount === previousCount) {
      stableCount++;
    } else {
      stableCount = 0;
      previousCount = currentCount;
    }

    // 滚动到底部
    await page.evaluate((selector) => {
      const list = document.querySelector(selector);
      if (list) {
        list.scrollTop = list.scrollHeight;
      }
    }, listSelector);

    await page.waitForTimeout(500); // 等待加载
  }

  logger.info(`滚动完成，共加载 ${previousCount} 个会话`);
}
```

3. 在提取数据前调用此函数
4. 测试验证

### 方案 2: API 拦截（备选）

**优点**:
- 获取最准确的数据
- 不受 UI 渲染影响
- 性能更好

**实现步骤**:
1. 启用 CDP (Chrome DevTools Protocol) 网络拦截
2. 监听会话列表 API 请求（如 `api/im/conversation_list`）
3. 直接从 API 响应中提取会话数据
4. 跳过 DOM 和 Fiber 提取

### 方案 3: 会话数据清理机制

**功能**:
- 定期清理已删除/过期的会话
- 避免内存中累积过多历史数据

**实现**:
```javascript
// CacheDAO 添加清理方法
cleanInactiveConversations(accountId, daysAgo = 30) {
  const cutoffTime = Math.floor(Date.now() / 1000) - (daysAgo * 24 * 60 * 60);
  const result = this.db.prepare(`
    DELETE FROM cache_conversations
    WHERE account_id = ? AND last_message_time < ?
  `).run(accountId, cutoffTime);
  return result.changes;
}
```

---

## 测试验证

### 验证步骤
1. ✅ 修改爬虫代码
2. ✅ 重启 Worker 进程
3. ✅ 手动触发会话抓取
4. ✅ 对比抖音创作中心和客户端显示
5. ✅ 验证会话数量和内容一致

### 预期结果
- 客户端显示的会话列表与抖音创作中心完全一致
- 所有最新的会话都能被正确抓取
- 历史会话会被自动清理

---

## 相关文件

### 需要修改的文件
- `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js` - 私信抓取逻辑
- `packages/master/src/persistence/cache-dao.js` - 添加清理方法

### 相关文档
- [05-DOUYIN-平台实现技术细节.md](./05-DOUYIN-平台实现技术细节.md) - 抖音平台技术细节
- [06-WORKER-爬虫调试指南.md](./06-WORKER-爬虫调试指南.md) - 爬虫调试方法

---

## 优先级

**紧急程度**: 🔴 高
**影响范围**: 🔴 大（核心功能）
**修复难度**: 🟡 中等

**建议**: 优先修复，尽快实施方案 1（虚拟列表滚动）

---

## 补充说明

### 为什么会出现"李艳（售诚护理服务）"？

可能的原因：
1. **历史数据**: 这是之前抓取的会话，后来被用户删除了
2. **缓存问题**: Master 内存中保留了旧数据，未及时清理
3. **数据同步问题**: Worker 同步数据时没有标记"已删除"状态

### 如何避免类似问题？

1. **实时同步**: Worker 抓取时应该获取完整的会话列表，而不是增量更新
2. **数据校验**: 对比抓取的数据与现有数据，删除不存在的会话
3. **清理机制**: 定期清理 N 天前的历史会话

---

**报告生成时间**: 2025-11-03 13:50
**报告人**: Claude Code
**版本**: 1.0
