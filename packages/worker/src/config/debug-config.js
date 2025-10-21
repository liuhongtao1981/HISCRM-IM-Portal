/**
 * Debug 模式配置
 * 用于开发调试，启用 MCP 接口和单账户模式
 *
 * 启用方式：
 * 命令行: DEBUG=true npm start:worker
 * 或设置环境变量: set DEBUG=true && npm start:worker
 */

const path = require('path');

module.exports = {
  /**
   * Debug 模式开启
   */
  enabled: process.env.DEBUG === 'true',

  /**
   * MCP (监控面板) 配置
   */
  mcp: {
    enabled: process.env.DEBUG_MCP === 'true' || process.env.DEBUG === 'true',
    port: parseInt(process.env.MCP_PORT || '9222', 10),
    host: process.env.MCP_HOST || 'localhost',
  },

  /**
   * 单账户模式 (Debug 时只启动一个 worker，只监控一个账户)
   */
  singleAccount: {
    enabled: process.env.DEBUG === 'true',
    maxAccounts: 1,
    maxBrowsersPerWorker: 1,
  },

  /**
   * Browser 调试配置
   */
  browser: {
    // Debug 模式下禁用 headless，便于观察浏览器行为
    headless: process.env.DEBUG_HEADLESS === 'true' ? true : false,
    // 由 Master 通过 DEBUG_DEVTOOLS 环境变量控制（默认不启用）
    devtools: process.env.DEBUG_DEVTOOLS === 'true',
    // 减少日志详细度
    verbose: process.env.DEBUG_VERBOSE === 'true',
  },

  /**
   * 网络配置
   */
  network: {
    // Debug 时禁用代理
    proxy: process.env.DEBUG === 'true' ? null : undefined,
    // 增加超时时间便于调试
    timeout: process.env.DEBUG === 'true' ? 60000 : 30000,
  },

  /**
   * 日志配置
   */
  logging: {
    // Debug 时显示详细日志
    level: process.env.DEBUG === 'true' ? 'debug' : 'info',
    // 保存日志到文件
    file: process.env.DEBUG_LOG_FILE === 'true',
  },

  /**
   * 监控间隔
   */
  monitoring: {
    // Debug 时更长的间隔便于观察
    interval: process.env.DEBUG === 'true' ? 60000 : 15000, // 默认 60 秒
  },

  /**
   * 打印 Debug 信息
   */
  print() {
    if (this.enabled) {
      console.log('\n╔═══════════════════════════════════════════╗');
      console.log('║         🔍 DEBUG MODE ENABLED             ║');
      console.log('╠═══════════════════════════════════════════╣');
      console.log(`║ MCP 接口: ${this.mcp.enabled ? '✅ 启用' : '❌ 禁用'} (端口 ${this.mcp.port})`);
      console.log(`║ 单账户模式: ${this.singleAccount.enabled ? '✅ 启用' : '❌ 禁用'} (最多 ${this.singleAccount.maxAccounts} 个)`);
      console.log(`║ Headless: ${this.browser.headless ? '❌' : '✅ 禁用 (显示浏览器窗口)'}`);
      console.log(`║ 日志级别: ${this.logging.level}`);
      console.log(`║ 监控间隔: ${this.monitoring.interval / 1000} 秒`);
      console.log('╚═══════════════════════════════════════════╝\n');
    }
  },
};
