# 错误处理优化方案

**日期**: 2025-10-12
**状态**: 📋 **规划中**

---

## 执行摘要

对登录流程和浏览器自动化中的错误处理进行系统性优化，提高系统的稳定性和用户体验。

---

## 当前问题分析

### 1. 二维码过期处理

**现状**:
- 二维码有效期约 2-3 分钟
- 过期后用户需要手动重新发起登录请求
- 没有检测二维码过期的机制

**影响**:
- 用户体验差
- 增加操作负担

### 2. 网络超时处理

**现状**:
```javascript
await page.goto(this.DOUYIN_HOME, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,  // 30秒超时
});
```

**问题**:
- 超时后直接抛出异常，登录失败
- 没有重试机制
- 不区分网络问题和服务器问题

### 3. 代理连接失败

**现状**:
- 代理不可用时，浏览器启动失败
- 没有降级策略（不使用代理）
- 没有代理健康检查

**影响**:
- 代理故障导致整个登录流程失败
- 无法自动恢复

### 4. 错误分类不足

**现状**:
```javascript
catch (error) {
  logger.error('Failed to start login:', error);
  this.notifyLoginFailed(accountId, sessionId, error.message);
}
```

**问题**:
- 所有错误统一处理
- 无法针对不同错误类型采取不同策略
- 错误信息不够详细

---

## 优化方案

### 1. 二维码过期检测与刷新

#### 实现策略

**检测方法**:
- 监听页面 DOM 变化，检测"二维码已过期"提示
- 定时检查二维码元素的状态
- 时间阈值：2分30秒自动刷新

**刷新流程**:
```javascript
async refreshQRCode(accountId, sessionId) {
  try {
    logger.info(`Refreshing QR code for session ${sessionId}`);

    const session = this.loginSessions.get(accountId);
    if (!session) return;

    // 1. 重新加载页面
    await session.page.reload({ waitUntil: 'domcontentloaded' });

    // 2. 等待新二维码加载
    await this.waitForQRCode(session.page);

    // 3. 提取新二维码
    const qrCodeData = await this.extractQRCode(session.page, accountId, sessionId);
    session.qrCodeData = qrCodeData;
    session.qrCodeRefreshCount = (session.qrCodeRefreshCount || 0) + 1;

    // 4. 通知 Master 二维码已刷新
    this.notifyQRCodeRefreshed(accountId, sessionId, qrCodeData);

    logger.info(`QR code refreshed successfully (count: ${session.qrCodeRefreshCount})`);
  } catch (error) {
    logger.error('Failed to refresh QR code:', error);
    this.notifyLoginFailed(accountId, sessionId, 'QR code refresh failed');
    this.cleanupSession(accountId);
  }
}

// 在 startLoginStatusPolling 中添加
const qrCodeAge = Date.now() - session.startTime;
const QR_CODE_LIFETIME = 150000; // 2分30秒

if (qrCodeAge > QR_CODE_LIFETIME && qrCodeAge < this.LOGIN_TIMEOUT) {
  // 刷新二维码
  await this.refreshQRCode(accountId, sessionId);
  session.startTime = Date.now(); // 重置计时
}
```

**限制**:
- 最多刷新 3 次
- 每次刷新间隔至少 2 分钟

### 2. 网络超时重试机制

#### 重试策略

**指数退避算法**:
```javascript
class RetryStrategy {
  constructor() {
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1秒
    this.maxDelay = 10000; // 10秒
  }

  async retry(fn, context = 'operation') {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        logger.info(`${context}: attempt ${attempt + 1}/${this.maxRetries + 1}`);
        return await fn();
      } catch (error) {
        lastError = error;

        // 检查是否应该重试
        if (!this.shouldRetry(error) || attempt === this.maxRetries) {
          throw error;
        }

        // 计算延迟时间（指数退避）
        const delay = Math.min(
          this.baseDelay * Math.pow(2, attempt),
          this.maxDelay
        );

        logger.warn(`${context} failed, retrying in ${delay}ms:`, error.message);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  shouldRetry(error) {
    // 可重试的错误类型
    const retryableErrors = [
      'Timeout',
      'Navigation timeout',
      'net::ERR_',
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
    ];

    return retryableErrors.some(err => error.message.includes(err));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**使用示例**:
```javascript
const retryStrategy = new RetryStrategy();

// 带重试的页面导航
await retryStrategy.retry(async () => {
  await page.goto(this.DOUYIN_HOME, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
}, 'Page navigation');

// 带重试的二维码等待
await retryStrategy.retry(async () => {
  return await this.waitForQRCode(page);
}, 'QR code detection');
```

### 3. 代理连接失败处理

#### 降级策略

**策略层级**:
1. **主代理**: 使用配置的代理
2. **备用代理**: 如果有备用代理，切换到备用
3. **直连降级**: 如果允许，不使用代理直接连接

```javascript
async createContextWithProxy(accountId, proxyConfig) {
  try {
    // 尝试使用主代理
    logger.info(`Creating context with proxy: ${proxyConfig.server}`);
    return await this.createContext(accountId, { proxy: proxyConfig });
  } catch (error) {
    logger.error(`Primary proxy failed: ${proxyConfig.server}`, error);

    // 检查是否有备用代理
    if (proxyConfig.fallbackServer) {
      try {
        logger.info(`Trying fallback proxy: ${proxyConfig.fallbackServer}`);
        const fallbackProxy = {
          server: proxyConfig.fallbackServer,
          username: proxyConfig.fallbackUsername,
          password: proxyConfig.fallbackPassword,
        };
        return await this.createContext(accountId, { proxy: fallbackProxy });
      } catch (fallbackError) {
        logger.error(`Fallback proxy also failed`, fallbackError);
      }
    }

    // 检查是否允许直连降级
    if (proxyConfig.allowDirectConnection) {
      logger.warn(`Falling back to direct connection for account ${accountId}`);
      return await this.createContext(accountId, {}); // 不使用代理
    }

    // 所有方案都失败
    throw new Error(`All proxy connection attempts failed for ${accountId}`);
  }
}
```

#### 代理健康检查

**检查机制**:
```javascript
async checkProxyHealth(proxyConfig) {
  try {
    const testUrl = 'https://www.baidu.com';
    const startTime = Date.now();

    // 创建临时浏览器上下文测试代理
    const context = await this.browser.newContext({
      proxy: {
        server: proxyConfig.server,
        username: proxyConfig.username,
        password: proxyConfig.password,
      },
    });

    const page = await context.newPage();

    await page.goto(testUrl, {
      timeout: 10000,
      waitUntil: 'domcontentloaded',
    });

    const responseTime = Date.now() - startTime;

    await page.close();
    await context.close();

    logger.info(`Proxy health check passed: ${proxyConfig.server} (${responseTime}ms)`);

    return {
      healthy: true,
      responseTime,
      timestamp: Date.now(),
    };
  } catch (error) {
    logger.error(`Proxy health check failed: ${proxyConfig.server}`, error);
    return {
      healthy: false,
      error: error.message,
      timestamp: Date.now(),
    };
  }
}
```

### 4. 错误分类与处理

#### 错误类型定义

```javascript
class LoginError extends Error {
  constructor(type, message, details = {}) {
    super(message);
    this.name = 'LoginError';
    this.type = type;
    this.details = details;
    this.timestamp = Date.now();
  }
}

// 错误类型常量
const ErrorTypes = {
  NETWORK_ERROR: 'network_error',           // 网络连接问题
  PROXY_ERROR: 'proxy_error',               // 代理连接失败
  TIMEOUT_ERROR: 'timeout_error',           // 超时
  QR_CODE_ERROR: 'qr_code_error',          // 二维码相关错误
  QR_CODE_EXPIRED: 'qr_code_expired',      // 二维码过期
  PAGE_ERROR: 'page_error',                 // 页面加载错误
  BROWSER_ERROR: 'browser_error',           // 浏览器错误
  UNKNOWN_ERROR: 'unknown_error',           // 未知错误
};

module.exports = { LoginError, ErrorTypes };
```

#### 错误分类器

```javascript
function classifyError(error) {
  const message = error.message || '';

  // 网络错误
  if (message.includes('net::ERR') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ECONNRESET')) {
    return ErrorTypes.NETWORK_ERROR;
  }

  // 代理错误
  if (message.includes('proxy') ||
      message.includes('ERR_PROXY_CONNECTION_FAILED')) {
    return ErrorTypes.PROXY_ERROR;
  }

  // 超时错误
  if (message.includes('Timeout') ||
      message.includes('timeout')) {
    return ErrorTypes.TIMEOUT_ERROR;
  }

  // 二维码错误
  if (message.includes('QR code') ||
      message.includes('二维码')) {
    return ErrorTypes.QR_CODE_ERROR;
  }

  // 页面错误
  if (message.includes('Navigation') ||
      message.includes('Page crashed')) {
    return ErrorTypes.PAGE_ERROR;
  }

  return ErrorTypes.UNKNOWN_ERROR;
}
```

#### 针对性错误处理

```javascript
async handleError(accountId, sessionId, error) {
  const errorType = classifyError(error);

  logger.error(`Login error [${errorType}] for account ${accountId}:`, error);

  switch (errorType) {
    case ErrorTypes.NETWORK_ERROR:
      // 网络错误 - 重试
      logger.info('Network error detected, will retry');
      return { shouldRetry: true, delay: 2000 };

    case ErrorTypes.PROXY_ERROR:
      // 代理错误 - 尝试降级
      logger.info('Proxy error detected, trying fallback');
      return { shouldRetry: true, useFallbackProxy: true };

    case ErrorTypes.TIMEOUT_ERROR:
      // 超时错误 - 增加超时时间重试
      logger.info('Timeout error detected, will retry with longer timeout');
      return { shouldRetry: true, increaseTimeout: true };

    case ErrorTypes.QR_CODE_ERROR:
      // 二维码错误 - 刷新二维码
      logger.info('QR code error detected, will refresh');
      return { shouldRetry: true, refreshQRCode: true };

    case ErrorTypes.PAGE_ERROR:
      // 页面错误 - 重新加载页面
      logger.info('Page error detected, will reload');
      return { shouldRetry: true, reloadPage: true };

    case ErrorTypes.BROWSER_ERROR:
      // 浏览器错误 - 重启浏览器
      logger.info('Browser error detected, will restart browser');
      return { shouldRetry: false, restartBrowser: true };

    default:
      // 未知错误 - 不重试
      logger.error('Unknown error type, will not retry');
      return { shouldRetry: false };
  }
}
```

---

## 实现优先级

### 优先级 1: 网络超时重试 (HIGH)
- **理由**: 最常见的错误类型
- **影响**: 提高登录成功率
- **工作量**: 中等

### 优先级 2: 错误分类系统 (HIGH)
- **理由**: 为其他优化奠定基础
- **影响**: 改善错误诊断和处理
- **工作量**: 中等

### 优先级 3: 代理失败处理 (MEDIUM)
- **理由**: 代理集成刚完成，需要配套的错误处理
- **影响**: 提高代理使用的可靠性
- **工作量**: 中等

### 优先级 4: 二维码过期刷新 (MEDIUM)
- **理由**: 改善用户体验
- **影响**: 减少用户手动操作
- **工作量**: 较大

---

## 测试策略

### 1. 网络错误模拟
```javascript
// 模拟网络断开
await page.setOfflineMode(true);

// 模拟慢速网络
await page.route('**/*', route => {
  setTimeout(() => route.continue(), 5000);
});
```

### 2. 代理错误测试
```sql
-- 使用不存在的代理
UPDATE proxies SET server = '127.0.0.1:9999' WHERE id = 'test-proxy';
```

### 3. 超时测试
```javascript
// 缩短超时时间触发超时
await page.goto(url, { timeout: 1000 });
```

---

## 监控指标

### 关键指标

1. **登录成功率**
   - 成功登录数 / 总登录尝试数
   - 目标: > 95%

2. **平均重试次数**
   - 总重试次数 / 登录会话数
   - 目标: < 0.5

3. **二维码刷新率**
   - 二维码刷新次数 / 登录会话数
   - 目标: < 0.3

4. **代理失败率**
   - 代理连接失败数 / 使用代理的登录数
   - 目标: < 5%

5. **错误类型分布**
   - 各类错误占比
   - 用于识别系统薄弱环节

---

## 实施计划

### Phase 1: 基础架构 (1-2天)
- [ ] 创建错误类型定义
- [ ] 实现错误分类器
- [ ] 添加重试策略类

### Phase 2: 核心功能 (2-3天)
- [ ] 实现网络超时重试
- [ ] 集成错误分类到登录流程
- [ ] 添加详细的错误日志

### Phase 3: 高级功能 (2-3天)
- [ ] 实现代理降级策略
- [ ] 添加代理健康检查
- [ ] 实现二维码自动刷新

### Phase 4: 测试与优化 (1-2天)
- [ ] 编写错误场景测试
- [ ] 压力测试
- [ ] 监控指标收集

---

## 预期效果

1. **登录成功率**: 从 ~85% 提升到 95%+
2. **用户体验**: 减少 70% 的手动重试操作
3. **系统稳定性**: 自动处理 90% 的常见错误
4. **故障诊断**: 错误定位时间减少 80%

---

**文档版本**: 1.0
**最后更新**: 2025-10-12
**负责人**: Claude (AI Assistant)
