# Playwright 数据目录隔离说明

## ✅ 实施状态

**状态**: 已完成
**实施日期**: 2025-10-12
**修改文件**: `packages/worker/src/index.js` (1 行)
**测试状态**: 全部通过 (4/4)

---

## 问题分析

### 当前实现的问题

在当前的实现中,所有 Worker 实例共享同一个 Playwright 数据目录:

```javascript
// packages/worker/src/index.js (第69-72行)
browserManager = new BrowserManager(WORKER_ID, {
  headless: process.env.HEADLESS !== 'false',
  dataDir: './data/browser',  // ⚠️ 所有 Worker 共享同一目录!
});
```

**这会导致以下问题:**

1. **Storage State 文件冲突**
   - 多个 Worker 可能同时处理同一个 `accountId`
   - 文件路径: `./data/browser/{accountId}_state.json`
   - 结果: 并发读写同一文件造成数据损坏

2. **浏览器缓存冲突**
   - 虽然使用的是 `BrowserContext` (非持久化上下文)
   - 但 storage state 文件仍然会冲突

3. **文件系统竞争**
   - 多个进程同时写入同一目录
   - 可能导致文件锁定或权限问题

---

## 当前的隔离机制

### ✅ 已经隔离的部分

1. **进程级别隔离**
   ```
   Worker进程1 (PID: 11001)  ←→  独立的 Node.js 进程
   Worker进程2 (PID: 11002)  ←→  独立的 Node.js 进程
   Worker进程3 (PID: 11003)  ←→  独立的 Node.js 进程
   ```

2. **浏览器实例隔离**
   ```javascript
   // 每个 Worker 有独立的浏览器实例
   Worker1: browserManager.browser (chromium 实例 1)
   Worker2: browserManager.browser (chromium 实例 2)
   Worker3: browserManager.browser (chromium 实例 3)
   ```

3. **BrowserContext 隔离**
   ```javascript
   // 每个 accountId 在每个 Worker 内有独立的上下文
   Worker1: contexts.get('account-123')  // Context A
   Worker2: contexts.get('account-456')  // Context B
   Worker3: contexts.get('account-123')  // Context C (与 A 冲突!)
   ```

### ❌ 未隔离的部分

**Storage State 文件存储路径**
```javascript
// packages/worker/src/browser/browser-manager.js (第222-224行)
getStorageStatePath(accountId) {
  // ⚠️ 所有 Worker 共享同一路径!
  return path.join(this.config.dataDir, `${accountId}_state.json`);
}
```

**问题场景:**
```
时间 T1: Worker-1 处理 account-123, 写入 ./data/browser/account-123_state.json
时间 T2: Worker-2 处理 account-123, 读取 ./data/browser/account-123_state.json (冲突!)
时间 T3: Worker-1 更新 ./data/browser/account-123_state.json (覆盖!)
```

---

## 解决方案

### 方案 1: 基于 Worker ID 隔离目录 (推荐)

**优点:**
- 简单直接
- 完全隔离
- 易于调试和清理

**实现:**

修改 `packages/worker/src/index.js`:

```javascript
// 当前代码 (第69-72行)
browserManager = new BrowserManager(WORKER_ID, {
  headless: process.env.HEADLESS !== 'false',
  dataDir: './data/browser',  // ❌ 共享目录
});

// 修改后 (推荐)
browserManager = new BrowserManager(WORKER_ID, {
  headless: process.env.HEADLESS !== 'false',
  dataDir: `./data/browser/${WORKER_ID}`,  // ✅ Worker 专属目录
});
```

**目录结构:**
```
data/
└── browser/
    ├── worker-12345678/          # Worker 1 的数据
    │   ├── account-123_state.json
    │   └── account-456_state.json
    ├── worker-87654321/          # Worker 2 的数据
    │   ├── account-789_state.json
    │   └── account-999_state.json
    └── worker-abcdefgh/          # Worker 3 的数据
        ├── account-111_state.json
        └── account-222_state.json
```

**优点:**
- ✅ 完全隔离,无冲突风险
- ✅ 可以同时处理相同 accountId (在不同 Worker)
- ✅ 清理简单 (删除整个 Worker 目录)
- ✅ 调试方便 (按 Worker ID 查找)

**缺点:**
- 同一 account 在不同 Worker 上有多份 storage state
- 占用更多磁盘空间 (通常可忽略,每个 state 文件 < 100KB)

---

### 方案 2: 基于 Account ID 分片 + 文件锁

**优点:**
- Storage state 共享 (同一账号只有一份)
- 磁盘占用最小

**实现:**

需要添加文件锁机制:

```javascript
// packages/worker/src/browser/browser-manager.js

const lockfile = require('proper-lockfile');

async saveStorageState(accountId) {
  const storageStatePath = this.getStorageStatePath(accountId);

  // 获取文件锁
  let release;
  try {
    release = await lockfile.lock(storageStatePath, {
      retries: {
        retries: 5,
        minTimeout: 100,
        maxTimeout: 1000,
      },
    });

    // 保存 state
    const context = this.contexts.get(accountId);
    await context.storageState({ path: storageStatePath });

  } finally {
    // 释放锁
    if (release) await release();
  }
}
```

**缺点:**
- ❌ 实现复杂
- ❌ 需要额外依赖 (proper-lockfile)
- ❌ 文件锁在 Windows 上可能不可靠
- ❌ 多个 Worker 竞争同一账号的 state
- ❌ 调试困难

---

### 方案 3: 混合方案 (Worker ID + Account ID)

**结合方案 1 和 2 的优点:**

```javascript
getStorageStatePath(accountId) {
  // 路径格式: ./data/browser/{workerId}/{accountId}_state.json
  return path.join(
    this.config.dataDir,
    this.workerId,
    `${accountId}_state.json`
  );
}
```

**目录结构:**
```
data/
└── browser/
    ├── worker-1/
    │   ├── account-123_state.json
    │   └── account-456_state.json
    └── worker-2/
        ├── account-789_state.json
        └── account-123_state.json  # 同一账号在不同 Worker 有独立 state
```

---

## 推荐方案

**✅ 推荐使用方案 1: 基于 Worker ID 隔离目录**

### 理由:

1. **简单可靠**: 无需文件锁,无竞争条件
2. **完全隔离**: 不同 Worker 完全独立
3. **易于维护**: 清晰的目录结构
4. **性能最优**: 无锁等待

### 实施步骤:

**步骤 1: 修改 Worker 初始化**

```javascript
// packages/worker/src/index.js (第69-72行)
browserManager = new BrowserManager(WORKER_ID, {
  headless: process.env.HEADLESS !== 'false',
  dataDir: `./data/browser/${WORKER_ID}`,  // 使用 Worker 专属目录
});
```

**步骤 2: 无需修改 BrowserManager**

`BrowserManager` 无需任何修改,因为:
- 它已经接受 `dataDir` 配置参数
- `ensureDataDir()` 会自动创建目录
- 所有路径都基于 `this.config.dataDir`

**步骤 3: 更新文档**

在系统使用指南中添加说明:
- 每个 Worker 有独立的数据目录
- Storage state 按 Worker 隔离
- 清理数据时删除对应 Worker 目录

---

## 代码改动

### 需要修改的文件

**1. packages/worker/src/index.js**

```diff
  // 4. 初始化浏览器管理器
  browserManager = new BrowserManager(WORKER_ID, {
    headless: process.env.HEADLESS !== 'false', // 默认 headless
-   dataDir: './data/browser',
+   dataDir: `./data/browser/${WORKER_ID}`,  // Worker 专属目录
  });
```

### 无需修改的文件

- ✅ `packages/worker/src/browser/browser-manager.js` - 已支持动态 dataDir
- ✅ `packages/worker/src/browser/douyin-login-handler.js` - 无需改动
- ✅ `packages/worker/src/browser/proxy-manager.js` - 无需改动

---

## 验证方法

### 启动多个 Worker 并验证隔离

```bash
# 终端 1: 启动 Worker 1
WORKER_ID=worker-1 npm start

# 终端 2: 启动 Worker 2
WORKER_ID=worker-2 npm start

# 终端 3: 检查目录结构
ls -la data/browser/
# 应该看到:
# drwxr-xr-x  worker-1/
# drwxr-xr-x  worker-2/

ls -la data/browser/worker-1/
# 应该看到各个 account 的 state 文件

ls -la data/browser/worker-2/
# 应该看到各个 account 的 state 文件
```

### 测试同时处理相同账号

```javascript
// Master 端,同时分配 account-123 到两个 Worker
loginHandler.requestLogin('account-123', 'worker-1');
loginHandler.requestLogin('account-123', 'worker-2');

// 验证:
// worker-1 创建: data/browser/worker-1/account-123_state.json
// worker-2 创建: data/browser/worker-2/account-123_state.json
// 两者互不影响
```

---

## 已知限制

### 1. Storage State 不共享

**场景:**
- Worker-1 为 account-123 保存了登录状态
- Worker-2 处理 account-123 时,无法使用 Worker-1 的状态
- Worker-2 需要重新登录

**影响:**
- 同一账号在不同 Worker 上需要分别登录
- 增加了登录次数

**解决方法 (可选优化):**
- 如果需要共享状态,可以将 storage state 保存到 Master 的数据库
- Master 分配登录任务时,下发已保存的 state
- Worker 使用 Master 提供的 state

### 2. 磁盘空间占用

**影响:**
- 每个 Worker 独立存储 storage state
- N 个 Worker × M 个 Account = N×M 个 state 文件
- 每个文件约 50-100KB

**示例:**
- 3 个 Worker × 100 个 Account = 300 个文件
- 总占用: 300 × 75KB ≈ 22.5MB (可忽略)

---

## 当前实现的架构图

### 进程和数据隔离

```
┌────────────────────────────────────────────────────────┐
│                    Master 进程                          │
│                   (PID: 10001)                         │
│                                                        │
│  ┌──────────────────────────────────────────────┐    │
│  │  master.db (SQLite)                          │    │
│  │  - accounts                                  │    │
│  │  - workers                                   │    │
│  │  - login_sessions                            │    │
│  └──────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘
                         │
                         │ Socket.IO
            ┌────────────┼────────────┐
            │            │            │
┌───────────▼──────┐ ┌──▼──────────┐ ┌▼─────────────┐
│  Worker 1        │ │  Worker 2   │ │  Worker 3    │
│  (PID: 11001)    │ │ (PID: 11002)│ │ (PID: 11003) │
│                  │ │             │ │              │
│  BrowserManager  │ │BrowserMgr   │ │BrowserMgr    │
│  ├─ Browser      │ │├─ Browser   │ │├─ Browser    │
│  └─ Contexts     │ │└─ Contexts  │ │└─ Contexts   │
│                  │ │             │ │              │
│  ⚠️ dataDir:     │ │⚠️ dataDir:  │ │⚠️ dataDir:   │
│  ./data/browser  │ │./data/browser│ │./data/browser│
│  (共享! 有冲突!) │ │(共享! 冲突!) │ │(共享! 冲突!) │
└──────────────────┘ └─────────────┘ └──────────────┘
```

### 修改后的架构 (推荐)

```
┌────────────────────────────────────────────────────────┐
│                    Master 进程                          │
│                   (PID: 10001)                         │
└────────────────────────────────────────────────────────┘
                         │
                         │ Socket.IO
            ┌────────────┼────────────┐
            │            │            │
┌───────────▼──────┐ ┌──▼──────────┐ ┌▼─────────────┐
│  Worker 1        │ │  Worker 2   │ │  Worker 3    │
│  (PID: 11001)    │ │ (PID: 11002)│ │ (PID: 11003) │
│                  │ │             │ │              │
│  BrowserManager  │ │BrowserMgr   │ │BrowserMgr    │
│  ├─ Browser      │ │├─ Browser   │ │├─ Browser    │
│  └─ Contexts     │ │└─ Contexts  │ │└─ Contexts   │
│                  │ │             │ │              │
│  ✅ dataDir:     │ │✅ dataDir:  │ │✅ dataDir:   │
│  ./data/browser/ │ │./data/browser/│./data/browser/│
│    worker-1/     │ │  worker-2/  │ │  worker-3/   │
│  (独立! 无冲突!) │ │(独立!)      │ │(独立!)       │
└──────────────────┘ └─────────────┘ └──────────────┘
         │                   │               │
         ▼                   ▼               ▼
┌─────────────────┐ ┌────────────┐ ┌────────────┐
│data/browser/    │ │data/browser/│ │data/browser/│
│  worker-1/      │ │  worker-2/ │ │  worker-3/ │
│  ├─ acc123.json │ │  ├─ acc456 │ │  ├─ acc789 │
│  └─ acc999.json │ │  └─ acc123 │ │  └─ acc111 │
└─────────────────┘ └────────────┘ └────────────┘
     ↑ 独立存储          ↑ 独立          ↑ 独立
```

---

## FAQ

### Q1: 为什么不使用 Playwright 的 userDataDir?

**A:** Playwright 的 `userDataDir` 是持久化浏览器配置目录 (类似 Chrome 的用户配置文件)。

**区别:**
- `userDataDir`: 持久化浏览器进程的配置,包括缓存、插件、书签等
- `BrowserContext`: 临时的隔离环境,可以有独立的 cookies、localStorage
- `storageState`: 保存/恢复 cookies 和 localStorage 的 JSON 文件

**当前使用:**
```javascript
// 我们使用的是 BrowserContext + storageState 模式
const context = await browser.newContext({
  storageState: './data/browser/worker-1/account-123_state.json'
});
```

**如果使用 userDataDir:**
```javascript
// 需要为每个账号启动独立的浏览器进程
const browser = await chromium.launchPersistentContext(
  './data/browser/worker-1/account-123',  // 每个账号独立目录
  { headless: true }
);
```

**不使用 userDataDir 的原因:**
- 资源占用大 (每个账号需要独立浏览器进程)
- 启动慢 (持久化上下文启动比 storageState 慢 3-5 倍)
- 管理复杂 (需要管理多个浏览器进程)

### Q2: 如果 Master 重新分配账号到不同 Worker 怎么办?

**A:** Storage state 需要迁移或重新登录。

**场景:**
```
时间 T1: account-123 分配到 Worker-1
        → state 保存在 data/browser/worker-1/account-123_state.json

时间 T2: Master 重新分配 account-123 到 Worker-2
        → Worker-2 找不到 state,需要重新登录
```

**解决方法:**

**方法 1: 重新登录 (当前实现)**
- Worker-2 检测到没有 state,触发登录流程
- 优点: 简单
- 缺点: 增加登录次数

**方法 2: State 迁移 (未实现,可选优化)**
```javascript
// Master 重新分配时,通知旧 Worker 上传 state
Master → Worker-1: "upload state for account-123"
Worker-1 → Master: { accountId: '123', state: {...} }
Master → Worker-2: "use this state for account-123"
Worker-2: 保存 state 到本地,使用
```

### Q3: 如何清理旧的 storage state?

**A:** 按 Worker 目录清理。

**手动清理:**
```bash
# 清理某个 Worker 的所有 state
rm -rf data/browser/worker-12345678/

# 清理所有已停止 Worker 的 state
# 1. 获取活跃的 Worker ID (从 Master 数据库)
sqlite3 packages/master/data/master.db "SELECT id FROM workers WHERE status='online';"

# 2. 删除不在列表中的目录
ls data/browser/ | grep -v "worker-active-id" | xargs rm -rf
```

**自动清理 (可选优化):**
```javascript
// Master 定期清理离线 Worker 的数据
setInterval(() => {
  const offlineWorkers = db.prepare(
    "SELECT id FROM workers WHERE status='offline' AND last_heartbeat < ?"
  ).all(Date.now() - 7 * 24 * 3600 * 1000);  // 7天前

  for (const worker of offlineWorkers) {
    // 通知文件清理服务
    cleanupWorkerData(worker.id);
  }
}, 24 * 3600 * 1000);  // 每天执行
```

---

## 总结

### 当前状态
- ⚠️ 所有 Worker 共享 `./data/browser` 目录
- ⚠️ Storage state 文件路径冲突风险
- ⚠️ 多个 Worker 处理同一账号会相互覆盖

### 推荐改动
- ✅ 修改 1 行代码: `dataDir: \`./data/browser/${WORKER_ID}\``
- ✅ 实现完全隔离,零冲突
- ✅ 无需修改 BrowserManager

### 影响
- ✅ 不同 Worker 完全独立
- ⚠️ 同一账号在不同 Worker 需要分别登录
- ⚠️ 磁盘占用略微增加 (可忽略)

---

## 实施验证

### 已完成的修改

**1. 代码修改 (packages/worker/src/index.js:71)**

```javascript
// 修改前
dataDir: './data/browser',

// 修改后
dataDir: `./data/browser/${WORKER_ID}`,  // Worker 专属目录,实现数据隔离
```

**2. 自动化测试 (test-data-isolation.js)**

创建了专门的测试脚本验证数据隔离功能:

```bash
node test-data-isolation.js
```

**测试结果:**

✅ **测试 1: 数据目录隔离** - 通过
- 验证每个 Worker 使用独立的数据目录
- 3 个 Worker 产生 3 个不同的目录路径

✅ **测试 2: Storage State 路径隔离** - 通过
- 验证同一账号在不同 Worker 有独立的文件路径
- `account-123` 在 Worker-1 和 Worker-2 中路径不同

✅ **测试 3: 数据目录自动创建** - 通过
- 验证 BrowserManager 自动创建 Worker 专属目录
- 所有目录创建成功

✅ **测试 4: 目录结构验证** - 通过
- 验证目录结构符合预期
- 层级关系正确

**测试摘要:**
- 总测试数: 4
- ✅ 通过: 4
- ❌ 失败: 0

### 实施后的目录结构

```
data/
└── browser/
    ├── worker-{workerId-1}/      # Worker 1 专属目录
    │   ├── account-123_state.json
    │   └── account-456_state.json
    ├── worker-{workerId-2}/      # Worker 2 专属目录
    │   ├── account-789_state.json
    │   └── account-123_state.json  # 同一账号,独立存储
    └── worker-{workerId-3}/      # Worker 3 专属目录
        ├── account-111_state.json
        └── account-222_state.json
```

### 实施影响

**✅ 优势:**
1. 完全消除了多 Worker 间的数据冲突
2. 可以同时处理同一账号而不会相互干扰
3. 调试和清理更加方便
4. 无性能损失

**⚠️ 注意事项:**
1. 同一账号在不同 Worker 需要分别登录
2. 磁盘占用略微增加 (通常可忽略)
3. 清理时需按 Worker ID 清理对应目录

### 后续建议

**可选优化 (未来考虑):**

1. **Storage State 共享机制**
   - 将 storage state 保存到 Master 数据库
   - Worker 从 Master 获取已登录状态
   - 减少重复登录次数

2. **自动清理机制**
   - Master 定期清理离线 Worker 的数据
   - 基于时间戳清理过期数据
   - 节省磁盘空间

3. **数据迁移机制**
   - Worker 重新分配账号时自动迁移 state
   - 避免重复登录

---

**文档版本**: 1.1.0
**创建日期**: 2025-10-12
**最后更新**: 2025-10-12
**维护者**: 开发团队
