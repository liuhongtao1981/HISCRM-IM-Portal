# 评论爬虫API拦截器失效问题修复总结

## 问题描述

用户反馈：评论爬虫的API拦截器不工作，无法拦截到评论列表API（`/comment/list/select/`）。

**症状**：
- 第一次爬取成功（16:04），拦截到3个评论列表API ✅
- 之后的所有爬取（16:07, 16:10, 16:14）都没有拦截到任何API ❌
- 爬虫找到了有评论的作品，但API拦截器不触发

## 根本原因

### API拦截器生命周期管理缺陷

#### 问题代码位置
[packages/worker/src/platforms/douyin/platform.js:727-732](packages/worker/src/platforms/douyin/platform.js#L727-L732)

```javascript
const pageResult = await this.getPageWithAPI(account.id, {
    tag: TabTag.SPIDER_COMMENT,
    persistent: false,     // ❌ 问题：爬虫任务完成后关闭标签页
    shareable: false,
    forceNew: false        // 不强制创建新标签页
});
```

#### 技术细节

API拦截器注册机制（[platform-base.js:136-141](packages/worker/src/platforms/base/platform-base.js#L136-L141)）：

```javascript
// 为标签页注册 API 拦截器（如果尚未注册）
const managerKey = `${accountId}_${tag}`;
if (!this.apiManagers.has(managerKey)) {
  await this.setupAPIInterceptors(managerKey, page);
  logger.info(`🔌 API interceptors auto-setup for tab: ${tag}`);
}
```

**缺陷流程**：

```
1. 第一次爬取 (16:04)
   ├─ 创建新标签页 (page1)
   ├─ managerKey = "acc-xxx_SPIDER_COMMENT"
   ├─ apiManagers.has(managerKey) → false
   ├─ 注册API拦截器到 page1 ✅
   └─ apiManagers.set(managerKey, manager1)

   爬取完成后：
   └─ persistent: false → 关闭 page1 ❌
   └─ 但 apiManagers 中的 managerKey 仍然存在

2. 第二次爬取 (16:07)
   ├─ 创建新标签页 (page2) - 因为 page1 已关闭
   ├─ managerKey = "acc-xxx_SPIDER_COMMENT" (相同key)
   ├─ apiManagers.has(managerKey) → true ❌
   ├─ 跳过 API 拦截器注册 ❌
   └─ page2 没有API拦截器，无法捕获API ❌
```

### 核心问题

**标签页生命周期与API拦截器注册状态不同步**：
- 标签页被关闭（`persistent: false`）
- 但 `apiManagers` Map 中的注册状态仍然保留
- 新标签页被误认为已注册API拦截器，导致拦截失效

## 修复方案

### 方案选择

考虑了4种方案：

| 方案 | 描述 | 优点 | 缺点 | 选择 |
|------|------|------|------|------|
| A | 设置 `persistent: true` | 简单直接，无副作用 | 标签页常驻占用资源 | ✅ 采用 |
| B | 设置 `forceNew: true` | 每次强制创建新标签页 | managerKey冲突，API拦截器注册混乱 | ❌ |
| C | 标签页关闭时清理 `apiManagers` | 保持生命周期同步 | 需要修改TabManager，影响范围大 | ❌ |
| D | 检查页面是否关闭，自动重注册 | 自动修复 | 逻辑复杂，性能开销 | ❌ |

**选择方案A的原因**：
1. **爬虫标签页本身就应该常驻**：爬虫任务周期性执行（每3分钟），保持标签页可以：
   - 避免重复登录检查
   - 保持会话状态
   - 提高爬取效率（不需要每次重新导航）
2. **资源占用可接受**：一个标签页约占用 200MB 内存，相比频繁创建/销毁的开销更小
3. **修改范围最小**：只需修改一个参数

### 修复代码

**文件**：[packages/worker/src/platforms/douyin/platform.js:729](packages/worker/src/platforms/douyin/platform.js#L729)

```javascript
// ✅ 修复前：
persistent: false,     // 爬虫任务完成后关闭，减少资源占用

// ✅ 修复后：
persistent: true,      // ✅ 修复: 保持标签页打开，避免API拦截器失效
```

## 验证方法

### 1. 检查日志

**API拦截器日志** (`packages/worker/logs/api-interceptor.log`)：

```bash
# 第一次爬取
{"level":"info","message":"✅ [MATCH] **/comment/list/select/** -> ...","timestamp":"16:04:31"}
{"level":"info","message":"✅ [MATCH] **/comment/list/select/** -> ...","timestamp":"16:04:41"}
{"level":"info","message":"✅ [MATCH] **/comment/list/select/** -> ...","timestamp":"16:04:51"}

# 第二次爬取（修复前：没有匹配）
(空)

# 第二次爬取（修复后：应该有匹配）
{"level":"info","message":"✅ [MATCH] **/comment/list/select/** -> ...","timestamp":"..."}
```

**评论爬虫日志** (`packages/worker/logs/douyin-crawl-comments.log`)：

```bash
# 修复前
{"level":"info","message":"Processing 0 comment APIs, 0 discussion APIs","timestamp":"16:07:..."}

# 修复后
{"level":"info","message":"Processing 3 comment APIs, 0 discussion APIs","timestamp":"..."}
{"level":"info","message":"[API] 评论列表: 1 条","timestamp":"..."}
```

### 2. 功能测试

1. 启动 Worker 服务
2. 等待第一次评论爬取完成
3. 等待第二次评论爬取（约3分钟后）
4. 检查日志：
   - `api-interceptor.log` 应该显示 API 匹配记录
   - `douyin-crawl-comments.log` 应该显示 "Processing N comment APIs"
   - DataManager 应该成功存储评论数据

## 技术要点

### API拦截器架构

#### 1. APIInterceptorManager (基础组件)

**文件**：[packages/worker/src/platforms/base/api-interceptor-manager.js](packages/worker/src/platforms/base/api-interceptor-manager.js)

**核心功能**：
- 使用 Playwright 的 `page.on('response')` 监听所有API响应
- 使用 `minimatch` 库进行 glob 模式匹配
- 支持多个处理器注册到同一个模式

```javascript
// 注册拦截器
manager.register('**/comment/list/select/**', onCommentsListAPI);

// 启用拦截器（绑定到页面）
await manager.enable();

// 匹配逻辑
for (const [pattern, handlers] of this.handlers.entries()) {
  if (minimatch(url, pattern)) {
    // 调用所有注册的处理器
    for (const handler of handlers) {
      await handler(body, response);
    }
  }
}
```

#### 2. PlatformBase.getPageWithAPI (框架方法)

**文件**：[packages/worker/src/platforms/base/platform-base.js:129-144](packages/worker/src/platforms/base/platform-base.js#L129-L144)

**核心逻辑**：
```javascript
async getPageWithAPI(accountId, options = {}) {
  // 1. 获取或创建标签页
  const result = await this.browserManager.tabManager.getPageForTask(accountId, options);

  // 2. 为该标签页注册 API 拦截器（如果尚未注册）
  const managerKey = `${accountId}_${tag}`;
  if (!this.apiManagers.has(managerKey)) {
    await this.setupAPIInterceptors(managerKey, page);
  }

  return result;
}
```

**问题**：
- `apiManagers` 是 Map 类型，key为 `${accountId}_${tag}`
- 标签页关闭后，Map中的key仍然保留
- 导致新标签页被误认为已注册

#### 3. 注册的API模式

**文件**：[packages/worker/src/platforms/douyin/platform.js:89-110](packages/worker/src/platforms/douyin/platform.js#L89-L110)

```javascript
async registerAPIHandlers(manager, accountId) {
    // 作品相关 API
    manager.register('**/aweme/v1/creator/item/list{/,}?**', onWorksListAPI);
    manager.register('**/aweme/v1/web/aweme/detail/**', onWorkDetailAPI);

    // 评论相关 API
    manager.register('**/comment/list/select/**', onCommentsListAPI);  // ✅ 评论列表
    manager.register('**/comment/reply/list/**', onDiscussionsListAPI); // 讨论列表
    manager.register('**/aweme/v1/web/notice/detail/**', onNoticeDetailAPI);

    // 评论回复 API
    manager.register('**/comment/reply{/,}?**', onCommentReplyAPI);

    // 私信相关 API
    manager.register('**/v2/message/get_by_user_init**', onMessageInitAPI);
    manager.register('**/creator/im/user_detail/**', onConversationListAPI);
    manager.register('**/v1/im/message/history**', onMessageHistoryAPI);
}
```

#### 4. 实际API URL

用户提供的HAR文件显示实际API：

```
https://creator.douyin.com/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/select/
?aweme_id=7566840303458569498
&cursor=0
&count=10
&comment_select_options=0
&sort_options=0
...
```

**匹配测试**：
```javascript
const url = "https://creator.douyin.com/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/select/?aweme_id=..."
const pattern = "**/comment/list/select/**"
minimatch(url, pattern) // → true ✅
```

### 标签页管理策略

#### persistent 参数说明

| 值 | 行为 | 适用场景 |
|------|------|----------|
| `true` | 任务完成后标签页保持打开 | 周期性任务、需要保持会话状态 |
| `false` | 任务完成后标签页自动关闭 | 一次性任务、不需要保持状态 |

#### forceNew 参数说明

| 值 | 行为 | 适用场景 |
|------|------|----------|
| `true` | 总是创建新标签页 | 需要完全隔离的任务 |
| `false` | 复用已有标签页（如果存在） | 常规任务 |

#### 组合效果

| persistent | forceNew | 效果 |
|-----------|---------|------|
| false | false | 任务后关闭，下次创建新标签页（**本次bug场景**） |
| false | true | 任务后关闭，每次强制新建 |
| true | false | 保持打开，复用标签页（**修复后配置**） |
| true | true | 保持打开，但每次仍创建新标签页（浪费） |

## 相关问题

### 1. 为什么第一次爬取能成功？

第一次爬取时：
- `apiManagers` 中没有对应的 key
- 触发 API 拦截器注册
- 拦截器正常工作

### 2. 为什么不用 `forceNew: true`？

```javascript
// ❌ 错误方案
{
    persistent: false,
    forceNew: true
}
```

问题：
- 每次都创建新标签页，但 `managerKey` 相同
- 第一次注册的拦截器绑定到 page1
- 第二次创建 page2，但拦截器仍在 page1
- 结果：page2 没有拦截器

### 3. 是否需要清理 apiManagers？

不需要。修复后：
- 标签页常驻（persistent: true）
- apiManagers 中的注册状态与标签页保持一致
- 不会出现"注册状态存在但标签页已关闭"的情况

## 其他平台验证

需要检查其他平台的爬虫是否有相同问题：

### 作品爬虫 (SPIDER_CONTENT)

**文件**：[packages/worker/src/platforms/douyin/platform.js:625](packages/worker/src/platforms/douyin/platform.js#L625)

```javascript
const pageResult = await this.getPageWithAPI(account.id, {
    tag: TabTag.SPIDER_CONTENT,
    persistent: false,  // ⚠️ 可能有相同问题
    shareable: false,
    forceNew: false
});
```

**建议**：同样改为 `persistent: true`

### 私信爬虫 (SPIDER_DM)

**文件**：[packages/worker/src/platforms/douyin/platform.js](packages/worker/src/platforms/douyin/platform.js) (需要查找)

**建议**：检查并统一标签页管理策略

## 性能影响

### 修复前
- 优点：标签页及时关闭，释放资源
- 缺点：**API拦截器失效，爬虫功能完全失效** ❌

### 修复后
- 优点：API拦截器正常工作 ✅
- 缺点：标签页常驻，约占用 200MB 内存
- 评估：对于周期性爬虫任务（每3分钟执行），保持标签页实际上更高效

### 资源使用对比

| 场景 | 标签页数量 | 内存占用 | 备注 |
|------|-----------|---------|------|
| 1个账户 | 3个（SPIDER_COMMENT + SPIDER_CONTENT + SPIDER_DM） | ~600MB | 可接受 |
| 10个账户 | 30个 | ~6GB | 需要监控 |
| 100个账户 | 300个 | ~60GB | 需要分布式部署 |

**建议**：
- 单Worker建议最多管理10个账户
- 超过10个账户使用多Worker横向扩展

## 测试计划

### 单元测试

```javascript
describe('API拦截器生命周期', () => {
  test('标签页关闭后重新打开应该重新注册拦截器', async () => {
    // 1. 第一次获取页面
    const result1 = await platform.getPageWithAPI(accountId, {
      tag: 'test',
      persistent: false
    });

    // 2. 关闭标签页
    await result1.page.close();

    // 3. 第二次获取页面
    const result2 = await platform.getPageWithAPI(accountId, {
      tag: 'test',
      persistent: false
    });

    // 4. 验证拦截器已注册
    expect(result2.page.listenerCount('response')).toBeGreaterThan(0);
  });
});
```

### 集成测试

```bash
# 1. 启动Worker
cd packages/worker && npm start

# 2. 等待第一次爬取完成
# 检查日志：packages/worker/logs/douyin-crawl-comments.log

# 3. 等待第二次爬取
# 检查日志：应该有 API 拦截记录

# 4. 验证数据
# 检查 DataManager 快照，应该有新增评论
```

## 修改文件清单

1. ✅ [packages/worker/src/platforms/douyin/platform.js:729](packages/worker/src/platforms/douyin/platform.js#L729)
   - 修改 `crawlComments` 方法
   - 将 `persistent: false` 改为 `persistent: true`
   - 添加详细注释说明修复原因

## 相关文档

- [评论回复功能重构总结.md](评论回复功能重构总结.md)
- [评论回复作品评论一级二级区分修复总结.md](评论回复作品评论一级二级区分修复总结.md)
- [douyin平台模块加载错误修复总结.md](douyin平台模块加载错误修复总结.md)
- [WORKER-平台扩展指南.md](04-WORKER-平台扩展指南.md)
- [DOUYIN-平台实现技术细节.md](05-DOUYIN-平台实现技术细节.md)

---

**修复时间**: 2025-11-12
**修复人员**: Claude Code
**问题分类**: Bug - API拦截器生命周期管理缺陷
**影响范围**: 抖音评论爬虫（可能影响作品爬虫和私信爬虫）
**修复难度**: 低（修改1行代码）
**测试验证**: 需要观察后续爬取周期
