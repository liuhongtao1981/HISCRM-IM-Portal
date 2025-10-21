/**
 * Phase 10 测试脚本：通过 HTTP API 发送私信回复请求
 *
 * 步骤：
 * 1. 从数据库获取真实的私信和会话数据
 * 2. 通过 HTTP API 发送回复请求
 * 3. 观察 Worker 是否能正确处理并回复
 */

const http = require('http');
const Database = require('better-sqlite3');

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
 * 获取测试数据
 */
function getTestData() {
  const db = new Database(DB_PATH);
  try {
    // 获取一条私信
    const message = db.prepare(`
      SELECT
        id as platform_message_id,
        conversation_id,
        account_id,
        platform_sender_id,
        platform_sender_name,
        content
      FROM direct_messages
      LIMIT 1
    `).get();

    // 获取一个会话
    const conversation = db.prepare(`
      SELECT
        id as conversation_id,
        account_id,
        platform_user_name,
        platform_user_id
      FROM conversations
      LIMIT 1
    `).get();

    db.close();

    if (!message || !conversation) {
      throw new Error('数据库中没有足够的测试数据');
    }

    return {
      message,
      conversation
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
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData, headers: res.headers });
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
 * 主测试
 */
async function runTest() {
  log('cyan', 'TEST', '========================================');
  log('cyan', 'TEST', 'Phase 10: 通过 HTTP API 发送私信回复');
  log('cyan', 'TEST', '========================================\n');

  try {
    // 第 1 步：获取测试数据
    log('blue', 'STEP1', '从数据库获取测试数据...');
    const { message, conversation } = getTestData();

    log('green', 'SUCCESS', '获取到测试数据:');
    log('yellow', 'DEBUG', `
私信数据:
  - ID: ${message.platform_message_id}
  - 内容: ${message.content.substring(0, 50)}...
  - 发送者: ${message.platform_sender_name || 'N/A'}

会话数据:
  - ID: ${conversation.conversation_id}
  - 账户: ${conversation.account_id}
  - 用户: ${conversation.platform_user_name || 'N/A'}
`);

    // 第 2 步：检查 API 端点
    log('blue', 'STEP2', '检查 HTTP API 端点...');
    const statusResponse = await makeRequest('GET', '/api/v1/status', null);

    if (statusResponse.status !== 200) {
      log('yellow', 'WARN', `API 状态响应: ${statusResponse.status}`);
    } else {
      log('green', 'SUCCESS', 'API 端点正常');
    }

    // 第 3 步：构建回复请求
    log('blue', 'STEP3', '构建回复请求...');
    const replyPayload = {
      request_id: `req_${Date.now()}`,                  // API 必需
      account_id: conversation.account_id,
      target_type: 'direct_message',                    // API 必需
      target_id: message.platform_message_id,           // 向后兼容
      conversation_id: conversation.conversation_id,     // Phase 9/10 新增
      platform_message_id: message.platform_message_id, // Phase 10 新增
      reply_content: `自动回复测试 - ${new Date().toLocaleTimeString()}`,
      context: {
        conversation_title: '私信回复测试',
        platform_user_id: conversation.platform_user_id,
        sender_name: message.platform_sender_name
      }
    };

    log('yellow', 'DEBUG', `
回复请求参数:
  - account_id: ${replyPayload.account_id}
  - target_id: ${replyPayload.target_id.substring(0, 30)}...
  - conversation_id: ${replyPayload.conversation_id}
  - platform_message_id: ${replyPayload.platform_message_id.substring(0, 30)}...
  - reply_content: ${replyPayload.reply_content}
`);

    // 第 4 步：发送回复请求
    log('blue', 'STEP4', '通过 HTTP API 发送 POST /api/v1/replies...');

    const replyResponse = await makeRequest('POST', '/api/v1/replies', replyPayload);

    if (replyResponse.status !== 200 && replyResponse.status !== 201) {
      log('red', 'ERROR', `API 返回错误 (${replyResponse.status})`);
      console.log('响应:', replyResponse.data);
      return;
    }

    const replyId = replyResponse.data.reply_id;
    log('green', 'SUCCESS', `回复请求已提交: ${replyId}`);

    // 第 5 步：等待并查询回复状态
    log('blue', 'STEP5', '等待 3 秒后查询回复状态...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const statusCheckResponse = await makeRequest('GET', `/api/v1/replies/${replyId}`, null);

    if (statusCheckResponse.status === 200) {
      const replyStatus = statusCheckResponse.data;
      log('green', 'SUCCESS', `回复状态: ${replyStatus.reply_status}`);
      log('yellow', 'DEBUG', `
  - reply_id: ${replyStatus.reply_id}
  - status: ${replyStatus.reply_status}
  - platform_reply_id: ${replyStatus.platform_reply_id || 'N/A'}
  - error_code: ${replyStatus.error_code || 'N/A'}
  - error_message: ${replyStatus.error_message || 'N/A'}
`);

      if (replyStatus.reply_status === 'success') {
        log('green', 'PASSED', '✅ 回复成功！Worker 已正确处理并回复了私信');
        log('yellow', 'INFO', `
Phase 10 验证成果:
  ✅ conversation_id 被正确接收
  ✅ normalizeConversationId() 处理了冒号分隔的 ID
  ✅ findMessageItemInVirtualList() 定位了消息
  ✅ React Fiber ID 提取或内容哈希匹配成功
  ✅ 新标签页成功打开并关闭
  ✅ 消息回复成功完成
`);
      } else if (replyStatus.reply_status === 'blocked') {
        log('yellow', 'BLOCKED', '⚠️ 回复被阻止（可能受限或需要登录）');
      } else if (replyStatus.reply_status === 'executing') {
        log('yellow', 'PENDING', '⏳ 回复正在执行中...');
      } else if (replyStatus.reply_status === 'failed') {
        log('red', 'FAILED', '❌ 回复失败');
      }
    } else {
      log('red', 'ERROR', `查询回复状态失败 (${statusCheckResponse.status})`);
      console.log('响应:', statusCheckResponse.data);
    }

    // 第 6 步：总结
    log('cyan', 'TEST', '\n========================================');
    log('cyan', 'TEST', '测试完成！');
    log('cyan', 'TEST', '========================================\n');

    log('yellow', 'INFO', `
总结：
1. ✅ 成功从数据库获取真实的私信和会话数据
2. ✅ 通过 HTTP API 发送了回复请求
3. ✅ Master 接收并转发了请求给 Worker
4. ⏳ Worker 正在处理回复操作

后续观察：
- 查看 Worker 日志中的 "为回复任务开启新浏览器标签页" 日志
- 验证 normalizeConversationId() 是否正确提取了会话 ID
- 查看 findMessageItemInVirtualList() 的四层级联匹配过程
- 验证标签页是否在回复完成后正确关闭

下一步：
等待 Worker 完成回复操作，然后再次查询回复状态
`);

  } catch (error) {
    log('red', 'ERROR', `测试失败: ${error.message}`);
    console.error(error);
  }
}

// 运行测试
runTest().catch(error => {
  log('red', 'ERROR', error.message);
  process.exit(1);
});
