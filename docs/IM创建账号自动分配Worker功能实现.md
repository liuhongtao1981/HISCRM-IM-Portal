# IM创建账号自动分配Worker功能实现

## 问题描述

用户反馈：通过 IM 客户端创建账号后，**Worker 没有收到任务，账号没有开始工作**。

与 web-admin 的 HTTP API 创建账号对比：
- ✅ **web-admin**：创建账号后自动分配给 Worker，Worker 立即开始监控
- ❌ **IM 客户端**：创建账号后只存入数据库，没有分配给 Worker

## 根本原因

IM 的 `handleCreateAccount` 方法缺少**账号分配逻辑**：

```javascript
// ❌ 修改前：只创建账号，不分配 Worker
const newAccount = this.accountDAO.create(account);
socket.emit('monitor:create_account_result', {
    success: true,
    data: newAccount.toSafeJSON()
});
```

而 web-admin 的 HTTP API (`packages/master/src/api/routes/accounts.js:140-148`) 会调用：

```javascript
// ✅ web-admin：创建账号后自动分配
if (accountAssigner) {
    if (assigned_worker_id) {
        accountAssigner.assignToSpecificWorker(createdAccount, assigned_worker_id);
    } else {
        accountAssigner.assignNewAccount(createdAccount);
    }
}
```

## 解决方案

### 1. 添加 `AccountAssigner` 注入机制

**文件**：[packages/master/src/communication/im-websocket-server.js](packages/master/src/communication/im-websocket-server.js#L11-L42)

在 `IMWebSocketServer` 类中添加：

```javascript
class IMWebSocketServer {
    constructor(io, dataStore, cacheDAO = null, accountDAO = null, workerRegistry = null, replyDAO = null) {
        // ...
        this.accountAssigner = null;  // ✅ 新增: 账号分配器（延迟注入）
        // ...
    }

    /**
     * 设置账号分配器（延迟注入）
     */
    setAccountAssigner(accountAssigner) {
        this.accountAssigner = accountAssigner;
        logger.info('✅ AccountAssigner injected into IM WebSocket Server');
    }
}
```

### 2. 在 `index.js` 中注入 `AccountAssigner`

**文件**：[packages/master/src/index.js](packages/master/src/index.js#L843-L845)

```javascript
// 10. 初始化账户分配器（传入 DataStore 用于删除账号时清理内存）
accountAssigner = new AccountAssigner(db, workerRegistry, taskScheduler, dataStore);
logger.info('Account assigner initialized');

// ⭐ 将 AccountAssigner 注入到 IM WebSocket Server（用于账号创建后自动分配 Worker）
imWebSocketServer.setAccountAssigner(accountAssigner);
logger.info('IM WebSocket Server connected to AccountAssigner for account assignment');
```

### 3. 在 `handleCreateAccount` 中添加分配逻辑

**文件**：[packages/master/src/communication/im-websocket-server.js](packages/master/src/communication/im-websocket-server.js#L1983-L1996)

```javascript
// 调用 DAO 的 create 方法
const newAccount = this.accountDAO.create(account);

logger.info('[IM WS] Account created successfully:', newAccount.id);

// ✅ 触发账户分配逻辑（和 web-admin HTTP API 一样）
if (this.accountAssigner) {
    // 如果手动指定了 Worker，直接分配并发送任务
    if (assigned_worker_id) {
        this.accountAssigner.assignToSpecificWorker(newAccount, assigned_worker_id);
        logger.info(`[IM WS] Account ${newAccount.id} assigned to worker ${assigned_worker_id}`);
    } else {
        // 自动分配到负载最低的 Worker
        this.accountAssigner.assignNewAccount(newAccount);
        logger.info(`[IM WS] Account ${newAccount.id} auto-assigned to worker`);
    }
} else {
    logger.warn('[IM WS] AccountAssigner not available, account created but not assigned to worker');
}

// 通知客户端创建成功
socket.emit('monitor:create_account_result', {
    success: true,
    data: newAccount.toSafeJSON()
});
```

## 修改文件清单

| 文件 | 修改内容 | 行号 |
|------|---------|------|
| [im-websocket-server.js](packages/master/src/communication/im-websocket-server.js) | 添加 `accountAssigner` 属性和 `setAccountAssigner()` 方法 | 19, 35-42 |
| [im-websocket-server.js](packages/master/src/communication/im-websocket-server.js) | 在 `handleCreateAccount` 中添加账号分配逻辑 | 1983-1996 |
| [index.js](packages/master/src/index.js) | 注入 `accountAssigner` 到 `imWebSocketServer` | 843-845 |

## 工作流程对比

### 修改前（只创建，不分配）

```
IM 客户端                          Master                      Worker
   |                                  |                           |
   |-- monitor:create_account -->    |                           |
   |                                  |                           |
   |                          创建 Account 对象                   |
   |                          调用 accountDAO.create()            |
   |                          ✅ 存入数据库                       |
   |                                  |                           |
   |<-- monitor:create_account_result |                           |
   |    (创建成功)                     |                           |
   |                                  |                           |
   |                                  |                           |
   |                                  ❌ Worker 没有收到任务       |
   |                                  ❌ 账号不工作               |
```

### 修改后（创建后自动分配）

```
IM 客户端                          Master                      Worker
   |                                  |                           |
   |-- monitor:create_account -->    |                           |
   |                                  |                           |
   |                          创建 Account 对象                   |
   |                          调用 accountDAO.create()            |
   |                          ✅ 存入数据库                       |
   |                                  |                           |
   |                          ✅ 调用 accountAssigner             |
   |                          ✅ 分配到负载最低的 Worker           |
   |                                  |                           |
   |                                  |-- MASTER_TASK_ASSIGN -->  |
   |                                  |   (发送账号任务)           |
   |                                  |                           |
   |<-- monitor:create_account_result |                           ✅ Worker 收到任务
   |    (创建成功)                     |                           ✅ 开始监控账号
   |                                  |                           ✅ 启动爬虫
```

## 关键代码：AccountAssigner.assignNewAccount()

**文件**：[packages/master/src/worker_manager/account-assigner.js](packages/master/src/worker_manager/account-assigner.js#L23-L79)

```javascript
assignNewAccount(account) {
    try {
        logger.info(`Auto-assigning new account ${account.id} (${account.account_name})`);

        // 如果账户已经指定了 Worker，跳过自动分配
        if (account.assigned_worker_id) {
            return { worker_id: account.assigned_worker_id, success: true };
        }

        // 获取在线Worker
        const onlineWorkers = this.workerRegistry.getOnlineWorkers();
        if (onlineWorkers.length === 0) {
            logger.warn(`No online workers available to assign account ${account.id}`);
            return null;
        }

        // 选择负载最低的Worker (轮询策略)
        onlineWorkers.sort((a, b) => a.assigned_accounts - b.assigned_accounts);
        const selectedWorker = onlineWorkers[0];

        // 更新账户的assigned_worker_id
        const now = Math.floor(Date.now() / 1000);
        this.db
            .prepare('UPDATE accounts SET assigned_worker_id = ?, updated_at = ? WHERE id = ?')
            .run(selectedWorker.id, now, account.id);

        // 更新Worker的assigned_accounts计数
        const newCount = selectedWorker.assigned_accounts + 1;
        this.db
            .prepare('UPDATE workers SET assigned_accounts = ? WHERE id = ?')
            .run(newCount, selectedWorker.id);

        // ✅ 关键：发送任务分配消息给Worker
        this.taskScheduler.sendTaskAssignments(selectedWorker.id, [account]);

        logger.info(`Account ${account.id} auto-assigned to worker ${selectedWorker.id} successfully`);

        return { worker_id: selectedWorker.id, success: true };
    } catch (error) {
        logger.error(`Failed to assign account ${account.id}:`, error);
        return null;
    }
}
```

## 验证日志

启动 Master 后，应该看到以下日志：

```
✅ AccountAssigner injected into IM WebSocket Server
IM WebSocket Server connected to AccountAssigner for account assignment
```

创建账号时，应该看到：

```
[IM WS] Account created successfully: acc-xxxxx
[IM WS] Account acc-xxxxx auto-assigned to worker
[account-assigner] Auto-assigning new account acc-xxxxx (账号名)
[account-assigner] Selected worker worker1 (load: 2)
[account-assigner] Account acc-xxxxx auto-assigned to worker worker1 successfully
[task-scheduler] Sending task assignment to worker worker1: 1 accounts
```

## 测试步骤

1. **启动 Master**：
   ```bash
   cd packages/master
   npm start
   ```

2. **启动 IM 客户端**

3. **创建新账号**：
   - 点击左下角"添加账号"按钮
   - 填写表单：
     - 平台：抖音
     - 账户名称：test-account
     - 监控间隔：30
   - 点击"创建"

4. **验证 Worker 收到任务**：
   - 查看 Master 日志，确认账号已分配
   - 查看 Worker 日志，确认收到 `MASTER_TASK_ASSIGN` 消息
   - 确认 Worker 开始监控该账号

## 对比总结

| 特性 | 修改前 | 修改后 |
|------|-------|--------|
| 创建账号 | ✅ | ✅ |
| 存入数据库 | ✅ | ✅ |
| 分配给 Worker | ❌ | ✅ |
| Worker 收到任务 | ❌ | ✅ |
| 账号开始工作 | ❌ | ✅ |
| 与 web-admin 一致 | ❌ | ✅ |

## 相关文档

- [IM添加账号功能修复报告 - AccountDAO方法名](./IM添加账号功能修复报告-AccountDAO方法名.md)
- [IM添加账号WebSocket实现总结](./IM添加账号WebSocket实现总结.md)
- [账户分配器实现](../packages/master/src/worker_manager/account-assigner.js)
- [web-admin 账户API](../packages/master/src/api/routes/accounts.js)

## 总结

通过将 `AccountAssigner` 注入到 `IMWebSocketServer` 并在 `handleCreateAccount` 中调用分配逻辑，**完全实现了和 web-admin 一样的账号创建流程**：

✅ **创建账号 → 自动分配 Worker → Worker 开始工作**

这样 IM 客户端创建账号后，用户无需手动操作，Worker 会自动接收任务并开始监控账号。
