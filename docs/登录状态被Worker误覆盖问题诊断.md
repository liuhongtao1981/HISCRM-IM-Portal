# 登录状态被 Worker 误覆盖问题诊断报告

## 问题现象

用户登录成功后，爬虫任务没有执行，Worker 日志持续显示错误：
```
Account missing platform_user_id - please login first to obtain douyin_id
```

## 诊断过程

### 1. 初步检查

运行诊断脚本 `tests/诊断登录检测问题.js` 发现：

| 项目 | 状态 | 数值/结果 |
|------|------|----------|
| 数据库 platform_user_id | ✅ 存在 | 1864722759 |
| 数据库 login_status | ❌ 错误 | `not_logged_in` |
| Storage 文件 | ✅ 存在 | 56 个 cookies |
| 关键 Cookies | ✅ 有效 | sessionid, sid_guard, uid_tt 等 |
| Cookies 有效期 | ✅ 未过期 | 到 2025/10/31 |
| UserDataDir | ✅ 存在 | 完整的浏览器数据目录 |

**核心矛盾**：
- ✅ 数据库有 `platform_user_id: 1864722759`
- ❌ 数据库 `login_status: not_logged_in`
- ✅ Storage 有有效的登录 Cookies
- ❌ Worker 报错"missing platform_user_id"

### 2. 追踪登录流程

#### 时间线：

```
18:38:43 - 用户点击登录
18:39:07 - 登录成功，扫码确认
         ↓
         Master 执行 handleLoginSuccess()
         ↓
         UPDATE accounts SET
           login_status = 'logged_in',      ✅
           platform_user_id = '1864722759', ✅
           last_login_time = 1730375947,
           cookies_valid_until = 1730980747
         ↓
         Master 发送 login:success 事件给 Admin UI
         ↓
18:39:08 - Worker 开始定期检测登录状态（每分钟一次）
         ↓
         Worker 调用 checkLoginStatus()
         ↓
         检测结果：NOT logged in ❌
         （原因：Worker 缓存的配置没有 platform_user_id）
         ↓
         Worker 调用 updateAccountStatus()
         ↓
         UPDATE accounts SET
           login_status = 'not_logged_in' ❌
         ↓
         数据库登录状态被覆盖！
```

### 3. 根本原因

#### 问题代码位置：`packages/worker/src/handlers/monitor-task.js:179`

```javascript
// 检测到未登录
if (!loginStatus || !loginStatus.isLoggedIn) {
  logger.warn(`Account ${this.account.id} is NOT logged in, pausing monitoring...`);

  // ⚠️ 问题代码：直接把数据库的 login_status 改为 not_logged_in
  this.accountStatusReporter.updateAccountStatus(this.account.id, {
    worker_status: 'offline',
    login_status: 'not_logged_in'  // ❌ 覆盖了 Master 刚刚设置的 logged_in
  });

  return;
}
```

#### 为什么 Worker 检测到未登录？

**配置未及时更新问题**：

1. Worker 启动时从 Master 获取账户配置并缓存在内存中
2. 用户登录成功后，Master 更新数据库的 `platform_user_id`
3. **但 Worker 内存中的配置没有更新**（仍然是没有 platform_user_id 的旧配置）
4. Worker 使用旧配置检测登录状态，检测逻辑如下：

```javascript
// packages/worker/src/handlers/monitor-task.js:162
if (!this.account.platform_user_id) {
  logger.warn(`Account ${this.account.id} missing platform_user_id - please login first`);

  // 记录错误并更新状态为未登录
  this.accountStatusReporter.updateAccountStatus(this.account.id, {
    login_status: 'not_logged_in'
  });
}
```

5. Worker 判断"没有 platform_user_id = 未登录"，于是把数据库改为 `not_logged_in`

#### 恶性循环

```
┌─────────────────────────────────────────────────┐
│ 1. Master 登录成功，更新数据库为 logged_in      │
└─────────────┬───────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────┐
│ 2. Worker 使用旧配置（无 platform_user_id）    │
└─────────────┬───────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────┐
│ 3. Worker 检测：无 platform_user_id = 未登录   │
└─────────────┬───────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────┐
│ 4. Worker 更新数据库为 not_logged_in ❌        │
└─────────────┬───────────────────────────────────┘
              │
              ↓ 重启 Worker
              │
┌─────────────────────────────────────────────────┐
│ 5. Worker 重启，从数据库加载 not_logged_in     │
└─────────────┬───────────────────────────────────┘
              │
              └──────> 返回步骤 3（循环）
```

## 解决方案

### 方案 1：配置热更新机制（推荐）✅

**已在 [爬虫任务配置热更新机制实现报告.md](./爬虫任务配置热更新机制实现报告.md) 中实现**

#### 核心思路：
- Master 登录成功后，立即通知 Worker："账户配置已更新"
- Worker 接收通知，重新从 Master 获取最新配置
- Worker 使用新配置（含 platform_user_id），检测通过

#### 流程图：
```
1. 用户登录成功
   ↓
2. Master 更新数据库：platform_user_id = 1864722759
   ↓
3. Master 发送消息：MASTER_ACCOUNT_CONFIG_UPDATE
   ↓
4. Worker 接收通知
   ↓
5. Worker 调用 reloadAccountConfig()
   ↓
6. Worker 获取最新配置（包含 platform_user_id）
   ↓
7. Worker 更新内存缓存和 TaskRunner
   ↓
8. Worker 下次检测使用新配置，检测通过 ✅
   ↓
9. 爬虫任务正常执行 ✅
```

### 方案 2：修复 Worker 的状态更新逻辑（补充方案）

#### 问题：
Worker 不应该在检测到"本地配置缺少 platform_user_id"时，就盲目地把数据库的 `login_status` 改为 `not_logged_in`。

#### 改进思路：
1. Worker 检测到本地配置缺少 platform_user_id
2. **先查询数据库**，看数据库是否有 platform_user_id
3. 如果数据库有，说明是配置未同步，应该重新加载配置
4. 如果数据库也没有，才更新为 `not_logged_in`

#### 改进代码（`packages/worker/src/handlers/monitor-task.js`）：

```javascript
// 检查 platform_user_id
if (!this.account.platform_user_id) {
  logger.warn(`Account ${this.account.id} missing platform_user_id in local config`);

  // ⭐ 改进：先查询数据库，看是否是配置未同步
  try {
    // 通过 Master 查询账户的最新配置
    const updatedAccount = await this.reloadAccountConfig(this.account.id);

    if (updatedAccount && updatedAccount.platform_user_id) {
      logger.info(`✅ Found platform_user_id in database, config reloaded: ${updatedAccount.platform_user_id}`);
      this.account = updatedAccount; // 更新本地配置
      // 继续执行监控任务
    } else {
      // 数据库也没有，确实未登录
      logger.warn(`Account ${this.account.id} truly not logged in - please login first`);
      this.accountStatusReporter.updateAccountStatus(this.account.id, {
        worker_status: 'offline',
        login_status: 'not_logged_in'
      });
      return;
    }
  } catch (error) {
    logger.error(`Failed to reload account config:`, error);
    return;
  }
}
```

### 方案 3：Master 端验证（防御性措施）

#### 问题：
Master 不应该允许 Worker 随意覆盖 `login_status`，特别是当数据库明确记录了登录成功时。

#### 改进思路：
在 `packages/master/src/worker_manager/account-status-updater.js` 中添加验证逻辑：

```javascript
updateAccountStatus(accountId, updates) {
  // ⭐ 防御性检查：如果 Worker 想改为 not_logged_in，先验证数据库
  if (updates.login_status === 'not_logged_in') {
    const account = this.db.prepare('SELECT platform_user_id, login_status FROM accounts WHERE id = ?').get(accountId);

    // 如果数据库有 platform_user_id 且状态为 logged_in，拒绝 Worker 的更新
    if (account && account.platform_user_id && account.login_status === 'logged_in') {
      logger.warn(`Rejected Worker's attempt to set login_status=not_logged_in for ${accountId} - database shows logged_in with platform_user_id`);
      delete updates.login_status; // 移除这个更新

      // 反而通知 Worker 重新加载配置
      this.notifyWorkerToReloadConfig(accountId);
    }
  }

  // 继续执行更新
  // ...
}
```

## 临时修复

在配置热更新机制测试前，先手动修复数据库：

```sql
UPDATE accounts
SET login_status = 'logged_in'
WHERE id = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  AND platform_user_id IS NOT NULL;
```

## 测试计划

1. **修复数据库状态**
   ```bash
   node tests/修复登录状态.js
   ```

2. **重启 Worker**
   ```bash
   # 结束 Worker 进程
   # 重新启动 Worker
   ```

3. **观察 Worker 行为**
   - Worker 应该加载 `login_status: logged_in` 的配置
   - Worker 检测应该通过（因为有 platform_user_id）
   - 爬虫任务应该正常执行

4. **测试配置热更新**
   - 手动把数据库改为 `not_logged_in`
   - 再次登录
   - 观察 Master 是否发送 MASTER_ACCOUNT_CONFIG_UPDATE
   - 观察 Worker 是否接收并重新加载配置
   - 验证爬虫任务是否自动恢复

## 总结

### 问题本质

**配置不一致导致的恶性循环**：

1. Master 在数据库中更新了账户配置（platform_user_id, login_status）
2. Worker 内存中的配置没有同步更新
3. Worker 使用旧配置检测登录状态，得出"未登录"的错误结论
4. Worker 把数据库的 login_status 改回 not_logged_in
5. 形成恶性循环

### 根本解决

**实现配置热更新机制** ✅

- Master → Worker: MASTER_ACCOUNT_CONFIG_UPDATE 消息
- Worker 接收后立即重新加载配置
- 打破配置不一致的恶性循环

### 防御性措施

1. **Worker 端**：检测到配置缺失时，先尝试重新加载，而不是直接判定为未登录
2. **Master 端**：拒绝 Worker 的不合理状态更新，保护数据库的正确状态
3. **监控告警**：当检测到 platform_user_id 存在但 login_status 为 not_logged_in 时，发出告警

---

**诊断时间**：2025-10-24
**诊断人**：Claude Code
**文档版本**：1.0
