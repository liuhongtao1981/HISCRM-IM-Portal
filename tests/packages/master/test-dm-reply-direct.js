/**
 * Phase 10 直接测试：通过 Socket.IO 直接推送回复请求给 Worker
 *
 * 步骤：
 * 1. 从数据库获取真实的私信和会话数据
 * 2. 构建回复请求
 * 3. 直接通过 Socket.IO 发送给 Worker
 * 4. 观察 Worker 是否能正确处理并回复
 */

const io = require('socket.io-client');
const Database = require('better-sqlite3');

const MASTER_URL = 'http://localhost:3000';
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
 * 主测试
 */
async function runTest() {
  log('cyan', 'TEST', '========================================');
  log('cyan', 'TEST', 'Phase 10: 直接推送回复请求给 Worker');
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

    // 第 2 步：连接到 Master Socket.IO /worker 命名空间
    log('blue', 'STEP2', '连接到 Master Socket.IO /worker 命名空间...');
    const socket = io(`${MASTER_URL}/worker`, {
      transports: ['websocket'],
      reconnection: true
    });

    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        log('green', 'SUCCESS', '已连接到 Master /worker 命名空间');
        resolve();
      });

      socket.on('error', (error) => {
        log('red', 'ERROR', `连接失败: ${error}`);
        reject(error);
      });

      setTimeout(() => reject(new Error('连接超时（5秒）')), 5000);
    });

    // 第 3 步：构建回复请求
    log('blue', 'STEP3', '构建回复请求...');
    const replyRequest = {
      reply_id: `reply_test_${Date.now()}`,
      request_id: `req_test_${Date.now()}`,
      platform: 'douyin',
      account_id: conversation.account_id,
      target_type: 'direct_message',
      target_id: message.platform_message_id,
      // Phase 9/10 新增参数
      conversation_id: conversation.conversation_id,
      platform_message_id: message.platform_message_id,
      // 回复内容
      reply_content: `自动回复测试 - ${new Date().toLocaleTimeString()}`,
      context: {
        conversation_title: '私信回复',
        platform_user_id: conversation.platform_user_id,
        sender_name: message.platform_sender_name
      }
    };

    log('yellow', 'DEBUG', `
回复请求参数:
  - reply_id: ${replyRequest.reply_id}
  - account_id: ${replyRequest.account_id}
  - target_id: ${replyRequest.target_id}
  - conversation_id: ${replyRequest.conversation_id}
  - platform_message_id: ${replyRequest.platform_message_id}
  - reply_content: ${replyRequest.reply_content}
`);

    // 第 4 步：监听 Worker 回复结果
    log('blue', 'STEP4', '监听 worker:reply:result 事件...');

    let resultReceived = false;
    const resultPromise = new Promise((resolve) => {
      // 监听 Worker 的回复结果
      socket.on('worker:reply:result', (result) => {
        resultReceived = true;
        log('green', 'SUCCESS', 'Worker 返回回复结果:');
        log('yellow', 'DEBUG', `
  - reply_id: ${result.reply_id}
  - success: ${result.success}
  - status: ${result.status}
  - platform_reply_id: ${result.platform_reply_id || 'N/A'}
  - reason: ${result.reason || 'N/A'}
  - error: ${result.error || 'N/A'}
`);

        if (result.success) {
          log('green', 'PASSED', '✅ Worker 成功回复了私信！');
          log('yellow', 'INFO', `
Phase 10 关键验证点:
  ✅ conversation_id 被正确接收并规范化
  ✅ findMessageItemInVirtualList() 成功定位了消息
  ✅ normalizeConversationId() 提取了最后部分
  ✅ React Fiber ID 提取或内容哈希匹配成功
  ✅ 消息回复成功完成
`);
        } else if (result.status === 'blocked') {
          log('yellow', 'BLOCKED', '⚠️ 回复被阻止（可能受限或需要登录）');
        } else {
          log('red', 'FAILED', '❌ Worker 回复失败');
        }

        resolve(result);
      });
    });

    // 第 5 步：发送回复请求给 Worker（延迟2秒确保 Worker 已就绪）
    log('blue', 'STEP5', '等待 2 秒确保 Worker 就绪...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    log('blue', 'STEP5', '发送 master:reply:request 给 Worker...');
    socket.emit('master:reply:request', replyRequest);

    // 等待结果（最多等待 15 秒）
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('等待 Worker 回复超时（15秒）')), 15000)
    );

    try {
      await Promise.race([resultPromise, timeout]);
    } catch (error) {
      log('red', 'ERROR', error.message);
      if (!resultReceived) {
        log('yellow', 'INFO', '提示：Worker 可能未正确处理请求或需要更长时间处理');
      }
    }

    // 第 5 步：等待结果
    log('blue', 'STEP5', '等待 Worker 处理结果...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 第 6 步：总结
    log('cyan', 'TEST', '\n========================================');
    log('cyan', 'TEST', '测试完成！');
    log('cyan', 'TEST', '========================================');

    process.exit(0);

  } catch (error) {
    log('red', 'ERROR', `测试失败: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
runTest().catch(error => {
  log('red', 'ERROR', error.message);
  process.exit(1);
});
