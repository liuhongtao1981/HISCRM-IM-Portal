/**
 * IM API 集成测试
 * 测试 crm-pc-im 客户端连接到 Master 的 /api/im 接口
 *
 * 运行方式：
 *   node tests/test-im-api-integration.js
 *
 * 前置条件：
 *   - Master 服务器运行在 localhost:3000
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000/api/im';

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/**
 * 日志辅助函数
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'cyan');
}

function logSection(message) {
  log(`\n═══ ${message} ═══`, 'blue');
}

/**
 * 通用 API 请求
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  logInfo(`请求: ${options.method || 'GET'} ${endpoint}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logError(`请求失败: ${error.message}`);
    throw error;
  }
}

/**
 * 测试：健康检查
 */
async function testHealth() {
  logSection('测试 1: 健康检查');

  try {
    const response = await request('/health');

    if (response.status_code === 0) {
      logSuccess('健康检查通过');
      logInfo(`  版本: ${response.data.version}`);
      logInfo(`  状态: ${response.data.status}`);
      return true;
    } else {
      logError(`健康检查失败: status_code=${response.status_code}`);
      return false;
    }
  } catch (error) {
    logError(`健康检查异常: ${error.message}`);
    return false;
  }
}

/**
 * 测试：获取版本信息
 */
async function testVersion() {
  logSection('测试 2: 获取版本信息');

  try {
    const response = await request('/version');

    if (response.status_code === 0) {
      logSuccess('版本信息获取成功');
      logInfo(`  API 版本: ${response.data.api_version}`);
      logInfo(`  兼容性: ${response.data.compatibility}`);
      logInfo(`  支持平台: ${response.data.supported_platforms.join(', ')}`);
      return true;
    } else {
      logError(`版本信息获取失败: status_code=${response.status_code}`);
      return false;
    }
  } catch (error) {
    logError(`版本信息获取异常: ${error.message}`);
    return false;
  }
}

/**
 * 测试：获取账户列表
 */
async function testGetAccounts() {
  logSection('测试 3: 获取账户列表');

  try {
    const response = await request('/accounts?count=10');

    if (response.status_code === 0) {
      const users = response.data.users || [];
      logSuccess(`账户列表获取成功: 共 ${users.length} 个账户`);

      if (users.length > 0) {
        const firstUser = users[0];
        logInfo(`  第一个账户: ${firstUser.user_name} (${firstUser.user_id})`);
        logInfo(`    头像: ${firstUser.avatar}`);
        logInfo(`    状态: ${firstUser.status}`);
        logInfo(`    平台: ${firstUser.platform || 'unknown'}`);
      }

      logInfo(`  分页信息: cursor=${response.cursor}, has_more=${response.has_more}`);
      return true;
    } else {
      logError(`账户列表获取失败: status_code=${response.status_code}`);
      return false;
    }
  } catch (error) {
    logError(`账户列表获取异常: ${error.message}`);
    return false;
  }
}

/**
 * 测试：创建账户
 */
async function testCreateAccount() {
  logSection('测试 4: 创建账户');

  const testAccount = {
    user_id: `test_user_${Date.now()}`,
    user_name: '测试用户',
    avatar: 'https://via.placeholder.com/150',
    signature: '这是一个测试账户',
    verified: false,
    follower_count: 0,
    status: 'active',
    platform: 'douyin',
  };

  try {
    const response = await request('/accounts', {
      method: 'POST',
      body: JSON.stringify(testAccount),
    });

    if (response.status_code === 0) {
      logSuccess(`账户创建成功: ${response.data.user_name} (${response.data.user_id})`);
      logInfo(`  创建时间: ${new Date(response.data.created_at).toLocaleString()}`);
      return response.data.user_id; // 返回账户 ID 供后续测试使用
    } else {
      logError(`账户创建失败: status_code=${response.status_code}`);
      return null;
    }
  } catch (error) {
    logError(`账户创建异常: ${error.message}`);
    return null;
  }
}

/**
 * 测试：获取单个账户
 */
async function testGetAccount(userId) {
  logSection('测试 5: 获取单个账户');

  if (!userId) {
    log('  跳过（没有账户 ID）', 'yellow');
    return false;
  }

  try {
    const response = await request(`/accounts/${userId}`);

    if (response.status_code === 0) {
      logSuccess(`账户获取成功: ${response.data.user_name}`);
      logInfo(`  用户ID: ${response.data.user_id}`);
      logInfo(`  状态: ${response.data.status}`);
      return true;
    } else if (response.status_code === 404) {
      logError('账户不存在');
      return false;
    } else {
      logError(`账户获取失败: status_code=${response.status_code}`);
      return false;
    }
  } catch (error) {
    logError(`账户获取异常: ${error.message}`);
    return false;
  }
}

/**
 * 测试：获取会话列表
 */
async function testGetConversations() {
  logSection('测试 6: 获取会话列表');

  try {
    const response = await request('/conversations?count=10');

    if (response.status_code === 0) {
      const conversations = response.data.conversations || [];
      logSuccess(`会话列表获取成功: 共 ${conversations.length} 个会话`);

      if (conversations.length > 0) {
        const firstConv = conversations[0];
        logInfo(`  第一个会话: ${firstConv.conversation_id}`);
        logInfo(`    对方: ${firstConv.participant.user_name}`);
        logInfo(`    未读数: ${firstConv.unread_count}`);
        if (firstConv.last_message) {
          logInfo(`    最后消息: ${firstConv.last_message.content.substring(0, 30)}...`);
        }
      }

      return true;
    } else {
      logError(`会话列表获取失败: status_code=${response.status_code}`);
      return false;
    }
  } catch (error) {
    logError(`会话列表获取异常: ${error.message}`);
    return false;
  }
}

/**
 * 测试：获取消息列表
 */
async function testGetMessages() {
  logSection('测试 7: 获取消息列表');

  try {
    const response = await request('/messages?count=10');

    if (response.status_code === 0) {
      const messages = response.data.messages || [];
      logSuccess(`消息列表获取成功: 共 ${messages.length} 条消息`);

      if (messages.length > 0) {
        const firstMsg = messages[0];
        logInfo(`  第一条消息: ${firstMsg.msg_id}`);
        logInfo(`    发送者: ${firstMsg.sender.user_name}`);
        logInfo(`    接收者: ${firstMsg.receiver.user_name}`);
        logInfo(`    内容: ${firstMsg.content.substring(0, 50)}...`);
        logInfo(`    类型: ${firstMsg.msg_type}`);
        logInfo(`    状态: ${firstMsg.status}`);
      }

      return true;
    } else {
      logError(`消息列表获取失败: status_code=${response.status_code}`);
      return false;
    }
  } catch (error) {
    logError(`消息列表获取异常: ${error.message}`);
    return false;
  }
}

/**
 * 主测试流程
 */
async function runTests() {
  log('\n╔═══════════════════════════════════════════════╗', 'cyan');
  log('║  IM API 集成测试 - crm-pc-im ↔ Master       ║', 'cyan');
  log('╚═══════════════════════════════════════════════╝\n', 'cyan');

  logInfo(`测试目标: ${BASE_URL}`);
  logInfo(`开始时间: ${new Date().toLocaleString()}\n`);

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
  };

  // 运行所有测试
  const tests = [
    { name: '健康检查', fn: testHealth },
    { name: '版本信息', fn: testVersion },
    { name: '获取账户列表', fn: testGetAccounts },
    { name: '创建账户', fn: testCreateAccount },
    { name: '获取会话列表', fn: testGetConversations },
    { name: '获取消息列表', fn: testGetMessages },
  ];

  let createdUserId = null;

  for (const test of tests) {
    results.total++;

    try {
      const result = await test.fn(createdUserId);

      // 保存创建的账户 ID
      if (test.name === '创建账户' && result) {
        createdUserId = result;
      }

      if (result) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      results.failed++;
      logError(`测试异常: ${error.message}`);
    }

    // 测试间隔
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 如果创建了账户，测试获取单个账户
  if (createdUserId) {
    results.total++;
    const result = await testGetAccount(createdUserId);
    if (result) {
      results.passed++;
    } else {
      results.failed++;
    }
  }

  // 输出测试结果
  logSection('测试结果汇总');
  log(`总计: ${results.total}`, 'blue');
  logSuccess(`通过: ${results.passed}`);
  if (results.failed > 0) {
    logError(`失败: ${results.failed}`);
  }

  const successRate = ((results.passed / results.total) * 100).toFixed(2);
  log(`\n成功率: ${successRate}%`, successRate === '100.00' ? 'green' : 'yellow');

  logInfo(`\n结束时间: ${new Date().toLocaleString()}\n`);

  // 退出码
  process.exit(results.failed > 0 ? 1 : 0);
}

// 运行测试
runTests().catch(error => {
  logError(`\n测试运行失败: ${error.message}`);
  console.error(error);
  process.exit(1);
});
