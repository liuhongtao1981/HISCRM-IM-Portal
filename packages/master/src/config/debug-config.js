/**
 * Master Debug 模式配置
 * 用于开发调试，启用单 Worker 模式和自动启动 Worker
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.debug') });

// Helper to check if a value represents true (handles '1', 'true', true)
const isDebugEnabled = () => {
  const val = process.env.DEBUG;
  return val === 'true' || val === '1' || val === true;
};

module.exports = {
  /**
   * Debug 模式开启
   */
  enabled: isDebugEnabled(),

  /**
   * 单 Worker 模式 (Debug 时只启动一个 worker)
   */
  singleWorker: {
    enabled: isDebugEnabled(),
    maxWorkers: 1,
    autoStart: process.env.DEBUG_AUTO_START === 'true' || process.env.DEBUG === 'true',
  },

  /**
   * Worker 启动配置
   */
  worker: {
    // Worker 启动命令
    command: process.env.WORKER_COMMAND || 'npm run start:worker',

    // Worker 环境变量 - DEBUG 模式下自动传递
    env: {
      DEBUG: process.env.DEBUG,
      DEBUG_MCP: process.env.DEBUG_MCP === 'true' || isDebugEnabled(),
      DEBUG_LOG_LEVEL: process.env.DEBUG_LOG_LEVEL || 'debug',
      DEBUG_HEADLESS: process.env.DEBUG_HEADLESS !== 'true' ? 'false' : 'true', // 默认显示浏览器
      DEBUG_VERBOSE: process.env.DEBUG_VERBOSE,
      DEBUG_LOG_FILE: process.env.DEBUG_LOG_FILE,
    },

    // Worker 启动超时
    startupTimeout: 30000, // 30 秒

    // 监听 Worker 输出
    logOutput: process.env.DEBUG === 'true',
  },

  /**
   * 浏览器事件处理配置
   * 浏览器事件通过 Socket.IO 直接发送给 Master (端口 3000)
   * Anthropic MCP (端口 9222) 用于 Claude 实时调试浏览器
   */
  browser: {
    enabled: process.env.DEBUG_MCP === 'true' || isDebugEnabled(),
    // 浏览器事件由 Master 的 Socket.IO 处理，无需额外端口
  },

  /**
   * 账户管理配置
   */
  accounts: {
    // Debug 时自动分配账户到 Worker (如果有的话)
    autoAssign: isDebugEnabled(),
    // 最多监控 1 个账户
    maxPerWorker: 1,
  },

  /**
   * 监控配置
   */
  monitoring: {
    // Debug 时增加监控频率
    heartbeatInterval: 5000, // 5 秒检查一次 Worker 心跳
    taskTimeout: 60000, // 60 秒任务超时
  },

  /**
   * 日志配置
   */
  logging: {
    level: isDebugEnabled() ? 'debug' : 'info',
    showWorkerLogs: isDebugEnabled(),
  },

  /**
   * 打印 Debug 信息
   */
  print() {
    if (this.enabled) {
      console.log('\n╔═══════════════════════════════════════════╗');
      console.log('║      🔍 MASTER DEBUG MODE ENABLED         ║');
      console.log('╠═══════════════════════════════════════════╣');
      console.log(`║ 单 Worker 模式: ✅ 启用 (最多 ${this.singleWorker.maxWorkers} 个)`);
      console.log(`║ 自动启动 Worker: ${this.singleWorker.autoStart ? '✅ 启用' : '❌ 禁用'}`);
      console.log(`║ 心跳检查间隔: ${this.monitoring.heartbeatInterval / 1000} 秒`);
      console.log(`║ 任务超时: ${this.monitoring.taskTimeout / 1000} 秒`);
      console.log(`║ 每个 Worker 最多账户数: ${this.accounts.maxPerWorker}`);
      console.log(`║ 日志级别: ${this.logging.level}`);
      console.log('╚═══════════════════════════════════════════╝\n');
    }
  },
};
