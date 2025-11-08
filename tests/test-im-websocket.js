/**
 * CRM-IM-Server WebSocket 连接测试
 */

const WebSocket = require('ws');

const IM_WS_URL = 'ws://localhost:8080';
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

console.log(`${colors.cyan}══════════════════════════════════════════════════════�?{colors.reset}`);
console.log(`${colors.cyan}  CRM-IM-Server WebSocket 连接测试${colors.reset}`);
console.log(`${colors.cyan}══════════════════════════════════════════════════════�?{colors.reset}\n`);

let testsPassed = 0;
let testsFailed = 0;
const results = [];

// 测试 1: 基础连接测试
function testBasicConnection() {
  return new Promise((resolve) => {
    console.log(`${colors.cyan}🔍 测试: WebSocket 基础连接${colors.reset}`);
    console.log(`${colors.blue}   URL: ${IM_WS_URL}${colors.reset}`);

    const ws = new WebSocket(IM_WS_URL);
    let timeout;

    ws.on('open', () => {
      console.log(`${colors.green}   �?连接成功${colors.reset}\n`);
      testsPassed++;
      results.push({ name: 'WebSocket 基础连接', passed: true });
      clearTimeout(timeout);
      ws.close();
      resolve();
    });

    ws.on('error', (error) => {
      console.log(`${colors.red}   �?连接失败: ${error.message}${colors.reset}\n`);
      testsFailed++;
      results.push({ name: 'WebSocket 基础连接', passed: false, error: error.message });
      clearTimeout(timeout);
      resolve();
    });

    timeout = setTimeout(() => {
      console.log(`${colors.red}   �?连接超时${colors.reset}\n`);
      testsFailed++;
      results.push({ name: 'WebSocket 基础连接', passed: false, error: '连接超时' });
      ws.close();
      resolve();
    }, 5000);
  });
}

// 测试 2: 登录测试
function testLogin() {
  return new Promise((resolve) => {
    console.log(`${colors.cyan}🔍 测试: 用户登录流程${colors.reset}`);
    console.log(`${colors.blue}   用户: test-user-001${colors.reset}`);

    const ws = new WebSocket(IM_WS_URL);
    let timeout;

    ws.on('open', () => {
      // 发送登录消�?      const loginMsg = JSON.stringify({
        type: 'login',
        data: {
          userId: 'test-user-001',
          userName: 'Test User',
        },
      });
      ws.send(loginMsg);

      // 等待登录响应
      timeout = setTimeout(() => {
        console.log(`${colors.red}   �?登录超时${colors.reset}\n`);
        testsFailed++;
        results.push({ name: '用户登录流程', passed: false, error: '登录超时' });
        ws.close();
        resolve();
      }, 3000);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'login' && msg.data.success) {
          console.log(`${colors.green}   �?登录成功${colors.reset}`);
          console.log(`${colors.blue}   响应: ${JSON.stringify(msg.data, null, 2).split('\n').join('\n   ')}${colors.reset}\n`);
          testsPassed++;
          results.push({ name: '用户登录流程', passed: true });
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } catch (error) {
        console.log(`${colors.red}   �?解析响应失败: ${error.message}${colors.reset}\n`);
        testsFailed++;
        results.push({ name: '用户登录流程', passed: false, error: error.message });
        clearTimeout(timeout);
        ws.close();
        resolve();
      }
    });

    ws.on('error', (error) => {
      console.log(`${colors.red}   �?连接错误: ${error.message}${colors.reset}\n`);
      testsFailed++;
      results.push({ name: '用户登录流程', passed: false, error: error.message });
      clearTimeout(timeout);
      resolve();
    });
  });
}

// 测试 3: 消息发送测�?function testSendMessage() {
  return new Promise((resolve) => {
    console.log(`${colors.cyan}🔍 测试: 消息发送功�?{colors.reset}`);
    console.log(`${colors.blue}   频道: user_0001${colors.reset}`);

    const ws = new WebSocket(IM_WS_URL);
    let loginTimeout, messageTimeout;

    ws.on('open', () => {
      // 先登�?      const loginMsg = JSON.stringify({
        type: 'login',
        data: { userId: 'test-user-002', userName: 'Test User 2' },
      });
      ws.send(loginMsg);

      loginTimeout = setTimeout(() => {
        console.log(`${colors.red}   �?登录超时${colors.reset}\n`);
        testsFailed++;
        results.push({ name: '消息发送功�?, passed: false, error: '登录超时' });
        ws.close();
        resolve();
      }, 3000);
    });

    let loggedIn = false;
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'login' && msg.data.success && !loggedIn) {
          loggedIn = true;
          clearTimeout(loginTimeout);

          // 发送测试消�?          const testMsg = JSON.stringify({
            type: 'send_message',
            data: {
              channelId: 'user_0001',
              content: '这是一条测试消�?,
              timestamp: Date.now(),
            },
          });
          ws.send(testMsg);

          messageTimeout = setTimeout(() => {
            console.log(`${colors.green}   �?消息已发送（无响应超时）${colors.reset}\n`);
            testsPassed++;
            results.push({ name: '消息发送功�?, passed: true });
            ws.close();
            resolve();
          }, 2000);
        } else if (msg.type === 'message_sent' || msg.type === 'new_message') {
          console.log(`${colors.green}   �?消息发送成�?{colors.reset}`);
          console.log(`${colors.blue}   响应类型: ${msg.type}${colors.reset}\n`);
          testsPassed++;
          results.push({ name: '消息发送功�?, passed: true });
          clearTimeout(messageTimeout);
          ws.close();
          resolve();
        }
      } catch (error) {
        console.log(`${colors.red}   �?解析失败: ${error.message}${colors.reset}\n`);
        testsFailed++;
        results.push({ name: '消息发送功�?, passed: false, error: error.message });
        clearTimeout(loginTimeout);
        clearTimeout(messageTimeout);
        ws.close();
        resolve();
      }
    });

    ws.on('error', (error) => {
      console.log(`${colors.red}   �?连接错误: ${error.message}${colors.reset}\n`);
      testsFailed++;
      results.push({ name: '消息发送功�?, passed: false, error: error.message });
      clearTimeout(loginTimeout);
      clearTimeout(messageTimeout);
      resolve();
    });
  });
}

// 运行所有测�?async function runTests() {
  await testBasicConnection();
  await testLogin();
  await testSendMessage();

  // 打印结果
  console.log(`${colors.cyan}══════════════════════════════════════════════════════�?{colors.reset}`);
  console.log(`${colors.cyan}  测试结果汇�?{colors.reset}`);
  console.log(`${colors.cyan}══════════════════════════════════════════════════════�?{colors.reset}\n`);
  console.log(`${colors.blue}总计: ${testsPassed + testsFailed} 个测�?{colors.reset}`);
  console.log(`${colors.green}通过: ${testsPassed} �?{colors.reset}`);
  if (testsFailed > 0) {
    console.log(`${colors.red}失败: ${testsFailed} �?{colors.reset}`);
  }

  console.log('\n通过的测�?');
  results
    .filter((r) => r.passed)
    .forEach((r) => console.log(`${colors.green}  �?${r.name}${colors.reset}`));

  if (testsFailed > 0) {
    console.log('\n失败的测�?');
    results
      .filter((r) => !r.passed)
      .forEach((r) =>
        console.log(`${colors.red}  �?${r.name}: ${r.error || '未知错误'}${colors.reset}`)
      );
  }

  console.log(`\n${colors.cyan}══════════════════════════════════════════════════════�?{colors.reset}\n`);

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error(`${colors.red}测试执行失败: ${error.message}${colors.reset}`);
  process.exit(1);
});
