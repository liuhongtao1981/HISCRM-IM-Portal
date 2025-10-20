/**
 * Phase 10 测试脚本：测试私信回复功能
 *
 * 流程：
 * 1. 从数据库中获取账户 ID
 * 2. 插入测试私信数据
 * 3. 通过 API 发送回复请求
 * 4. 观察 Worker 是否能正确处理并回复
 */

const http = require('http');
const Database = require('better-sqlite3');

// 配置
const MASTER_HOST = 'localhost';
const MASTER_PORT = 3000;
const DB_PATH = './data/master.db';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function log(color, prefix, message) {
  console.log(`${colors[color]}[${prefix}] ${message}${colors.reset}`);
}

/**
 * 从数据库获取账户信息
 */
function getAccountInfo() {
  const db = new Database(DB_PATH);
  try {
    const account = db.prepare('SELECT id, account_name FROM accounts LIMIT 1').get();
    db.close();
    return account;
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * 插入测试私信数据
 */
function insertTestDirectMessage(accountId) {
  const db = new Database(DB_PATH);
  try {
    const conversationId = `douyin:user_test_123:conv_test_456`;
    const platformMessageId = `msg_test_${Date.now()}`;

    const stmt = db.prepare(`
      INSERT INTO direct_messages (
        id,
        account_id,
        conversation_id,
        platform_message_id,
        platform_sender_id,
        platform_sender_name,
        platform_receiver_id,
        platform_receiver_name,
        content,
        direction,
        created_at,
        detected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Math.floor(Date.now() / 1000);

    const result = stmt.run(
      messageId,                              // id
      accountId,                              // account_id
      conversationId,                         // conversation_id (冒号分隔)
      platformMessageId,                      // platform_message_id
      'test_sender_123',                      // platform_sender_id
      'Test User',                            // platform_sender_name
      'test_receiver_456',                    // platform_receiver_id
      'Bot Account',                          // platform_receiver_name
      'Hello, this is a test message! 你好，这是一条测试消息',  // content
      'inbound',                              // direction
      now,                                    // created_at
      now                                     // detected_at
    );

    db.close();

    return {
      messageId,
      conversationId,
      platformMessageId,
      accountId
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * 发送 HTTP POST 请求
 */
function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: MASTER_HOST,
      port: MASTER_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(JSON.stringify(data)) : 0
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

/**
 * 主测试流程
 */
async function runTest() {
  log('cyan', 'TEST', '========================================');
  log('cyan', 'TEST', 'Phase 10: 私信回复 ID 处理测试');
  log('cyan', 'TEST', '========================================\n');

  try {
    // 第 1 步：获取账户信息
    log('blue', 'STEP1', '获取账户信息...');
    const account = getAccountInfo();
    if (!account) {
      log('red', 'ERROR', '数据库中没有账户，请先创建账户');
      return;
    }
    log('green', 'SUCCESS', `找到账户: ${account.account_name} (${account.id})`);

    // 第 2 步：插入测试私信数据
    log('blue', 'STEP2', '插入测试私信数据...');
    const testMessage = insertTestDirectMessage(account.id);
    log('green', 'SUCCESS', `插入私信成功:`);
    console.log(`  - Message ID: ${testMessage.messageId}`);
    console.log(`  - Conversation ID: ${testMessage.conversationId}`);
    console.log(`  - Platform Message ID: ${testMessage.platformMessageId}`);

    // 第 3 步：发送回复请求
    log('blue', 'STEP3', '发送回复请求到 Master...');
    const replyPayload = {
      account_id: account.id,
      target_id: testMessage.conversationId,           // 向后兼容
      conversation_id: testMessage.conversationId,     // Phase 9/10 新增
      platform_message_id: testMessage.platformMessageId, // Phase 10 新增
      reply_content: `自动回复测试 - ${new Date().toLocaleTimeString()}`,
      context: {
        conversation_title: 'Test Conversation',
        sender_name: 'Test User',
        message_time: new Date().toLocaleTimeString()
      }
    };

    log('yellow', 'DEBUG', `回复参数:
  - account_id: ${replyPayload.account_id}
  - target_id: ${replyPayload.target_id}
  - conversation_id: ${replyPayload.conversation_id}
  - platform_message_id: ${replyPayload.platform_message_id}
  - reply_content: ${replyPayload.reply_content}
`);

    const replyResponse = await makeRequest('POST', '/api/replies', replyPayload);

    if (replyResponse.status !== 200 && replyResponse.status !== 201) {
      log('red', 'ERROR', `API 返回错误 (${replyResponse.status})`);
      console.log(replyResponse.data);
      return;
    }

    const replyId = replyResponse.data.reply_id;
    log('green', 'SUCCESS', `回复请求已发送: ${replyId}`);

    // 第 4 步：查询回复状态
    log('blue', 'STEP4', '等待 3 秒后查询回复状态...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const statusResponse = await makeRequest('GET', `/api/replies/${replyId}`, null);

    if (statusResponse.status === 200) {
      const replyStatus = statusResponse.data;
      log('green', 'SUCCESS', `回复状态:
  - status: ${replyStatus.reply_status}
  - platform_reply_id: ${replyStatus.platform_reply_id || 'N/A'}
  - error_code: ${replyStatus.error_code || 'N/A'}
  - error_message: ${replyStatus.error_message || 'N/A'}
`);

      if (replyStatus.reply_status === 'success') {
        log('green', 'PASSED', '✅ 回复成功！Worker 已正确处理并回复了私信');
      } else if (replyStatus.reply_status === 'blocked') {
        log('yellow', 'BLOCKED', '⚠️ 回复被阻止（可能受限或需要登录）');
      } else if (replyStatus.reply_status === 'executing') {
        log('yellow', 'PENDING', '⏳ 回复正在执行中...');
      } else if (replyStatus.reply_status === 'failed') {
        log('red', 'FAILED', '❌ 回复失败');
      }
    } else {
      log('red', 'ERROR', `查询回复状态失败 (${statusResponse.status})`);
      console.log(statusResponse.data);
    }

    // 第 5 步：输出测试总结
    log('cyan', 'TEST', '\n========================================');
    log('cyan', 'TEST', '测试完成！');
    log('cyan', 'TEST', '========================================');
    log('yellow', 'INFO', `\nKey Points:
1. ✅ 已在数据库中插入测试私信
2. ✅ 已发送回复请求到 Master
3. ✅ Master 转发请求到 Worker
4. ⏳ Worker 应该已经尝试回复

预期行为 (Phase 10):
- Worker 应该接收 conversation_id (冒号分隔格式)
- normalizeConversationId() 应该提取最后部分: "conv_test_456"
- findMessageItemInVirtualList() 应该在虚拟列表中查找该消息
- 应该通过 React Fiber ID 提取、内容哈希匹配等多层机制定位消息
- 成功找到并回复消息

如果回复失败，检查：
- Worker 日志中的 ID 规范化过程
- React Fiber ID 提取是否工作
- 虚拟列表元素定位是否成功
`);

  } catch (error) {
    log('red', 'ERROR', `测试失败: ${error.message}`);
    console.error(error);
  }
}

// 运行测试
runTest().catch(console.error);
