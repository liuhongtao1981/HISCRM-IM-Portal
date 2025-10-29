# DataManager 日志验证 - 待完成

**日期**: 2025-10-29
**状态**: 🔄 进行中

---

## 一、目标

验证真实爬虫抓取数据时,DataManager 是否正确更新缓存对象,并且有清晰的日志输出。

---

## 二、当前问题

### 问题 1: DataManager 创建失败 ✅ 已修复

**错误日志** (09:21:29):
```
Failed to initialize DataManager for account acc-98296c87-2e42-447a-9d8b-8be008ddb6e4:
ENOENT: no such file or directory, open 'E:\HISCRM-IM-main\packages\worker\src\logs\datamanager-debug.log'
```

**原因**:
- `platform.js` 的 `createDataManager()` 方法中有调试代码
- 尝试写入 `src/logs/datamanager-debug.log` 文件
- 该目录不存在,导致 DataManager 创建失败

**修复** (已完成):
```javascript
// 修复前 (platform.js:2893-2908)
async createDataManager(accountId) {
  const fs = require('fs');
  const path = require('path');
  fs.appendFileSync(path.join(__dirname, '../../logs/datamanager-debug.log'), ...);  // ❌ 错误
  // ...
}

// 修复后
async createDataManager(accountId) {
  const { DouyinDataManager } = require('./douyin-data-manager');
  logger.info(`Creating DouyinDataManager for account ${accountId}`);

  const dataManager = new DouyinDataManager(accountId, this.dataPusher);
  logger.info(`✅ DouyinDataManager created for account ${accountId}`);

  return dataManager;
}
```

**文件**: [platform.js:2893-2901](../packages/worker/src/platforms/douyin/platform.js#L2893)

---

### 问题 2: 日志路径配置不统一 ⏸️ 待解决

**现状**:
- `createLogger(serviceName, logDir = './logs')` 使用相对路径
- 日志写入到**调用时的当前工作目录**下的 `logs/` 文件夹
- 不同位置调用会产生不同的日志路径

**示例**:
```javascript
// packages/worker/src/platforms/base/account-data-manager.js:30
this.logger = createLogger(`data-manager:${accountId}`);
// 日志路径: <当前目录>/logs/data-manager:acc-xxx.log

// packages/worker/src/platforms/douyin/douyin-data-manager.js:13
this.logger = createLogger(`douyin-data:${accountId}`);
// 日志路径: <当前目录>/logs/douyin-data:acc-xxx.log
```

**潜在问题**:
1. Worker 在 `packages/worker` 目录启动 → 日志写入 `packages/worker/logs/`
2. Master 在 `packages/master` 目录启动 → 日志写入 `packages/master/logs/`
3. 如果从项目根目录启动 → 日志写入 `<root>/logs/` ❌

**建议方案** (待实施):

#### 方案 A: 使用绝对路径

修改 `packages/shared/utils/logger.js`:
```javascript
const path = require('path');

// 获取项目根目录 (假设 shared 在 packages/shared)
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

function createLogger(serviceName, logDir) {
  // 如果未指定 logDir, 根据服务类型自动推断
  if (!logDir) {
    if (serviceName.startsWith('master')) {
      logDir = path.join(PROJECT_ROOT, 'packages/master/logs');
    } else if (serviceName.startsWith('worker') || serviceName.includes('platform') || serviceName.includes('data-manager')) {
      logDir = path.join(PROJECT_ROOT, 'packages/worker/logs');
    } else {
      logDir = path.join(PROJECT_ROOT, 'logs');  // 默认根目录
    }
  }

  // 确保目录存在
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // ...
}
```

#### 方案 B: 使用环境变量

在 `.env` 文件中配置:
```bash
# packages/master/.env
LOG_DIR=/absolute/path/to/logs/master

# packages/worker/.env
LOG_DIR=/absolute/path/to/logs/worker
```

修改 `logger.js`:
```javascript
function createLogger(serviceName, logDir) {
  // 优先使用环境变量
  logDir = logDir || process.env.LOG_DIR || './logs';
  // ...
}
```

#### 方案 C: 在启动时统一配置

在 Worker 和 Master 的入口文件中设置全局日志路径:
```javascript
// packages/worker/src/index.js
const path = require('path');
process.env.LOG_DIR = path.join(__dirname, '../logs');

// packages/master/src/index.js
const path = require('path');
process.env.LOG_DIR = path.join(__dirname, '../logs');
```

**推荐**: 方案 C (最简单,最少改动)

---

## 三、DataManager 现有日志

### 当前日志级别

| 操作 | 日志级别 | 示例 |
|------|---------|------|
| 创建 DataManager | `info` | `Creating DouyinDataManager for account xxx` |
| Upsert 会话 | `debug` | `Upserted conversation: conv_xxx (用户A)` |
| Upsert 消息 | `debug` | `Upserted message: msg_xxx` |
| Upsert 作品 | `debug` | `Upserted content: cont_xxx (视频标题)` |
| Upsert 评论 | `debug` | `Upserted comment: comm_xxx` |
| 批量操作 | `info` | `Batch upserted 105 conversations` |

**文件**:
- [account-data-manager.js:85](../packages/worker/src/platforms/base/account-data-manager.js#L85) - `Upserted conversation`
- [account-data-manager.js:143](../packages/worker/src/platforms/base/account-data-manager.js#L143) - `Upserted message`
- [account-data-manager.js:200](../packages/worker/src/platforms/base/account-data-manager.js#L200) - `Upserted content`
- [account-data-manager.js:241](../packages/worker/src/platforms/base/account-data-manager.js#L241) - `Upserted comment`

### 查看日志的方法

**开发环境** (默认 LOG_LEVEL=debug):
```bash
# 实时查看所有 DataManager 日志
cd packages/worker/logs
tail -f data-manager:*.log douyin-data:*.log

# 过滤关键字
tail -f *.log | grep -E "(DataManager|Upserted|Batch upserted)"
```

**生产环境** (默认 LOG_LEVEL=info):
```bash
# 只会看到批量操作日志
tail -f *.log | grep "Batch upserted"
```

---

## 四、测试脚本

### 已创建的脚本

1. **tests/验证DataManager缓存数据完整性.js** ✅
   - 使用模拟数据测试
   - 验证数据关系完整性
   - 定时输出缓存状态

2. **tests/真实爬虫数据完整性测试.js** ✅
   - 触发真实爬虫
   - 监控 DataManager 更新
   - 验证真实数据关系

3. **tests/监控Worker日志-DataManager更新.js** ✅
   - 实时监控 Worker 日志
   - 过滤 DataManager 相关日志
   - 统计监控状态

### 待执行的测试

由于 Worker 需要重启才能加载修复后的代码,需要执行以下步骤:

#### Step 1: 重启 Worker

```bash
# 停止 Worker (如果在运行)
pm2 stop hiscrm-worker
# 或: Ctrl+C 停止终端中的 Worker

# 启动 Worker
cd packages/worker
npm start

# 或使用 PM2
pm2 start packages/worker/src/index.js --name hiscrm-worker
```

#### Step 2: 启动日志监控

```bash
# 在新终端窗口
cd e:\HISCRM-IM-main
node tests/监控Worker日志-DataManager更新.js
```

#### Step 3: 等待爬虫自动执行

Worker 会按照配置的间隔自动执行爬虫(通常 60-300 秒),日志监控会实时显示:

**预期输出**:
```
✅ [platform-base] Auto-creating DataManager for account acc-xxx
✅ [douyin-platform] Creating DouyinDataManager for account acc-xxx
✅ [douyin-platform] ✅ DouyinDataManager created for account acc-xxx
🔍 [douyin-data:acc-xxx] Upserted conversation: conv_xxx (用户A)
🔍 [douyin-data:acc-xxx] Upserted conversation: conv_xxx (用户B)
...
✅ [douyin-data:acc-xxx] Batch upserted 105 conversations
🔍 [douyin-data:acc-xxx] Upserted message: msg_xxx
🔍 [douyin-data:acc-xxx] Upserted message: msg_xxx
...
✅ [douyin-data:acc-xxx] Batch upserted 33 messages
```

#### Step 4: 手动触发爬虫 (可选)

如果不想等待自动执行,可以手动触发:

```bash
# 在新终端窗口
cd e:\HISCRM-IM-main
node tests/真实爬虫数据完整性测试.js
```

**注意**: 需要账户浏览器已登录且运行中。

---

## 五、验证清单

### ✅ 已完成

- [x] 删除有问题的文件系统调试代码
- [x] 修复 DataManager 创建失败问题
- [x] 创建日志监控脚本
- [x] 创建真实爬虫测试脚本
- [x] 文档记录问题和解决方案

### ⏸️ 待完成

- [ ] 重启 Worker 加载修复后的代码
- [ ] 启动日志监控脚本
- [ ] 等待/触发真实爬虫执行
- [ ] 验证 DataManager 日志输出正常
- [ ] 验证数据关系完整性
- [ ] (可选) 实施日志路径统一配置方案

---

## 六、日志分析要点

### 关键日志检查

1. **DataManager 创建**:
   ```
   ✅ 成功: "✅ DouyinDataManager created for account xxx"
   ❌ 失败: "Failed to initialize DataManager" / "Failed to auto-create DataManager"
   ```

2. **数据 Upsert 操作**:
   ```
   🔍 DEBUG级别: "Upserted conversation: conv_xxx (用户名)"
   🔍 DEBUG级别: "Upserted message: msg_xxx"
   ✅ INFO级别: "Batch upserted N conversations/messages/contents/comments"
   ```

3. **爬虫集成**:
   ```
   ✅ "✅ [crawlDirectMessages] DataManager 可用，使用统一数据管理架构"
   ✅ "✅ [crawlComments] DataManager 可用，使用统一数据管理架构"
   ⚠️  "⚠️  [crawlXxx] DataManager 创建失败，使用旧数据收集逻辑"
   ```

### 验证数据完整性

执行测试脚本后,检查输出:
```
🔗 会话 ↔ 消息:
   会话 100001 (用户A): 2 条消息
   会话 100002 (用户B): 1 条消息

🔗 作品 ↔ 评论:
   作品 300001 (视频标题): 3 条评论

✅ 所有消息都有对应会话
✅ 所有评论都有对应作品
🎉 数据关系完整性验证通过！
```

---

## 七、后续优化建议

1. **增强日志输出** (可选):
   - 在 `upsertMessage()` 中输出消息方向 (发送/接收)
   - 在 `upsertComment()` 中输出评论类型 (一级/回复)
   - 添加数据来源标识 (API/DOM/Fiber)

2. **性能监控** (可选):
   - 记录每次 upsert 操作的耗时
   - 记录批量操作的处理速度
   - 定期输出 DataManager 内存占用

3. **错误处理增强** (可选):
   - 捕获并记录映射失败的原始数据
   - 添加数据验证失败的详细日志
   - 统计并报告数据质量问题

---

## 八、相关文档

- [Phase3-DataManager数据关系完整性验证.md](./Phase3-DataManager数据关系完整性验证.md)
- [本地端数据抓取完整总结.md](./本地端数据抓取完整总结.md)
- [Phase3-DataManager懒加载重构总结.md](./Phase3-DataManager懒加载重构总结.md)

---

**下一步**: 重启 Worker 并验证修复效果
