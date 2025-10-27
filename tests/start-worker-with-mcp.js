/**
 * 启动 Worker 并开启 Chrome DevTools MCP 调试
 * 用于验证和重新设计爬虫逻辑
 */

const path = require('path');
const ChromeDevToolsMCP = require('../packages/worker/src/debug/chrome-devtools-mcp');
const { createLogger } = require('../packages/shared/utils/logger');

const logger = createLogger('worker-mcp-test');

async function startWorkerWithMCP() {
  const workerId = process.env.WORKER_ID || 'test-worker-mcp';
  const mcpPort = process.env.MCP_PORT || 9222;

  logger.info('====================================');
  logger.info('启动 Worker + Chrome DevTools MCP');
  logger.info('====================================');
  logger.info('');
  logger.info(`Worker ID: ${workerId}`);
  logger.info(`MCP 端口: ${mcpPort}`);
  logger.info('');

  // 启动 MCP 服务器
  const mcp = new ChromeDevToolsMCP(mcpPort);
  await mcp.start(workerId);

  logger.info('✅ Chrome DevTools MCP 已启动');
  logger.info('');
  logger.info('📊 调试面板地址:');
  logger.info(`   HTTP:  http://localhost:${mcpPort}/`);
  logger.info(`   WebSocket: ws://localhost:${mcpPort}/`);
  logger.info('');
  logger.info('🔍 可用的 API 端点:');
  logger.info(`   GET  http://localhost:${mcpPort}/api/status       - Worker 状态`);
  logger.info(`   GET  http://localhost:${mcpPort}/api/accounts     - 账户信息`);
  logger.info(`   GET  http://localhost:${mcpPort}/api/tasks        - 任务信息`);
  logger.info(`   GET  http://localhost:${mcpPort}/api/performance  - 性能数据`);
  logger.info(`   GET  http://localhost:${mcpPort}/api/logs         - 日志记录`);
  logger.info('');
  logger.info('💡 使用说明:');
  logger.info('   1. 在浏览器中打开: http://localhost:9222/');
  logger.info('   2. 查看实时监控面板');
  logger.info('   3. 使用 Playwright Inspector 连接到浏览器');
  logger.info('   4. 按 Ctrl+C 停止调试会话');
  logger.info('');
  logger.info('⚡ 现在你可以:');
  logger.info('   - 手动运行爬虫测试脚本');
  logger.info('   - 通过 MCP 面板查看实时数据');
  logger.info('   - 验证 API 拦截逻辑');
  logger.info('   - 设计新的爬虫架构');
  logger.info('');
  logger.info('====================================');
  logger.info('MCP 服务器正在运行中...');
  logger.info('====================================');

  // 添加一些测试日志
  mcp.addLog('MCP 调试服务器已启动', 'info');
  mcp.addLog(`等待 Worker 连接... (Worker ID: ${workerId})`, 'info');

  // 模拟 Worker 状态
  mcp.monitoringData.worker.status = 'ready';
  mcp.monitoringData.worker.id = workerId;

  // 保持进程运行
  process.on('SIGINT', async () => {
    logger.info('');
    logger.info('正在关闭 MCP 服务器...');
    await mcp.stop();
    logger.info('已关闭，再见！');
    process.exit(0);
  });

  // 返回 MCP 实例供外部使用
  return mcp;
}

// 如果直接运行此脚本
if (require.main === module) {
  startWorkerWithMCP().catch(error => {
    logger.error('启动失败:', error);
    process.exit(1);
  });
}

module.exports = { startWorkerWithMCP };
