# 常驻任务 Tab 自动恢复机制

## 概述

为了防止实时监控任务（REALTIME_MONITOR Tab）因意外关闭而静默失效，在 `LoginDetectionTask` 中添加了自动健康检查和恢复机制。

## 实现方案

### 方案选择

采用**方案3：在 LoginDetectionTask 中添加健康检查**

#### 为什么选择这个方案？

| 特性 | 说明 |
|-----|------|
| **架构合理** | LoginDetectionTask 本就是"任务健康管理器"，职责自然延伸 |
| **不依赖其他任务** | 独立常驻，不受爬虫任务状态影响 |
| **无需额外资源** | 复用现有 30 秒检测周期，无需新定时器 |
| **代码集中** | 统一管理任务启动/停止/恢复逻辑 |
| **可靠性高** | 能检测所有异常（tab 关闭、浏览器崩溃、page 失效） |

#### 其他备选方案

- **方案1（page.on 'close' 监听）**：需要处理主动关闭与意外关闭的区分，逻辑复杂
- **方案2（MonitorTask 定期检查）**：依赖爬虫任务运行，爬虫停止则失效

## 工作原理

### 执行流程

```
每 30 秒执行一次（默认）
    ├─ 1. 检测登录状态
    ├─ 2. 如果状态变化 → 触发 onLoginStatusChanged()
    ├─ 3. 更新 currentLoginStatus
    └─ 4. 如果 currentLoginStatus === 'logged_in'
        └─ ⭐ 执行健康检查 checkRealtimeMonitorHealth()
```

### 健康检查逻辑

```javascript
async checkRealtimeMonitorHealth() {
  // 1. 检查平台是否支持实时监控
  if (!platformInstance.startRealtimeMonitor) return;

  // 2. 获取实时监控实例
  const monitor = platformInstance.realtimeMonitors.get(accountId);

  // 3. 情况1：实时监控不存在
  if (!monitor) {
    await platformInstance.startRealtimeMonitor(account);
    return;
  }

  // 4. 情况2：page 已关闭或不可访问
  if (monitor.page.isClosed()) {
    platformInstance.realtimeMonitors.delete(accountId);
    await platformInstance.startRealtimeMonitor(account);
  }
}
```

## 触发场景

### ✅ 会自动恢复的场景

| 场景 | 恢复时间 | 说明 |
|-----|---------|------|
| **用户手动关闭 Tab** | 30 秒内 | 检测到 page.isClosed() 为 true |
| **浏览器崩溃** | 30 秒内 | page 不可访问，触发异常处理 |
| **系统资源不足导致 Tab 关闭** | 30 秒内 | 检测到 page.isClosed() 为 true |
| **实时监控意外停止** | 30 秒内 | monitor 不存在但账户已登录 |

### ❌ 不会误触发的场景

| 场景 | 为什么不会误触发 |
|-----|---------------|
| **登录失效，主动关闭实时监控** | `currentLoginStatus` 已更新为 `not_logged_in`，不满足 `=== 'logged_in'` 条件 |
| **Worker 停止** | `LoginDetectionTask.stop()` 会清除定时器，不再执行检查 |
| **账户未启用实时监控** | `startRealtimeMonitor()` 内部会检查配置，直接返回 |

## 时间线示例

### 场景1：用户手动关闭 Tab

```
T0: 用户在浏览器中手动关闭实时监控 Tab
    └─ monitor.page.isClosed() = true

T0+30s: LoginDetectionTask 执行健康检查
    ├─ 检测到 currentLoginStatus = 'logged_in' ✅
    ├─ 检测到 monitor.page.isClosed() = true ✅
    └─ 调用 startRealtimeMonitor() 恢复 Tab

T0+32s: 实时监控 Tab 重新创建并开始工作 ✅
```

### 场景2：登录失效，主动关闭

```
T0: 检测到登录失效
    └─ onLoginStatusChanged('not_logged_in')
        ├─ 调用 stopRealtimeMonitor()
        └─ 调用 cleanupAllTaskTabs() 关闭 Tab

T1: onLoginStatusChanged 完成
    └─ currentLoginStatus = 'not_logged_in' ✅

T0+30s: LoginDetectionTask 下次执行
    └─ currentLoginStatus = 'not_logged_in'
        └─ ❌ 不满足 if (currentLoginStatus === 'logged_in')
            └─ 不执行健康检查，正确！✅
```

## 配置

### 环境变量

```bash
# 登录检测间隔（秒），默认 30 秒
LOGIN_CHECK_INTERVAL=30
```

### 调整建议

| 间隔 | 优点 | 缺点 | 适用场景 |
|-----|------|------|---------|
| **15 秒** | 恢复速度快 | 检查频繁，资源消耗稍高 | 生产环境，要求高可用性 |
| **30 秒** ⭐ | 平衡性能与可靠性 | - | **推荐默认配置** |
| **60 秒** | 资源消耗低 | 恢复延迟较长 | 测试环境，资源受限 |

## 日志输出

### 正常运行

```
[login-detection-task] Executing login detection for account xxx (count: 10)
[login-detection-task] Login status check result: logged_in (previous: logged_in)
```

### 检测到 Tab 关闭

```
[login-detection-task] ⚠️  实时监控 Tab 已关闭，尝试恢复 (账户: xxx)
[douyin-platform] 启动实时监控 (账户: xxx)
[login-detection-task] ✅ 实时监控已自动恢复 (账户: xxx)
```

### 检测到实时监控不存在

```
[login-detection-task] ⚠️  实时监控不存在，尝试恢复 (账户: xxx)
[douyin-platform] 启动实时监控 (账户: xxx)
[login-detection-task] ✅ 实时监控已自动恢复 (账户: xxx)
```

### 恢复失败

```
[login-detection-task] ⚠️  实时监控 Tab 已关闭，尝试恢复 (账户: xxx)
[login-detection-task] ❌ 实时监控恢复失败 (账户: xxx): Browser context not found
```

## 监控指标

可以通过以下方式监控恢复机制：

```javascript
// 获取 LoginDetectionTask 状态
const status = loginDetectionTask.getStatus();
console.log(status);
// {
//   isRunning: true,
//   currentLoginStatus: 'logged_in',
//   lastCheckTime: 1731840000000,
//   executionCount: 120,
//   loginCheckInterval: 30000,
//   nextCheckIn: 'scheduled'
// }

// 检查实时监控是否存在
const platform = platformManager.getPlatform('douyin');
const monitor = platform.realtimeMonitors.get(accountId);
console.log(monitor ? 'active' : 'inactive');
```

## 注意事项

### 1. 恢复延迟

- **最大延迟**：30 秒（默认配置）
- **影响评估**：实时监控是辅助机制，主要数据采集靠定时爬虫（0.5-10分钟间隔）
- **结论**：30 秒延迟对业务影响可忽略

### 2. 浏览器资源

- 每次恢复会创建新的 Tab 和注入新的 Hook 脚本
- 如果频繁恢复（每分钟多次），可能表明系统资源不足，需要调查根本原因

### 3. 多平台支持

- 当前实现针对**抖音平台**
- 其他平台如果支持实时监控，会自动生效
- 不支持实时监控的平台会被自动跳过

### 4. 与其他组件的关系

```
LoginDetectionTask（健康管理器）
    ├─ 依赖 PlatformManager（获取平台实例）
    ├─ 依赖 BrowserManager（Tab 管理）
    └─ 管理 MonitorTask（爬虫任务）和 RealtimeMonitor（实时监控）
```

## 未来扩展

可以基于此机制扩展其他任务的健康检查：

```javascript
async checkAllTasksHealth() {
  // 1. 检查实时监控
  await this.checkRealtimeMonitorHealth();

  // 2. 检查爬虫任务（未来）
  await this.checkMonitorTaskHealth();

  // 3. 检查浏览器连接（未来）
  await this.checkBrowserConnectionHealth();
}
```

## 总结

该机制通过在现有的 `LoginDetectionTask` 中添加健康检查，实现了：

✅ **简单可靠**：复用现有检测周期，无需额外组件
✅ **架构合理**：职责自然延伸，代码集中管理
✅ **安全保障**：不会在登录失效时误触发
✅ **自动恢复**：30秒内自动检测并恢复异常 Tab
✅ **易于监控**：清晰的日志输出，便于排查问题

---

**文档版本**: 1.0
**最后更新**: 2025-11-17
**相关文件**: [packages/worker/src/handlers/login-detection-task.js](../packages/worker/src/handlers/login-detection-task.js)
