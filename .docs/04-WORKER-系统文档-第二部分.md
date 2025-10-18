# Worker 系统完整文档 - 第二部分

**版本**: 1.0.0
**日期**: 2025-10-18

---

## 目录 (第二部分)

1. [任务管理](#任务管理)
2. [Socket.IO 通信](#socketio-通信)
3. [数据存储](#数据存储)
4. [错误处理](#错误处理)
5. [部署运维](#部署运维)

---

## 任务管理

### TaskRunner 任务执行器

```javascript
class TaskRunner {
  constructor() {
    this.tasks = new Map();      // accountId -> MonitorTask
    this.timers = new Map();     // accountId -> timeoutId
  }

  // 添加任务
  addTask(accountId, task) {
    if (this.tasks.has(accountId)) {
      logger.warn(`Task already exists for account ${accountId}`);
      return;
    }

    this.tasks.set(accountId, task);
    this.scheduleTask(accountId, task);
    logger.info(`Task added for account ${accountId}`);
  }

  // 移除任务
  removeTask(accountId) {
    if (!this.tasks.has(accountId)) {
      return;
    }

    // 清除定时器
    const timerId = this.timers.get(accountId);
    if (timerId) {
      clearTimeout(timerId);
      this.timers.delete(accountId);
    }

    // 删除任务
    this.tasks.delete(accountId);
    logger.info(`Task removed for account ${accountId}`);
  }

  // 调度任务
  scheduleTask(accountId, task) {
    const timerId = setTimeout(() => {
      task.run().then(() => {
        // 递归调度
        this.scheduleTask(accountId, task);
      }).catch(error => {
        logger.error(`Task execution failed for ${accountId}:`, error);
        // 重新调度
        this.scheduleTask(accountId, task);
      });
    }, task.interval);

    this.timers.set(accountId, timerId);
  }

  // 获取活跃任务
  getActiveTasks() {
    return Array.from(this.tasks.keys());
  }

  // 停止所有任务
  async stopAll() {
    for (const [accountId] of this.tasks) {
      this.removeTask(accountId);
    }
  }
}

// 全局实例
const taskRunner = new TaskRunner();
```

---

## Socket.IO 通信

### 消息协议

**Worker → Master**:

```javascript
// 1. 注册 Worker
socket.emit('worker:register', {
  workerId: 'worker-1',
  host: '127.0.0.1',
  port: 4000,
  capabilities: ['douyin', 'xiaohongshu'],
  maxAccounts: 10,
  version: '1.0.0'
});

// 2. 心跳
socket.emit('worker:heartbeat', {
  workerId: 'worker-1',
  stats: {
    activeAccounts: 2,
    memoryUsage: 512,    // MB
    cpuUsage: 15.5       // %
  },
  timestamp: Date.now()
});

// 3. 发送二维码
socket.emit('worker:login:qrcode', {
  session_id: 'session-xxx',
  qr_code_data: 'data:image/png;base64,...',
  account_id: 'account-xxx'
});

// 4. 登录状态更新
socket.emit('worker:login:status', {
  session_id: 'session-xxx',
  status: 'success',              // success/failed
  cookies: [                      // 如果成功
    {
      name: 'sessionid',
      value: 'xxx',
      domain: '.douyin.com',
      path: '/',
      expires: 1700000000,
      httpOnly: true,
      secure: true
    }
  ],
  user_info: {
    nickname: '用户昵称',
    avatar: 'https://...',
    douyin_id: 'xxx',
    uid: 'xxx'
  },
  fingerprint: {
    userAgent: 'Mozilla/5.0...',
    viewport: {width: 1366, height: 768},
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN'
  }
});

// 5. 发送监控数据
socket.emit('worker:message:detected', {
  type: 'comment',                // comment/direct_message
  account_id: 'account-xxx',
  messages: [
    {
      id: 'comment-xxx',
      content: '评论内容',
      author_name: '用户名',
      author_id: 'uid-xxx',
      post_id: 'video-xxx',
      post_title: '视频标题',
      detected_at: 1700000000
    }
  ]
});
```

**Master → Worker**:

```javascript
// 1. 登录请求
socket.on('master:login:start', (data) => {
  // data: {
  //   account_id: 'xxx',
  //   session_id: 'xxx',
  //   platform: 'douyin',
  //   proxy: {server, protocol, username, password}
  // }
});

// 2. 任务分配
socket.on('master:task:assign', (data) => {
  // data: {
  //   accounts: [
  //     {id, platform, account_id, monitor_interval, ...}
  //   ]
  // }
});

// 3. 任务撤销
socket.on('master:task:revoke', (data) => {
  // data: {
  //   accountIds: ['xxx', 'yyy']
  // }
});
```

---

## 数据存储

### 文件结构

```
packages/worker/data/browser/
├── worker-1/                          # 按 Worker ID 分目录
│   ├── fingerprints/                  # 指纹配置目录
│   │   ├── account-123_fingerprint.json
│   │   └── account-456_fingerprint.json
│   │
│   ├── storage-states/                # Cookie 和存储状态
│   │   ├── account-123_storage.json
│   │   └── account-456_storage.json
│   │
│   ├── contexts/                      # 浏览器上下文数据
│   │   ├── account-123/
│   │   │   ├── Local Storage/
│   │   │   ├── Session Storage/
│   │   │   ├── IndexedDB/
│   │   │   └── Cookies
│   │   └── account-456/
│   │       ├── Local Storage/
│   │       └── ...
│   │
│   ├── browser_account-123/           # Playwright 持久化上下文
│   │   ├── Default/
│   │   ├── Default/Cache
│   │   └── ...
│   │
│   └── screenshots/                   # 调试截图
│       ├── account-123_login_success.png
│       └── account-456_error.png
```

### 指纹配置文件格式

```javascript
// worker-1/fingerprints/account-123_fingerprint.json
{
  "accountId": "account-123",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "viewport": {
    "width": 1366,
    "height": 768
  },
  "timezone": "Asia/Shanghai",
  "locale": "zh-CN",
  "platform": "Win32",
  "deviceScaleFactor": 1,
  "isMobile": false,
  "hasTouch": false,
  "webgl": {
    "vendor": "Intel Inc.",
    "renderer": "Intel(R) HD Graphics 630"
  },
  "canvas": {
    "noise": "aB3dE5fG7hJ9kL",
    "fonts": ["Arial", "Times New Roman", "SimSun"]
  },
  "audio": {
    "noiseOffset": 0.0001234
  },
  "headers": {
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "accept-encoding": "gzip, deflate, br",
    "user-agent": "..."
  },
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-15T10:30:00Z",
  "version": "2.0"
}
```

### 存储状态文件格式

```javascript
// worker-1/storage-states/account-123_storage.json
{
  "cookies": [
    {
      "name": "__tea_cache_tokens_",
      "value": "xxx",
      "domain": ".douyin.com",
      "path": "/",
      "expires": 1705123456789,
      "httpOnly": true,
      "secure": true,
      "sameSite": "None"
    },
    {
      "name": "sessionid",
      "value": "yyy",
      "domain": ".douyin.com",
      "path": "/",
      "expires": 1705123456789,
      "httpOnly": true,
      "secure": true,
      "sameSite": "Lax"
    }
  ],
  "origins": [
    {
      "origin": "https://www.douyin.com",
      "localStorage": [
        {
          "name": "user_info",
          "value": "{\"uid\":\"123456\",\"nickname\":\"用户名\"}"
        },
        {
          "name": "is_login",
          "value": "true"
        }
      ],
      "sessionStorage": [],
      "indexedDB": []
    }
  ]
}
```

---

## 错误处理

### 错误分类

```javascript
class ErrorHandler {
  // 网络错误
  static isNetworkError(error) {
    return error.message.includes('ERR_') ||
           error.message.includes('ECONNREFUSED');
  }

  // 超时错误
  static isTimeoutError(error) {
    return error.message.includes('Timeout') ||
           error.message.includes('timed out');
  }

  // 元素未找到
  static isElementNotFound(error) {
    return error.message.includes('Selector') ||
           error.message.includes('not found');
  }

  // 导航失败
  static isNavigationError(error) {
    return error.message.includes('Navigation') ||
           error.message.includes('ERR_NAME_NOT_RESOLVED');
  }

  // 登录失败
  static isLoginError(error) {
    return error.message.includes('login') ||
           error.message.includes('auth');
  }
}
```

### 重试机制

```javascript
class RetryManager {
  static async retry(fn, options = {}) {
    const {
      maxRetries = 3,
      delay = 1000,
      backoff = 2,
      onRetry = null
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries) {
          const waitTime = delay * Math.pow(backoff, attempt);
          logger.warn(
            `Attempt ${attempt + 1} failed, retrying in ${waitTime}ms:`,
            error.message
          );

          if (onRetry) {
            onRetry(attempt, error);
          }

          await sleep(waitTime);
        }
      }
    }

    throw lastError;
  }
}

// 使用示例
await RetryManager.retry(
  () => page.goto(url),
  {
    maxRetries: 3,
    delay: 2000,
    onRetry: (attempt, error) => {
      logger.warn(`Navigation retry ${attempt + 1}`);
    }
  }
);
```

### 代理健康检查

```javascript
class ProxyHealthChecker {
  static async check(proxyConfig) {
    const testUrl = 'https://httpbin.org/ip';
    const timeout = 5000;

    try {
      const response = await fetch(testUrl, {
        timeout,
        agent: this.createProxyAgent(proxyConfig)
      });

      if (response.ok) {
        return {
          healthy: true,
          responseTime: Date.now()
        };
      } else {
        return {
          healthy: false,
          reason: `HTTP ${response.status}`
        };
      }
    } catch (error) {
      return {
        healthy: false,
        reason: error.message
      };
    }
  }

  static createProxyAgent(proxyConfig) {
    // 创建代理 agent
    // 根据 protocol 选择不同的 agent 类型
    // ...
  }
}
```

---

## 部署运维

### 启动命令

**开发环境**:
```bash
# 单个 Worker
cd packages/worker
WORKER_ID=worker-1 PORT=4000 npm start

# 多个 Worker (开发)
WORKER_ID=worker-1 PORT=4000 npm start &
WORKER_ID=worker-2 PORT=4001 npm start &
WORKER_ID=worker-3 PORT=4002 npm start &
```

**生产环境 (PM2)**:
```bash
# 启动单个
pm2 start packages/worker/src/index.js \
  --name "hiscrm-worker-1" \
  --env WORKER_ID=worker-1 \
  --env PORT=4000 \
  --env NODE_ENV=production

# 启动多个
for i in {1..3}; do
  pm2 start packages/worker/src/index.js \
    --name "hiscrm-worker-$i" \
    --env WORKER_ID=worker-$i \
    --env PORT=$((4000 + i - 1)) \
    --env NODE_ENV=production
done

# 查看所有 Worker
pm2 list

# 查看日志
pm2 logs hiscrm-worker-1
pm2 logs hiscrm-worker-1 --lines 100 --err

# 监控
pm2 monit

# 重启
pm2 restart hiscrm-worker-1

# 停止
pm2 stop hiscrm-worker-1

# 删除
pm2 delete hiscrm-worker-1
```

### 环境变量

```bash
# .env 或启动参数
WORKER_ID=worker-1              # 唯一标识
PORT=4000                       # 监听端口
MASTER_HOST=localhost           # Master 地址
MASTER_PORT=3000                # Master 端口
NODE_ENV=production             # 环境
LOG_LEVEL=info                  # 日志级别
MAX_ACCOUNTS=10                 # 最大账户数
HEADLESS=true                   # 无头模式
DATA_DIR=./data/browser         # 数据目录
```

### 日志查看

```bash
# 查看实时日志
tail -f packages/worker/logs/worker.log

# 查看最后 100 行
tail -n 100 packages/worker/logs/worker.log

# 按关键词搜索
grep "ERROR" packages/worker/logs/worker.log
grep "account-123" packages/worker/logs/worker.log

# 查看特定时间范围
grep "2025-01-15" packages/worker/logs/worker.log
```

### 监控指标

**系统级别**:
- CPU 使用率
- 内存使用量 (堆内存)
- 文件打开数
- 网络连接数

**应用级别**:
- 活跃任务数
- 成功爬取率
- 平均响应时间
- 错误率

```javascript
// 统计示例
{
  "workerId": "worker-1",
  "uptime": 3600000,                    // 运行时长 (ms)
  "activeTasks": 3,                     // 活跃任务
  "totalTasks": 10,                     // 总任务数
  "memoryUsage": {
    "heapUsed": 512,                    // MB
    "heapTotal": 1024,                  // MB
    "external": 10,                     // MB
    "rss": 600                          // MB
  },
  "performance": {
    "successRate": 0.95,                // 成功率
    "avgResponseTime": 2.5,             // 平均响应时间 (s)
    "errorRate": 0.05,                  // 错误率
    "lastHeartbeat": 1705000000000      // 最后心跳
  }
}
```

---

## 常见问题

### Q1: Browser 启动失败

**症状**: `Error: Failed to launch Chromium`

**解决**:
```bash
# 安装 Playwright 浏览器
npx playwright install

# 检查依赖
npm ls
```

### Q2: 内存泄漏

**症状**: 内存持续增长

**解决**:
- 检查浏览器是否正确关闭
- 清理旧的 Browser 实例
- 限制活跃任务数

### Q3: 网络超时

**症状**: 登录/爬取超时

**解决**:
- 检查网络连接
- 尝试使用代理
- 增加超时时间

### Q4: 登录失败

**症状**: 二维码未显示或登录卡住

**解决**:
- 检查选择器是否正确
- 查看调试截图 (`screenshots/`)
- 尝试使用无头模式 (`headless: false`)

---

## 性能优化建议

### 1. 减少内存占用

```javascript
// 定期清理未使用的 Browser
setInterval(async () => {
  const activeTasks = taskRunner.getActiveTasks();
  const allBrowsers = browserManager.getBrowserIds();

  for (const browserId of allBrowsers) {
    if (!activeTasks.includes(browserId)) {
      await browserManager.closeBrowser(browserId);
    }
  }
}, 300000);  // 每5分钟检查一次
```

### 2. 优化并发

```javascript
// 限制同时爬取数量
const MAX_CONCURRENT = 3;
const queue = [];

function executeTask(task) {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    task.run().then(() => {
      activeCount--;
      if (queue.length > 0) {
        executeTask(queue.shift());
      }
    });
  } else {
    queue.push(task);
  }
}
```

### 3. 缓存优化

```javascript
// 缓存指纹和 Cookie
const fingerprintCache = new Map();
const storageStateCache = new Map();

// 定期清理缓存
setInterval(() => {
  fingerprintCache.clear();
  storageStateCache.clear();
}, 3600000);  // 每小时清理一次
```

---

## 安全建议

### 1. Cookie 加密

```javascript
const crypto = require('crypto');

function encryptCookie(cookie) {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return cipher.update(JSON.stringify(cookie), 'utf8', 'hex') +
         cipher.final('hex');
}

function decryptCookie(encrypted) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return JSON.parse(
    decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8')
  );
}
```

### 2. 指纹隔离

```javascript
// 基于 accountId 的确定性随机化
function seedRandom(seed) {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

const rng = seedRandom(hashString(accountId));
const randomUserAgent = selectUserAgent(rng);
```

### 3. 代理验证

```javascript
// 验证代理配置
function validateProxy(proxyConfig) {
  if (!proxyConfig) return true;

  const {server, protocol} = proxyConfig;

  // 验证 protocol
  if (!['http', 'https', 'socks5'].includes(protocol)) {
    throw new Error('Invalid proxy protocol');
  }

  // 验证 server 格式
  if (!/^[\w.-]+:\d+$/.test(server)) {
    throw new Error('Invalid proxy server format');
  }

  return true;
}
```

---

**文档版本**: 1.0.0
**最后更新**: 2025-10-18
**维护者**: 开发团队
