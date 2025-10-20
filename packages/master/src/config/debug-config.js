/**
 * Master Debug 模式配置
 * 用于开发调试，启用单 Worker 模式和自动启动 Worker
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.debug') });

module.exports = {
  /**
   * Debug 模式开启
   */
  enabled: process.env.DEBUG === 'true',

  /**
   * 单 Worker 模式 (Debug 时只启动一个 worker)
   */
  singleWorker: {
    enabled: process.env.DEBUG === 'true',
    maxWorkers: 1,
    autoStart: process.env.DEBUG_AUTO_START === 'true' || process.env.DEBUG === 'true',
  },

  /**
   * Worker 启动配置
   */
  worker: {
    // Worker 启动命令
    command: process.env.WORKER_COMMAND || 'npm run start:worker',

    // Worker 环境变量
    env: {
      DEBUG: process.env.DEBUG,
      DEBUG_MCP: process.env.DEBUG_MCP === 'true' || process.env.DEBUG === 'true',
      MCP_PORT: process.env.MCP_PORT || '9222',
      DEBUG_HEADLESS: process.env.DEBUG_HEADLESS,
      DEBUG_VERBOSE: process.env.DEBUG_VERBOSE,
      DEBUG_LOG_FILE: process.env.DEBUG_LOG_FILE,
    },

    // Worker 启动超时
    startupTimeout: 30000, // 30 秒

    // 监听 Worker 输出
    logOutput: process.env.DEBUG === 'true',
  },

  /**
   * 账户管理配置
   */
  accounts: {
    // Debug 时自动分配账户到 Worker (如果有的话)
    autoAssign: process.env.DEBUG === 'true',
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
    level: process.env.DEBUG === 'true' ? 'debug' : 'info',
    showWorkerLogs: process.env.DEBUG === 'true',
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
