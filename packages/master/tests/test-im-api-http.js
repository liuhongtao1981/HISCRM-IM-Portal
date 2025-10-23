/**
 * IM API HTTP 集成测试
 * 测试所有新增的 REST API 端点
 *
 * 运行前提：
 *   1. Master 服务器必须正在运行 (npm start)
 *   2. 数据库中有测试数据
 *
 * 运行方式：
 *   node packages/master/tests/test-im-api-http.js
 */

const axios = require('axios');

// 配置
const BASE_URL = process.env.MASTER_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/im`;

// 测试计数器
let passed = 0;
let failed = 0;
let testResults = [];

// 测试数据
let testAccountId = null;
let testConversationId = null;
let testMessageId = null;

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
    if (error.response) {
      console.log(`   状态码: ${error.response.status}`);
      console.log(`   响应: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    failed++;
    testResults.push({ description, status: 'failed', error: error.message });
  }
}

/**
 * 断言辅助函数
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * HTTP API 测试函数
 */
async function runHTTPTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('开始 IM HTTP API 集成测试...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 检查 Master 服务器是否在线
  console.log('📋 预检: 检查 Master 服务器');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await test('Master 服务器在线检查', async () => {
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    assert(response.status === 200, '健康检查失败');
    assert(response.data.status === 'ok', '健康检查状态不正确');
    console.log(`   Master URL: ${BASE_URL}`);
  });

  // ============================================
  // 测试 1: 准备测试数据
  // ============================================
  console.log('\n📋 测试 1: 获取测试数据');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await test('获取第一个会话作为测试数据', async () => {
    // 先随便用一个 account_id 查询会话列表
    // 如果没有会话，需要提示用户运行 Worker
    const Database = require('better-sqlite3');
    const path = require('path');
    const DB_PATH = path.join(__dirname, '../data/master.db');
    const db = new Database(DB_PATH);

    try {
      const account = db.prepare('SELECT DISTINCT account_id FROM conversations LIMIT 1').get();
      if (!account) {
        throw new Error('数据库中没有会话数据，请先运行 Worker 爬虫');
      }
      testAccountId = account.account_id;

      const conversation = db.prepare('SELECT id FROM conversations WHERE account_id = ? LIMIT 1').get(testAccountId);
      if (!conversation) {
        throw new Error('未找到测试会话');
      }
      testConversationId = conversation.id;

      const message = db.prepare('SELECT id FROM direct_messages WHERE conversation_id = ? LIMIT 1').get(testConversationId);
      if (message) {
        testMessageId = message.id;
      }

      console.log(`   测试账户: ${testAccountId}`);
      console.log(`   测试会话: ${testConversationId}`);
      console.log(`   测试消息: ${testMessageId || '(无)'}`);
    } finally {
      db.close();
    }
  });

  // ============================================
  // 测试 2: 会话管理 API
  // ============================================
  console.log('\n📋 测试 2: 会话管理 API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testAccountId && testConversationId) {
    await test('GET /conversations - 获取会话列表', async () => {
      const response = await axios.get(`${API_BASE}/conversations`, {
        params: { account_id: testAccountId, count: 10 }
      });

      assert(response.status === 200, '状态码应为 200');
      assert(response.data.status_code === 0, 'status_code 应为 0');
      assert(Array.isArray(response.data.data.conversations), 'conversations 应为数组');
      assert('cursor' in response.data.data, '响应应包含 cursor');
      assert('has_more' in response.data.data, '响应应包含 has_more');

      console.log(`   返回 ${response.data.data.conversations.length} 个会话`);
    });

    await test('GET /conversations - 按置顶状态过滤', async () => {
      const response = await axios.get(`${API_BASE}/conversations`, {
        params: { account_id: testAccountId, is_pinned: 'true' }
      });

      assert(response.status === 200, '状态码应为 200');
      assert(Array.isArray(response.data.data.conversations), 'conversations 应为数组');

      // 验证返回的会话都是置顶的
      const allPinned = response.data.data.conversations.every(c => c.is_pinned === true);
      assert(allPinned, '所有返回的会话应该是置顶的');

      console.log(`   返回 ${response.data.data.conversations.length} 个置顶会话`);
    });

    await test('GET /conversations/:id - 获取单个会话', async () => {
      const response = await axios.get(`${API_BASE}/conversations/${testConversationId}`);

      assert(response.status === 200, '状态码应为 200');
      assert(response.data.status_code === 0, 'status_code 应为 0');
      assert(response.data.data.conversation_id === testConversationId, '会话ID应匹配');
      assert('is_pinned' in response.data.data, '响应应包含 is_pinned');
      assert('is_muted' in response.data.data, '响应应包含 is_muted');

      console.log(`   会话: ${response.data.data.conversation_id}`);
    });

    await test('PUT /conversations/:id/pin - 置顶会话', async () => {
      const response = await axios.put(`${API_BASE}/conversations/${testConversationId}/pin`);

      assert(response.status === 200, '状态码应为 200');
      assert(response.data.status_code === 0, 'status_code 应为 0');
      assert(response.data.data.is_pinned === true, 'is_pinned 应为 true');

      console.log(`   会话已置顶: ${testConversationId}`);
    });

    await test('DELETE /conversations/:id/pin - 取消置顶', async () => {
      const response = await axios.delete(`${API_BASE}/conversations/${testConversationId}/pin`);

      assert(response.status === 200, '状态码应为 200');
      assert(response.data.status_code === 0, 'status_code 应为 0');
      assert(response.data.data.is_pinned === false, 'is_pinned 应为 false');

      console.log(`   会话已取消置顶: ${testConversationId}`);
    });

    await test('PUT /conversations/:id/mute - 免打扰会话', async () => {
      const response = await axios.put(`${API_BASE}/conversations/${testConversationId}/mute`);

      assert(response.status === 200, '状态码应为 200');
      assert(response.data.status_code === 0, 'status_code 应为 0');
      assert(response.data.data.is_muted === true, 'is_muted 应为 true');

      console.log(`   会话已免打扰: ${testConversationId}`);
    });

    await test('DELETE /conversations/:id/mute - 取消免打扰', async () => {
      const response = await axios.delete(`${API_BASE}/conversations/${testConversationId}/mute`);

      assert(response.status === 200, '状态码应为 200');
      assert(response.data.status_code === 0, 'status_code 应为 0');
      assert(response.data.data.is_muted === false, 'is_muted 应为 false');

      console.log(`   会话已取消免打扰: ${testConversationId}`);
    });
  }

  // ============================================
  // 测试 3: 消息管理 API
  // ============================================
  console.log('\n📋 测试 3: 消息管理 API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testConversationId && testMessageId) {
    await test('GET /messages - 获取消息列表', async () => {
      const response = await axios.get(`${API_BASE}/messages`, {
        params: { conversation_id: testConversationId, count: 20 }
      });

      assert(response.status === 200, '状态码应为 200');
      assert(response.data.status_code === 0, 'status_code 应为 0');
      assert(Array.isArray(response.data.data.messages), 'messages 应为数组');
      assert('cursor' in response.data.data, '响应应包含 cursor');
      assert('has_more' in response.data.data, '响应应包含 has_more');

      console.log(`   返回 ${response.data.data.messages.length} 条消息`);
    });

    await test('GET /messages - 按状态过滤', async () => {
      const response = await axios.get(`${API_BASE}/messages`, {
        params: {
          conversation_id: testConversationId,
          status: 'sent'
        }
      });

      assert(response.status === 200, '状态码应为 200');
      assert(Array.isArray(response.data.data.messages), 'messages 应为数组');

      console.log(`   返回 ${response.data.data.messages.length} 条 sent 状态的消息`);
    });

    await test('GET /messages/:id - 获取单条消息', async () => {
      const response = await axios.get(`${API_BASE}/messages/${testMessageId}`);

      assert(response.status === 200, '状态码应为 200');
      assert(response.data.status_code === 0, 'status_code 应为 0');
      assert(response.data.data.msg_id === testMessageId, '消息ID应匹配');
      assert('status' in response.data.data, '响应应包含 status');
      assert('is_deleted' in response.data.data, '响应应包含 is_deleted');
      assert('is_recalled' in response.data.data, '响应应包含 is_recalled');

      console.log(`   消息: ${response.data.data.msg_id}`);
    });

    await test('PUT /messages/:id/status - 更新消息状态', async () => {
      const response = await axios.put(`${API_BASE}/messages/${testMessageId}/status`, {
        status: 'delivered'
      });

      assert(response.status === 200, '状态码应为 200');
      assert(response.data.status_code === 0, 'status_code 应为 0');
      assert(response.data.data.status === 'delivered', 'status 应为 delivered');

      console.log(`   消息状态已更新: ${testMessageId} -> delivered`);
    });

    await test('PUT /messages/:id/recall - 撤回消息', async () => {
      const response = await axios.put(`${API_BASE}/messages/${testMessageId}/recall`);

      assert(response.status === 200, '状态码应为 200');
      assert(response.data.status_code === 0, 'status_code 应为 0');
      assert(response.data.data.is_recalled === true, 'is_recalled 应为 true');
      assert(response.data.data.recalled_at !== null, 'recalled_at 应有值');

      console.log(`   消息已撤回: ${testMessageId}`);
    });

    await test('PUT /messages/:id/read - 标记为已读', async () => {
      const response = await axios.put(`${API_BASE}/messages/${testMessageId}/read`);

      assert(response.status === 200, '状态码应为 200');
      assert(response.data.status_code === 0, 'status_code 应为 0');
      assert(response.data.data.is_read === true, 'is_read 应为 true');
      assert(response.data.data.status === 'read', 'status 应为 read');

      console.log(`   消息已标记为已读: ${testMessageId}`);
    });
  }

  // ============================================
  // 测试 4: 错误处理
  // ============================================
  console.log('\n📋 测试 4: 错误处理');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await test('GET /conversations - 缺少 account_id 参数', async () => {
    try {
      await axios.get(`${API_BASE}/conversations`);
      throw new Error('应该返回 400 错误');
    } catch (error) {
      assert(error.response.status === 400, '状态码应为 400');
      assert(error.response.data.status_code !== 0, 'status_code 应非 0');
      assert(error.response.data.status_msg, '响应应包含 status_msg 字段');
      console.log(`   正确返回错误: ${error.response.data.status_msg}`);
    }
  });

  await test('GET /conversations/:id - 不存在的会话ID', async () => {
    try {
      await axios.get(`${API_BASE}/conversations/nonexistent-conversation-id-12345`);
      throw new Error('应该返回 404 错误');
    } catch (error) {
      assert(error.response.status === 404, '状态码应为 404');
      assert(error.response.data.status_code !== 0, 'status_code 应非 0');
      console.log(`   正确返回 404: ${error.response.data.status_msg}`);
    }
  });

  await test('GET /messages/:id - 不存在的消息ID', async () => {
    try {
      await axios.get(`${API_BASE}/messages/nonexistent-message-id-12345`);
      throw new Error('应该返回 404 错误');
    } catch (error) {
      assert(error.response.status === 404, '状态码应为 404');
      assert(error.response.data.status_code !== 0, 'status_code 应非 0');
      console.log(`   正确返回 404: ${error.response.data.status_msg}`);
    }
  });

  await test('PUT /messages/:id/status - 缺少 status 参数', async () => {
    if (!testMessageId) {
      console.log('   跳过：无测试消息');
      return;
    }

    try {
      await axios.put(`${API_BASE}/messages/${testMessageId}/status`, {});
      throw new Error('应该返回 400 错误');
    } catch (error) {
      assert(error.response.status === 400, '状态码应为 400');
      assert(error.response.data.status_code !== 0, 'status_code 应非 0');
      console.log(`   正确返回错误: ${error.response.data.error}`);
    }
  });

  // ============================================
  // 测试 5: 响应格式验证
  // ============================================
  console.log('\n📋 测试 5: 响应格式验证');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testAccountId && testConversationId) {
    await test('验证会话响应包含所有新字段', async () => {
      const response = await axios.get(`${API_BASE}/conversations/${testConversationId}`);
      const conv = response.data.data;

      // 验证新字段存在
      assert('is_pinned' in conv, '缺少 is_pinned');
      assert('is_muted' in conv, '缺少 is_muted');
      assert('status' in conv, '缺少 status');
      assert('last_message_type' in conv, '缺少 last_message_type');
      assert('last_message' in conv, '缺少 last_message');
      assert('unread_count' in conv, '缺少 unread_count');

      // 验证字段类型
      assert(typeof conv.is_pinned === 'boolean', 'is_pinned 应为 boolean');
      assert(typeof conv.is_muted === 'boolean', 'is_muted 应为 boolean');
      assert(typeof conv.unread_count === 'number', 'unread_count 应为 number');

      console.log(`   所有字段验证通过`);
    });

    if (testMessageId) {
      await test('验证消息响应包含所有新字段', async () => {
        const response = await axios.get(`${API_BASE}/messages/${testMessageId}`);
        const msg = response.data.data;

        // 验证新字段存在
        assert('status' in msg, '缺少 status');
        assert('is_deleted' in msg, '缺少 is_deleted');
        assert('is_recalled' in msg, '缺少 is_recalled');
        assert('reply_to_message_id' in msg, '缺少 reply_to_message_id');
        assert('media_url' in msg, '缺少 media_url');
        assert('recalled_at' in msg, '缺少 recalled_at');

        // 验证字段类型
        assert(typeof msg.is_deleted === 'boolean', 'is_deleted 应为 boolean');
        assert(typeof msg.is_recalled === 'boolean', 'is_recalled 应为 boolean');

        console.log(`   所有字段验证通过`);
      });
    }
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
    console.log('\n🎉 所有 HTTP API 测试通过！');
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
runHTTPTests().catch(error => {
  console.error('\n❌ 测试运行失败:', error.message);
  console.error(error.stack);

  if (error.code === 'ECONNREFUSED') {
    console.error('\n提示: Master 服务器可能未启动，请先运行: npm start');
  }

  process.exit(1);
});
