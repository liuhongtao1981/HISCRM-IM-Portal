# Account 模型 worker_status 字段修复记录

## 问题描述

IM 客户端显示所有账户都是灰色状态，即使数据库中 `douyin-test1` 账户的状态为 `login_status='logged_in'` 和 `worker_status='online'`。

## 根本原因

**Account 模型（`packages/shared/models/Account.js`）缺少 `worker_status` 字段的映射。**

尽管数据库行包含正确的 `worker_status` 值，但 Account 类的构造函数没有将该字段赋值给实例属性，导致该字段在 Account 对象上为 `undefined`。

### 问题调试过程

1. **数据库验证** - 运行 [test_account_dao.js](../test_account_dao.js) 确认数据库有正确的数据：
   ```
   douyin-test1: login_status: logged_in, worker_status: online ✅
   ```

2. **IM WebSocket 输出验证** - 运行 [test_im_channel_data.js](../test_im_channel_data.js) 发现返回数据错误：
   ```
   douyin-test1: login_status: logged_in, worker_status: offline ❌
   isLoggedIn: false ❌
   ```

3. **代码路径追踪**：
   - `im-websocket-server.js` 的 `getChannelsFromDataStore()` 方法
   - → `accountDAO.findById(accountId)`
   - → `Account.fromDbRow(row)`
   - → `new Account(data)`
   - → **构造函数缺少 `worker_status` 字段赋值**

## 修复方案

### 修复 1: Account 构造函数添加 worker_status 字段

**文件**: [packages/shared/models/Account.js](../packages/shared/models/Account.js#L103)

```javascript
// ❌ 修复前（第 95-114 行）
constructor(data = {}) {
  this.id = data.id || `acc-${uuidv4()}`;
  this.platform = data.platform;
  this.account_name = data.account_name;
  this.account_id = data.account_id;
  this.credentials = data.credentials;
  this.status = data.status || 'active';
  this.login_status = data.login_status || 'not_logged_in';
  // ❌ 缺少 worker_status 字段
  this.monitor_interval = data.monitor_interval || 30;
  // ... 其他字段
}

// ✅ 修复后
constructor(data = {}) {
  this.id = data.id || `acc-${uuidv4()}`;
  this.platform = data.platform;
  this.account_name = data.account_name;
  this.account_id = data.account_id;
  this.credentials = data.credentials;
  this.status = data.status || 'active';
  this.login_status = data.login_status || 'not_logged_in';
  this.worker_status = data.worker_status || 'offline'; // ✅ Worker运行状态
  this.monitor_interval = data.monitor_interval || 30;
  // ... 其他字段
}
```

### 修复 2: toSafeJSON() 方法添加 worker_status 字段

**文件**: [packages/shared/models/Account.js](../packages/shared/models/Account.js#L211)

```javascript
// ✅ 修复后（第 202-223 行）
toSafeJSON() {
  return {
    id: this.id,
    platform: this.platform,
    account_name: this.account_name,
    account_id: this.account_id,
    status: this.status,
    login_status: this.login_status,
    worker_status: this.worker_status, // ✅ Worker运行状态
    monitor_interval: this.monitor_interval,
    // ... 其他字段
  };
}
```

## 验证结果

重启 Master 服务器后，运行测试脚本 [test_im_channel_data.js](../test_im_channel_data.js)：

```
━━━━ Channel 3: douyin-test1 ━━━━
  id: acc-1083c9d5-c6e1-42eb-b4da-115e222e8a9c
  status: active
  login_status: logged_in
  worker_status: online       ✅ 修复成功
  isLoggedIn: true            ✅ 正确计算
  enabled: true
```

## 预期效果

IM 客户端（CRM PC IM）现在应该正确显示账户状态：

- **douyin-test1** (`login_status=logged_in`, `worker_status=online`)：
  - ✅ 彩色头像（非灰色）
  - ✅ 绿色状态点

- **douyin-test/douyin-test2** (`login_status=not_logged_in`, `worker_status=offline`)：
  - ✅ 灰色头像
  - ✅ 灰色状态点

## 相关文件

1. [Account.js](../packages/shared/models/Account.js#L103) - Account 模型构造函数（添加 worker_status 字段）
2. [Account.js](../packages/shared/models/Account.js#L211) - toSafeJSON() 方法（添加 worker_status 字段）
3. [im-websocket-server.js](../packages/master/src/communication/im-websocket-server.js#L705-L727) - 使用 worker_status 计算 isLoggedIn
4. [MonitorPage.tsx](../packages/crm-pc-im/src/pages/MonitorPage.tsx#L305-L306) - 使用 isLoggedIn 判断显示状态

## 修复日期

2025-11-25

## 技术要点

- **ORM 模型字段映射**：确保模型构造函数包含所有数据库字段
- **Worker 实时状态**：使用 `login_status` 和 `worker_status` 而非历史的 `status` 字段
- **状态判断逻辑**：`isLoggedIn = login_status === 'logged_in' && worker_status === 'online'`
