# Playwright爬虫代理使用指南

## 概述

`douyin-crawler-playwright.js` 现已支持灵活的代理配置,可以为每个浏览器实例配置独立的代理。

## 代理配置优先级

代理配置按以下优先级加载:

1. **账户级别代理** (最高优先级)
2. **全局代理配置** (通过爬虫options传入)
3. **环境变量代理** (HTTP_PROXY/HTTPS_PROXY)

## 使用方式

### 方式1: 账户级别代理 (推荐)

每个账户使用不同的代理,适合多账户隔离场景。

```javascript
const account = {
  account_id: 'douyin-user-123',
  platform: 'douyin',
  credentials: {
    cookies: '...'
  },
  // 账户专属代理配置
  proxy_config: {
    server: 'http://proxy1.example.com:8080',
    username: 'user1',
    password: 'pass1',
    bypass: 'localhost,127.0.0.1' // 可选,不走代理的域名
  }
};

const crawler = new DouyinCrawlerPlaywright({
  proxyLevel: 'context' // 推荐使用context级别
});

await crawler.initialize(account);
```

### 方式2: 全局代理配置

所有账户共享同一个代理。

```javascript
const crawler = new DouyinCrawlerPlaywright({
  proxy: {
    server: 'http://proxy.example.com:8080',
    username: 'user',
    password: 'pass'
  },
  proxyLevel: 'context'
});

await crawler.initialize(account);
```

### 方式3: 环境变量代理

通过环境变量设置代理(最低优先级)。

```bash
# Linux/Mac
export HTTPS_PROXY=http://proxy.example.com:8080
export HTTP_PROXY=http://proxy.example.com:8080

# Windows PowerShell
$env:HTTPS_PROXY="http://proxy.example.com:8080"
$env:HTTP_PROXY="http://proxy.example.com:8080"

# 然后运行Worker
npm run dev:worker
```

```javascript
// 代码中无需配置,会自动读取环境变量
const crawler = new DouyinCrawlerPlaywright();
await crawler.initialize(account);
```

## 代理级别选择

### Context级别 (推荐)

每个浏览器上下文使用独立代理,更灵活,资源开销小。

```javascript
const crawler = new DouyinCrawlerPlaywright({
  proxy: { server: 'http://proxy.example.com:8080' },
  proxyLevel: 'context' // 默认值
});
```

**优点:**
- 同一个浏览器可以创建多个上下文,每个使用不同代理
- 资源占用更少
- 更快的启动速度

### Browser级别

整个浏览器实例使用同一个代理。

```javascript
const crawler = new DouyinCrawlerPlaywright({
  proxy: { server: 'http://proxy.example.com:8080' },
  proxyLevel: 'browser'
});
```

**优点:**
- 所有页面共享代理设置
- 适合需要浏览器级别隔离的场景

## 支持的代理协议

- **HTTP代理**: `http://proxy.example.com:8080`
- **HTTPS代理**: `https://proxy.example.com:8080`
- **SOCKS5代理**: `socks5://proxy.example.com:1080`

## 代理认证

### 基础认证

```javascript
proxy_config: {
  server: 'http://proxy.example.com:8080',
  username: 'myuser',
  password: 'mypass'
}
```

### URL内嵌认证

```javascript
proxy_config: {
  server: 'http://myuser:mypass@proxy.example.com:8080'
}
```

## Bypass列表

设置不走代理的域名列表:

```javascript
proxy_config: {
  server: 'http://proxy.example.com:8080',
  bypass: 'localhost,127.0.0.1,*.internal.com'
}
```

## 完整示例

### 示例1: 多账户使用不同代理

```javascript
const DouyinCrawlerPlaywright = require('./crawlers/douyin-crawler-playwright');

// 账户1使用代理A
const account1 = {
  account_id: 'dy-user-1',
  platform: 'douyin',
  proxy_config: {
    server: 'http://proxy-a.example.com:8080',
    username: 'user1',
    password: 'pass1'
  }
};

// 账户2使用代理B
const account2 = {
  account_id: 'dy-user-2',
  platform: 'douyin',
  proxy_config: {
    server: 'http://proxy-b.example.com:8080',
    username: 'user2',
    password: 'pass2'
  }
};

// 并行爬取
const crawler1 = new DouyinCrawlerPlaywright();
const crawler2 = new DouyinCrawlerPlaywright();

await Promise.all([
  (async () => {
    await crawler1.initialize(account1);
    const comments1 = await crawler1.crawlComments(account1);
    await crawler1.cleanup();
  })(),
  (async () => {
    await crawler2.initialize(account2);
    const comments2 = await crawler2.crawlComments(account2);
    await crawler2.cleanup();
  })()
]);
```

### 示例2: 代理轮换

```javascript
const proxyPool = [
  { server: 'http://proxy1.example.com:8080', username: 'u1', password: 'p1' },
  { server: 'http://proxy2.example.com:8080', username: 'u2', password: 'p2' },
  { server: 'http://proxy3.example.com:8080', username: 'u3', password: 'p3' },
];

let proxyIndex = 0;

// 为账户分配轮换的代理
function assignProxyToAccount(account) {
  account.proxy_config = proxyPool[proxyIndex];
  proxyIndex = (proxyIndex + 1) % proxyPool.length;
  return account;
}

const account = assignProxyToAccount({
  account_id: 'dy-user-1',
  platform: 'douyin'
});

const crawler = new DouyinCrawlerPlaywright();
await crawler.initialize(account);
```

### 示例3: 集成到Worker任务中

修改 `packages/worker/src/tasks/monitor-task.js`:

```javascript
async executeCrawl(account) {
  // 为抖音账户分配代理
  if (account.platform === 'douyin') {
    // 从代理池中获取代理
    account.proxy_config = this.proxyManager.getProxyForAccount(account.account_id);
  }

  // 使用Playwright爬虫
  const DouyinCrawlerPlaywright = require('../crawlers/douyin-crawler-playwright');
  const crawler = new DouyinCrawlerPlaywright({
    proxyLevel: 'context' // 上下文级别代理
  });

  try {
    await crawler.initialize(account);

    const comments = await crawler.crawlComments(account);
    const messages = await crawler.crawlDirectMessages(account);

    return { comments, messages };
  } finally {
    await crawler.cleanup();
  }
}
```

## 日志输出

启用代理后,日志中会显示代理使用信息:

```
[douyin-crawler-playwright] Using account-level proxy {
  accountId: 'dy-user-1',
  server: 'http://proxy.example.com:8080'
}

[douyin-crawler-playwright] Using context-level proxy {
  server: 'http://proxy.example.com:8080'
}
```

## 故障排查

### 代理连接失败

**症状**: 启动浏览器时报连接超时

**解决**:
1. 检查代理服务器是否可达: `curl --proxy http://proxy:8080 https://www.douyin.com`
2. 确认代理认证信息是否正确
3. 检查防火墙规则

### 代理速度慢

**解决**:
1. 增加超时时间:
```javascript
await page.goto(url, {
  waitUntil: 'domcontentloaded', // 改为domcontentloaded而不是networkidle
  timeout: 60000 // 增加到60秒
});
```

2. 使用更快的代理服务器
3. 启用压缩传输

### 代理仍被检测

**解决**:
1. 使用住宅代理而不是数据中心代理
2. 确保代理IP没有被抖音封禁
3. 增加随机延迟,模拟人类行为
4. 降低爬取频率

## 最佳实践

### 1. 代理池管理

```javascript
class ProxyPoolManager {
  constructor() {
    this.proxies = [];
    this.accountProxyMap = new Map();
    this.proxyHealthMap = new Map();
  }

  // 为账户分配固定代理(避免频繁切换IP)
  getProxyForAccount(accountId) {
    if (this.accountProxyMap.has(accountId)) {
      return this.accountProxyMap.get(accountId);
    }

    // 选择健康的代理
    const proxy = this.selectHealthyProxy();
    this.accountProxyMap.set(accountId, proxy);
    return proxy;
  }

  // 标记代理不可用
  markProxyFailed(proxyServer) {
    const health = this.proxyHealthMap.get(proxyServer) || { failCount: 0 };
    health.failCount++;
    health.lastFailTime = Date.now();
    this.proxyHealthMap.set(proxyServer, health);
  }

  // 选择健康的代理
  selectHealthyProxy() {
    return this.proxies.find(p => {
      const health = this.proxyHealthMap.get(p.server);
      if (!health) return true;

      // 失败次数少于3次
      if (health.failCount < 3) return true;

      // 或者距离上次失败超过30分钟
      if (Date.now() - health.lastFailTime > 30 * 60 * 1000) return true;

      return false;
    });
  }
}
```

### 2. 账户与代理绑定

为每个账户固定分配一个代理IP,避免IP频繁变化导致账户异常:

```javascript
// 在账户创建时就分配代理
function createAccountWithProxy(accountData) {
  return {
    ...accountData,
    proxy_config: proxyPoolManager.getProxyForAccount(accountData.account_id)
  };
}
```

### 3. 错误处理

```javascript
async function crawlWithRetry(account, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const crawler = new DouyinCrawlerPlaywright();
    try {
      await crawler.initialize(account);
      return await crawler.crawlComments(account);
    } catch (error) {
      // 如果是代理错误,标记代理不可用
      if (error.message.includes('proxy') || error.message.includes('ECONNREFUSED')) {
        proxyPoolManager.markProxyFailed(account.proxy_config.server);

        // 重新分配代理
        account.proxy_config = proxyPoolManager.getProxyForAccount(account.account_id);
      }

      if (i === maxRetries - 1) throw error;
    } finally {
      await crawler.cleanup();
    }
  }
}
```

## 安全建议

1. **不要在代码中硬编码代理密码**,使用环境变量或配置文件
2. **定期更换代理IP**,避免长期使用同一IP被封禁
3. **使用HTTPS代理**,避免明文传输敏感信息
4. **限制代理访问权限**,只允许特定账户使用特定代理
5. **监控代理使用情况**,及时发现异常流量

---

**注意**: 使用代理爬取时仍需遵守平台的使用条款,本功能仅用于监控自己的账户通知。
