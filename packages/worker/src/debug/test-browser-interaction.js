#!/usr/bin/env node

/**
 * 浏览器交互测试脚本
 * 用于测试浏览器通过 MCP WebSocket 与系统的交互能力
 *
 * 使用方法:
 *   node test-browser-interaction.js
 *
 * 该脚本会:
 * 1. 连接到 MCP WebSocket 服务
 * 2. 定期发送测试事件
 * 3. 监控 MCP 状态
 * 4. 显示浏览器与 MCP 的通信日志
 */

const WebSocket = require('ws');
const http = require('http');

const MCP_URL = 'ws://localhost:9222';
const API_BASE = 'http://127.0.0.1:9222/api';
const ACCOUNT_ID = 'test-account-123';

let ws = null;
let testRunning = false;
let eventCounter = 0;

console.log('\n╔═══════════════════════════════════════════╗');
console.log('║  🔌 浏览器交互测试 (Node.js 客户端)     ║');
console.log('╚═══════════════════════════════════════════╝\n');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message, color = 'reset', prefix = '📝') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] ${prefix} ${colors[color]}${message}${colors.reset}`);
}

function queryMCPStatus() {
  return new Promise((resolve) => {
    const req = http.get(`${API_BASE}/status`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
  });
}

function queryMCPLogs() {
  return new Promise((resolve) => {
    const req = http.get(`${API_BASE}/logs`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
  });
}

async function connectToMCP() {
  return new Promise((resolve) => {
    try {
      log(`正在连接到 MCP WebSocket: ${MCP_URL}`, 'cyan', '🔌');

      ws = new WebSocket(MCP_URL);

      ws.on('open', () => {
        log('✅ WebSocket 已连接!', 'green', '✅');

        // 发送注册消息
        const registerMsg = {
          type: 'register',
          accountId: ACCOUNT_ID,
          capabilities: ['navigation', 'events', 'logging'],
          clientType: 'test-node-client'
        };

        ws.send(JSON.stringify(registerMsg));
        log(`已发送注册消息`, 'blue', '📤');

        resolve(true);
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          log(`收到消息: ${JSON.stringify(msg).substring(0, 80)}...`, 'cyan', '📥');
        } catch (e) {
          log(`收到原始数据: ${data}`, 'dim', '📥');
        }
      });

      ws.on('error', (error) => {
        log(`❌ WebSocket 错误: ${error.message}`, 'red', '❌');
        resolve(false);
      });

      ws.on('close', () => {
        log('❌ WebSocket 已断开', 'red', '❌');
      });

      // 5秒超时
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          log('❌ 连接超时', 'red', '⏱️');
          resolve(false);
        }
      }, 5000);

    } catch (error) {
      log(`❌ 连接异常: ${error.message}`, 'red', '❌');
      resolve(false);
    }
  });
}

function sendTestMessage(eventType = 'test_click') {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    log('⚠️ WebSocket 未连接', 'yellow', '⚠️');
    return false;
  }

  eventCounter++;
  const msg = {
    type: 'event',
    accountId: ACCOUNT_ID,
    event: eventType,
    content: `测试事件 #${eventCounter}: ${eventType}`,
    timestamp: Date.now()
  };

  ws.send(JSON.stringify(msg));
  log(`已发送 ${eventType} 事件 (#${eventCounter})`, 'blue', '📤');
  return true;
}

function sendNavigationEvent(fromUrl, toUrl, description) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    log('⚠️ WebSocket 未连接', 'yellow', '⚠️');
    return false;
  }

  eventCounter++;
  const msg = {
    type: 'event',
    accountId: ACCOUNT_ID,
    event: 'navigation',
    content: {
      from: fromUrl,
      to: toUrl,
      description: description
    },
    timestamp: Date.now()
  };

  ws.send(JSON.stringify(msg));
  log(`已发送导航事件: ${fromUrl} → ${toUrl}`, 'blue', '📤');
  return true;
}

async function displayMCPStatus() {
  log('\n📊 查询 MCP 状态...', 'cyan', '📊');

  const status = await queryMCPStatus();
  if (!status) {
    log('❌ 无法获取 MCP 状态', 'red', '❌');
    return;
  }

  console.log(`\n${colors.bright}Worker 状态:${colors.reset}`);
  console.log(`  ID: ${status.worker.id}`);
  console.log(`  状态: ${status.worker.status}`);
  console.log(`  运行时长: ${Math.floor(status.worker.uptime / 1000)}s`);

  console.log(`\n${colors.bright}账户信息:${colors.reset}`);
  const accountCount = Object.keys(status.accounts).length;
  console.log(`  已初始化: ${accountCount} 个账户`);

  if (accountCount > 0) {
    for (const [accountId, info] of Object.entries(status.accounts)) {
      console.log(`  - ${accountId}: ${info.status || 'unknown'}`);
    }
  }

  console.log(`\n${colors.bright}浏览器事件:${colors.reset}`);
  console.log(`  记录总数: ${status.browserEvents.length} 个`);
  if (status.browserEvents.length > 0) {
    console.log(`  最近 3 个事件:`);
    status.browserEvents.slice(-3).forEach((event, idx) => {
      console.log(`    ${idx + 1}. ${event.type}: ${event.accountId}`);
    });
  }
}

async function displayMCPLogs() {
  log('\n📋 查询 MCP 日志...', 'cyan', '📋');

  const logsData = await queryMCPLogs();
  if (!logsData || logsData.logs.length === 0) {
    log('(暂无日志)', 'dim', '📭');
    return;
  }

  console.log(`\n${colors.bright}最近 5 条日志:${colors.reset}`);
  logsData.logs.slice(-5).forEach((logEntry, idx) => {
    console.log(`  ${idx + 1}. ${logEntry.timestamp}: ${logEntry.message}`);
  });
}

async function runTests() {
  testRunning = true;

  // 测试 1: 连接
  log('\n【测试 1】WebSocket 连接', 'bright', '🧪');
  const connected = await connectToMCP();
  if (!connected) {
    log('❌ 测试失败: 无法连接到 MCP', 'red', '❌');
    return;
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  // 测试 2: 发送测试消息
  log('\n【测试 2】发送测试消息', 'bright', '🧪');
  for (let i = 0; i < 3; i++) {
    sendTestMessage(`test_event_${i + 1}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  // 测试 3: 发送导航事件
  log('\n【测试 3】发送导航事件', 'bright', '🧪');
  sendNavigationEvent(
    'file:///E:/HISCRM-IM-main/packages/worker/src/debug/test-mcp-browser-client.html',
    'https://creator.douyin.com/creator-micro/data/following/chat',
    '导航到抖音私信页面'
  );

  await new Promise(resolve => setTimeout(resolve, 2000));

  // 显示 MCP 状态
  await displayMCPStatus();

  // 显示 MCP 日志
  await displayMCPLogs();

  log('\n✅ 测试完成', 'green', '✅');
  testRunning = false;
}

// 主程序
async function main() {
  try {
    await runTests();

    // 保持连接 10 秒后退出
    log('\n⏳ 保持连接 10 秒以接收任何服务器消息...', 'yellow', '⏳');
    await new Promise(resolve => setTimeout(resolve, 10000));

    if (ws) {
      ws.close();
    }

    log('\n👋 测试完成，退出', 'green', '👋');
    process.exit(0);
  } catch (error) {
    log(`❌ 主程序错误: ${error.message}`, 'red', '❌');
    process.exit(1);
  }
}

// 处理中断信号
process.on('SIGINT', () => {
  log('\n🛑 收到中断信号，正在关闭...', 'yellow', '🛑');
  if (ws) {
    ws.close();
  }
  process.exit(0);
});

main();
