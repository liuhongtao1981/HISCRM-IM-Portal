/**
 * Master 服务配置文件
 * 所有可配置参数集中管理
 */

const path = require('path');

const config = {
  // ============================================
  // 服务基础配置
  // ============================================
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development',
  },

  // ============================================
  // 数据库配置
  // ============================================
  database: {
    path: process.env.DB_PATH || path.join(__dirname, '../../data/master.db'),
    walMode: true,  // 使用 WAL 模式提升并发性能
  },

  // ============================================
  // Worker 管理配置
  // ============================================
  worker: {
    // 心跳检测
    heartbeat: {
      timeout: parseInt(process.env.WORKER_HEARTBEAT_TIMEOUT) || 30000,  // Worker 心跳超时时间(ms)
      interval: parseInt(process.env.WORKER_HEARTBEAT_INTERVAL) || 10000, // Worker 心跳发送间隔(ms)
      checkInterval: parseInt(process.env.WORKER_HEARTBEAT_CHECK_INTERVAL) || 15000, // Master 检查心跳间隔(ms)
    },

    // 账号状态上报
    accountStatus: {
      reportInterval: parseInt(process.env.ACCOUNT_STATUS_REPORT_INTERVAL) || 60000,  // 账号状态上报间隔(ms) - 1分钟
      batchSize: parseInt(process.env.ACCOUNT_STATUS_BATCH_SIZE) || 50,  // 批量上报最大账号数
    },

    // 任务分配
    assignment: {
      maxAccountsPerWorker: parseInt(process.env.MAX_ACCOUNTS_PER_WORKER) || 10,  // 每个 Worker 最多承载账号数
      reassignDelayOnOffline: parseInt(process.env.REASSIGN_DELAY) || 5000,  // Worker 离线后重新分配延迟(ms)
    },
  },

  // ============================================
  // 爬虫配置
  // ============================================
  crawler: {
    // 监控间隔（随机范围，防止被检测）
    monitorInterval: {
      min: parseInt(process.env.MONITOR_INTERVAL_MIN) || 15000,   // 最小监控间隔(ms) - 15秒
      max: parseInt(process.env.MONITOR_INTERVAL_MAX) || 30000,   // 最大监控间隔(ms) - 30秒
      default: parseInt(process.env.MONITOR_INTERVAL_DEFAULT) || 30000,  // 默认监控间隔(ms)
    },

    // 重试策略
    retry: {
      maxRetries: parseInt(process.env.CRAWLER_MAX_RETRIES) || 3,  // 最大重试次数
      retryDelay: parseInt(process.env.CRAWLER_RETRY_DELAY) || 5000,  // 重试延迟(ms)
      backoffMultiplier: parseFloat(process.env.CRAWLER_BACKOFF_MULTIPLIER) || 2,  // 退避倍数
    },

    // 超时设置
    timeout: {
      page: parseInt(process.env.CRAWLER_PAGE_TIMEOUT) || 30000,  // 页面加载超时(ms)
      navigation: parseInt(process.env.CRAWLER_NAV_TIMEOUT) || 30000,  // 导航超时(ms)
      element: parseInt(process.env.CRAWLER_ELEMENT_TIMEOUT) || 10000,  // 元素查找超时(ms)
    },

    // 反爬虫设置
    antiBot: {
      randomDelay: {
        min: parseInt(process.env.ANTI_BOT_DELAY_MIN) || 1000,  // 操作间随机延迟最小值(ms)
        max: parseInt(process.env.ANTI_BOT_DELAY_MAX) || 3000,  // 操作间随机延迟最大值(ms)
      },
      userAgentRotation: process.env.ANTI_BOT_UA_ROTATION === 'true',  // 是否轮换 User-Agent
      proxyRotation: process.env.ANTI_BOT_PROXY_ROTATION === 'true',  // 是否轮换代理
    },
  },

  // ============================================
  // 浏览器配置
  // ============================================
  browser: {
    headless: process.env.BROWSER_HEADLESS !== 'false',  // 默认 headless 模式
    dataDir: process.env.BROWSER_DATA_DIR || path.join(__dirname, '../../../worker/data/browser'),
    fingerprintDir: process.env.FINGERPRINT_DIR || path.join(__dirname, '../../../worker/data/browser/fingerprints'),
    screenshotDir: process.env.SCREENSHOT_DIR || path.join(__dirname, '../../../worker/data/browser/screenshots'),

    // 浏览器启动参数
    launchOptions: {
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    },

    // 资源限制
    resources: {
      maxBrowsersPerWorker: parseInt(process.env.MAX_BROWSERS_PER_WORKER) || 10,  // 每个 Worker 最多浏览器进程数
      memoryLimitMB: parseInt(process.env.BROWSER_MEMORY_LIMIT_MB) || 200,  // 单个浏览器内存限制(MB)
    },
  },

  // ============================================
  // 登录配置
  // ============================================
  login: {
    qrCode: {
      refreshInterval: parseInt(process.env.QR_REFRESH_INTERVAL) || 2000,  // 二维码状态刷新间隔(ms)
      expiryTime: parseInt(process.env.QR_EXPIRY_TIME) || 300000,  // 二维码过期时间(ms) - 5分钟
      maxPollingAttempts: parseInt(process.env.QR_MAX_POLLING) || 150,  // 最大轮询次数
    },

    session: {
      cleanupInterval: parseInt(process.env.LOGIN_SESSION_CLEANUP_INTERVAL) || 60000,  // 登录会话清理间隔(ms) - 1分钟
      maxConcurrentLogins: parseInt(process.env.MAX_CONCURRENT_LOGINS) || 5,  // 最大并发登录数
    },

    cookie: {
      validityDays: parseInt(process.env.COOKIE_VALIDITY_DAYS) || 30,  // Cookie 有效期(天)
      checkInterval: parseInt(process.env.COOKIE_CHECK_INTERVAL) || 86400000,  // Cookie 检查间隔(ms) - 1天
    },
  },

  // ============================================
  // 通知配置
  // ============================================
  notification: {
    queue: {
      processInterval: parseInt(process.env.NOTIFICATION_PROCESS_INTERVAL) || 1000,  // 通知队列处理间隔(ms)
      batchSize: parseInt(process.env.NOTIFICATION_BATCH_SIZE) || 10,  // 批量处理通知数量
      maxRetries: parseInt(process.env.NOTIFICATION_MAX_RETRIES) || 3,  // 最大重试次数
    },

    // 通知优先级
    priority: {
      high: ['direct_message'],  // 高优先级消息类型
      normal: ['comment'],  // 普通优先级消息类型
      low: [],  // 低优先级消息类型
    },
  },

  // ============================================
  // 任务调度配置
  // ============================================
  scheduler: {
    interval: parseInt(process.env.SCHEDULER_INTERVAL) || 60000,  // 任务调度间隔(ms) - 1分钟
    rebalanceInterval: parseInt(process.env.SCHEDULER_REBALANCE_INTERVAL) || 300000,  // 负载均衡间隔(ms) - 5分钟
    taskTimeout: parseInt(process.env.TASK_TIMEOUT) || 120000,  // 任务执行超时(ms) - 2分钟
  },

  // ============================================
  // 日志配置
  // ============================================
  logging: {
    level: process.env.LOG_LEVEL || 'info',  // 日志级别: error, warn, info, debug
    dir: process.env.LOG_DIR || path.join(__dirname, '../../logs'),
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 30,  // 最大日志文件数
    maxSize: process.env.LOG_MAX_SIZE || '20m',  // 单个日志文件最大大小
  },

  // ============================================
  // 性能监控配置
  // ============================================
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    metricsInterval: parseInt(process.env.METRICS_INTERVAL) || 60000,  // 性能指标采集间隔(ms) - 1分钟
    alertThresholds: {
      cpuUsage: parseFloat(process.env.ALERT_CPU_THRESHOLD) || 80,  // CPU 使用率告警阈值(%)
      memoryUsage: parseFloat(process.env.ALERT_MEMORY_THRESHOLD) || 80,  // 内存使用率告警阈值(%)
      errorRate: parseFloat(process.env.ALERT_ERROR_RATE) || 0.1,  // 错误率告警阈值
    },
  },

  // ============================================
  // Socket.IO 配置
  // ============================================
  socketIO: {
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT) || 20000,  // Ping 超时(ms)
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL) || 10000,  // Ping 间隔(ms)
    maxHttpBufferSize: parseInt(process.env.SOCKET_MAX_BUFFER_SIZE) || 1e8,  // 最大缓冲区大小(bytes)
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
    },
  },
};

// 辅助函数：获取随机监控间隔
config.getRandomMonitorInterval = function() {
  const { min, max } = config.crawler.monitorInterval;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// 辅助函数：获取随机反爬虫延迟
config.getRandomAntiDelay = function() {
  const { min, max } = config.crawler.antiBot.randomDelay;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// 辅助函数：计算重试延迟（指数退避）
config.getRetryDelay = function(attemptNumber) {
  const { retryDelay, backoffMultiplier } = config.crawler.retry;
  return retryDelay * Math.pow(backoffMultiplier, attemptNumber - 1);
};

// 导出配置
module.exports = config;
