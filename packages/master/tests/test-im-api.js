/**
 * IM API 集成测试脚本
 * 测试所有新增的 IM 接口和字段功能
 *
 * 运行方式：
 *   node packages/master/tests/test-im-api.js
 *
 * 前置条件：
 *   - Master 服务正在运行（默认端口 3000）
 *   - 数据库中有测试数据
 */

const axios = require('axios');

// 配置
const BASE_URL = 'http://localhost:3000';
const API_PREFIX = '/api/im';

// 测试计数器
let passed = 0;
let failed = 0;
let testResults = [];

/**
 * 测试辅助函数
 */
async function test(description, testFn) {
  try {
    await testFn();
    console.log(`✅ ${description}`);
    passed++;
    testResults.push({ description, status: 'passed' });
  } catch (error) {
    console.log(`❌ ${description}`);
    console.log(`   错误: ${error.message}`);
    failed++;
    testResults.push({ description, status: 'failed', error: error.message });
  }
}

/**
 * HTTP 请求辅助函数
 */
async function get(path, params = {}) {
  const response = await axios.get(`${BASE_URL}${API_PREFIX}${path}`, { params });
  return response.data;
}

async function post(path, data = {}) {
  const response = await axios.post(`${BASE_URL}${API_PREFIX}${path}`, data);
  return response.data;
}

async function put(path, data = {}) {
  const response = await axios.put(`${BASE_URL}${API_PREFIX}${path}`, data);
  return response.data;
}

async function del(path) {
  const response = await axios.delete(`${BASE_URL}${API_PREFIX}${path}`);
  return response.data;
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('开始 IM API 集成测试...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 测试变量
  let testAccountId = null;
  let testConversationId = null;
  let testMessageId = null;

  // ============================================
  // 测试 1: 会话列表 API - 基础功能
  // ============================================
  console.log('📋 测试 1: 会话列表 API - 基础功能');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await test('GET /conversations - 查询会话列表需要 account_id', async () => {
    try {
      await get('/conversations');
      throw new Error('应该返回 400 错误');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        return; // 预期的错误
      }
      throw error;
    }
  });

  // 先获取一个测试账户
  await test('获取测试数据 - 查找第一个账户', async () => {
    // 从数据库直接查询（需要先启动 Master）
    // 这里我们假设有测试数据
    const Database = require('better-sqlite3');
    const path = require('path');
    const db = new Database(path.join(__dirname, '../../data/master.db'));

    const account = db.prepare('SELECT DISTINCT account_id FROM conversations LIMIT 1').get();
    if (!account) {
      throw new Error('数据库中没有会话数据');
    }
    testAccountId = account.account_id;

    const conversation = db.prepare('SELECT id FROM conversations WHERE account_id = ? LIMIT 1').get(testAccountId);
    if (conversation) {
      testConversationId = conversation.id;
    }

    db.close();
  });

  if (testAccountId) {
    await test('GET /conversations - 获取账户的会话列表', async () => {
      const result = await get('/conversations', { account_id: testAccountId });
      if (!result.success) throw new Error('返回 success 应为 true');
      if (!result.data.conversations) throw new Error('缺少 conversations 字段');
    });

    await test('GET /conversations - 返回数据包含新字段', async () => {
      const result = await get('/conversations', { account_id: testAccountId });
      if (result.data.conversations.length > 0) {
        const conv = result.data.conversations[0];
        if (!('is_pinned' in conv)) throw new Error('缺少 is_pinned 字段');
        if (!('is_muted' in conv)) throw new Error('缺少 is_muted 字段');
        if (!('last_message_type' in conv)) throw new Error('缺少 last_message_type 字段');
        if (!('status' in conv)) throw new Error('缺少 status 字段');
      }
    });
  }

  // ============================================
  // 测试 2: 会话管理 API - 置顶功能
  // ============================================
  console.log('\n📋 测试 2: 会话管理 API - 置顶功能');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testConversationId) {
    await test('PUT /conversations/:id/pin - 置顶会话', async () => {
      const result = await put(`/conversations/${testConversationId}/pin`);
      if (!result.success) throw new Error('返回 success 应为 true');
      if (!result.data.is_pinned) throw new Error('is_pinned 应为 true');
    });

    await test('GET /conversations?is_pinned=true - 查询置顶会话', async () => {
      const result = await get('/conversations', {
        account_id: testAccountId,
        is_pinned: 'true'
      });
      if (!result.success) throw new Error('返回 success 应为 true');
      const pinnedConv = result.data.conversations.find(c => c.conversation_id === testConversationId);
      if (!pinnedConv) throw new Error('未找到置顶的会话');
      if (!pinnedConv.is_pinned) throw new Error('会话未被标记为置顶');
    });

    await test('GET /conversations - 置顶会话排在最前面', async () => {
      const result = await get('/conversations', { account_id: testAccountId });
      if (result.data.conversations.length > 0) {
        // 查找置顶会话的位置
        let firstUnpinnedIndex = -1;
        let lastPinnedIndex = -1;

        result.data.conversations.forEach((conv, index) => {
          if (conv.is_pinned) {
            lastPinnedIndex = index;
          } else if (firstUnpinnedIndex === -1) {
            firstUnpinnedIndex = index;
          }
        });

        if (lastPinnedIndex !== -1 && firstUnpinnedIndex !== -1) {
          if (lastPinnedIndex > firstUnpinnedIndex) {
            throw new Error('置顶会话应该在非置顶会话之前');
          }
        }
      }
    });

    await test('DELETE /conversations/:id/pin - 取消置顶', async () => {
      const result = await del(`/conversations/${testConversationId}/pin`);
      if (!result.success) throw new Error('返回 success 应为 true');
      if (result.data.is_pinned) throw new Error('is_pinned 应为 false');
    });
  }

  // ============================================
  // 测试 3: 会话管理 API - 免打扰功能
  // ============================================
  console.log('\n📋 测试 3: 会话管理 API - 免打扰功能');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testConversationId) {
    await test('PUT /conversations/:id/mute - 免打扰会话', async () => {
      const result = await put(`/conversations/${testConversationId}/mute`);
      if (!result.success) throw new Error('返回 success 应为 true');
      if (!result.data.is_muted) throw new Error('is_muted 应为 true');
    });

    await test('GET /conversations?is_muted=true - 查询免打扰会话', async () => {
      const result = await get('/conversations', {
        account_id: testAccountId,
        is_muted: 'true'
      });
      if (!result.success) throw new Error('返回 success 应为 true');
      const mutedConv = result.data.conversations.find(c => c.conversation_id === testConversationId);
      if (!mutedConv) throw new Error('未找到免打扰的会话');
    });

    await test('DELETE /conversations/:id/mute - 取消免打扰', async () => {
      const result = await del(`/conversations/${testConversationId}/mute`);
      if (!result.success) throw new Error('返回 success 应为 true');
      if (result.data.is_muted) throw new Error('is_muted 应为 false');
    });
  }

  // ============================================
  // 测试 4: 消息列表 API - 基础功能
  // ============================================
  console.log('\n📋 测试 4: 消息列表 API - 基础功能');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testConversationId) {
    await test('GET /messages?conversation_id - 获取会话消息', async () => {
      const result = await get('/messages', { conversation_id: testConversationId });
      if (!result.success) throw new Error('返回 success 应为 true');
      if (!result.data.messages) throw new Error('缺少 messages 字段');
    });

    await test('GET /messages - 返回数据包含新字段', async () => {
      const result = await get('/messages', { conversation_id: testConversationId });
      if (result.data.messages.length > 0) {
        const msg = result.data.messages[0];
        testMessageId = msg.msg_id;

        if (!('status' in msg)) throw new Error('缺少 status 字段');
        if (!('is_deleted' in msg)) throw new Error('缺少 is_deleted 字段');
        if (!('is_recalled' in msg)) throw new Error('缺少 is_recalled 字段');
        if (!('reply_to_message_id' in msg)) throw new Error('缺少 reply_to_message_id 字段');
        if (!('media_url' in msg)) throw new Error('缺少 media_url 字段');
        if (!('media_thumbnail' in msg)) throw new Error('缺少 media_thumbnail 字段');
        if (!('file_size' in msg)) throw new Error('缺少 file_size 字段');
        if (!('file_name' in msg)) throw new Error('缺少 file_name 字段');
        if (!('duration' in msg)) throw new Error('缺少 duration 字段');
        if (!('recalled_at' in msg)) throw new Error('缺少 recalled_at 字段');
      }
    });
  }

  // ============================================
  // 测试 5: 消息管理 API - 状态更新
  // ============================================
  console.log('\n📋 测试 5: 消息管理 API - 状态更新');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testMessageId) {
    await test('PUT /messages/:id/status - 更新消息状态为 delivered', async () => {
      const result = await put(`/messages/${testMessageId}/status`, { status: 'delivered' });
      if (!result.success) throw new Error('返回 success 应为 true');
      if (result.data.status !== 'delivered') throw new Error('status 应为 delivered');
    });

    await test('PUT /messages/:id/status - 更新消息状态为 read', async () => {
      const result = await put(`/messages/${testMessageId}/status`, { status: 'read' });
      if (!result.success) throw new Error('返回 success 应为 true');
      if (result.data.status !== 'read') throw new Error('status 应为 read');
    });

    await test('GET /messages?status=read - 按状态过滤消息', async () => {
      const result = await get('/messages', {
        conversation_id: testConversationId,
        status: 'read'
      });
      if (!result.success) throw new Error('返回 success 应为 true');
      if (result.data.messages.length > 0) {
        const allRead = result.data.messages.every(m => m.status === 'read');
        if (!allRead) throw new Error('返回的消息应该都是 read 状态');
      }
    });
  }

  // ============================================
  // 测试 6: 消息管理 API - 撤回功能
  // ============================================
  console.log('\n📋 测试 6: 消息管理 API - 撤回功能');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testMessageId) {
    await test('PUT /messages/:id/recall - 撤回消息', async () => {
      const result = await put(`/messages/${testMessageId}/recall`);
      if (!result.success) throw new Error('返回 success 应为 true');
      if (!result.data.is_recalled) throw new Error('is_recalled 应为 true');
      if (!result.data.recalled_at) throw new Error('缺少 recalled_at 字段');
    });

    await test('GET /messages/:id - 验证消息已撤回', async () => {
      const result = await get(`/messages/${testMessageId}`);
      if (!result.success) throw new Error('返回 success 应为 true');
      if (!result.data.is_recalled) throw new Error('消息应该被标记为已撤回');
    });

    await test('GET /messages?is_recalled=true - 查询已撤回消息', async () => {
      const result = await get('/messages', {
        conversation_id: testConversationId,
        is_recalled: 'true'
      });
      if (!result.success) throw new Error('返回 success 应为 true');
      const recalledMsg = result.data.messages.find(m => m.msg_id === testMessageId);
      if (!recalledMsg) throw new Error('未找到已撤回的消息');
    });
  }

  // ============================================
  // 测试 7: 消息过滤 API - 多维度过滤
  // ============================================
  console.log('\n📋 测试 7: 消息过滤 API - 多维度过滤');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testConversationId) {
    await test('GET /messages?is_deleted=false - 过滤未删除消息', async () => {
      const result = await get('/messages', {
        conversation_id: testConversationId,
        is_deleted: 'false'
      });
      if (!result.success) throw new Error('返回 success 应为 true');
      if (result.data.messages.some(m => m.is_deleted)) {
        throw new Error('返回的消息中不应包含已删除的消息');
      }
    });

    await test('GET /messages?message_type=text - 过滤文本消息', async () => {
      const result = await get('/messages', {
        conversation_id: testConversationId,
        message_type: 'text'
      });
      if (!result.success) throw new Error('返回 success 应为 true');
      if (result.data.messages.some(m => m.msg_type !== 'text')) {
        throw new Error('返回的消息应该都是 text 类型');
      }
    });
  }

  // ============================================
  // 输出测试结果
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 测试完成！');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ 通过: ${passed} 个`);
  console.log(`❌ 失败: ${failed} 个`);
  console.log(`📈 成功率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 所有测试通过！IM API 功能正常！');
  } else {
    console.log(`\n⚠️  有 ${failed} 个测试失败，请检查上面的错误信息。`);

    console.log('\n失败的测试：');
    testResults.filter(r => r.status === 'failed').forEach(r => {
      console.log(`  - ${r.description}`);
      console.log(`    ${r.error}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

// 运行测试
runTests().catch(error => {
  console.error('\n❌ 测试运行失败:', error.message);
  console.error(error.stack);
  process.exit(1);
});
