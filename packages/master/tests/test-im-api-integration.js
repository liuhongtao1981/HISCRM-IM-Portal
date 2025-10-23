/**
 * IM API 集成测试脚本
 * 使用 supertest 直接测试 Express 应用
 *
 * 运行方式：
 *   node packages/master/tests/test-im-api-integration.js
 *
 * 注意：此测试不需要启动 Master 服务，会直接测试 Express app
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/master.db');

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
    failed++;
    testResults.push({ description, status: 'failed', error: error.message });
  }
}

/**
 * 数据库测试函数
 */
async function runDatabaseTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('开始 IM 数据库和 DAO 集成测试...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const ConversationsDAO = require('../src/database/conversations-dao');
  const MessagesDAO = require('../src/database/messages-dao');
  const ConversationTransformer = require('../src/api/transformers/conversation-transformer');
  const MessageTransformer = require('../src/api/transformers/message-transformer');

  const conversationsDAO = new ConversationsDAO(db);
  const messagesDAO = new MessagesDAO(db);

  // ============================================
  // 测试 1: 准备测试数据
  // ============================================
  console.log('📋 测试 1: 准备测试数据');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await test('获取测试账户和会话', () => {
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
  });

  // ============================================
  // 测试 2: ConversationsDAO 新方法
  // ============================================
  console.log('\n📋 测试 2: ConversationsDAO 新方法');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testConversationId) {
    await test('pinConversation() - 置顶会话', () => {
      conversationsDAO.pinConversation(testConversationId);
      const conv = conversationsDAO.findById(testConversationId);
      if (!conv.is_pinned) throw new Error('置顶失败');
    });

    await test('findPinned() - 查询置顶会话', () => {
      const pinnedConvs = conversationsDAO.findPinned(testAccountId);
      const found = pinnedConvs.some(c => c.id === testConversationId);
      if (!found) throw new Error('未找到置顶的会话');
    });

    await test('findByAccount() - 置顶会话排在最前', () => {
      const convs = conversationsDAO.findByAccount(testAccountId);
      if (convs.length > 0) {
        let foundUnpinned = false;
        for (const conv of convs) {
          if (!conv.is_pinned && !foundUnpinned) {
            foundUnpinned = true;
          }
          if (foundUnpinned && conv.is_pinned) {
            throw new Error('置顶会话应该在非置顶会话之前');
          }
        }
      }
    });

    await test('unpinConversation() - 取消置顶', () => {
      conversationsDAO.unpinConversation(testConversationId);
      const conv = conversationsDAO.findById(testConversationId);
      if (conv.is_pinned) throw new Error('取消置顶失败');
    });

    await test('muteConversation() - 免打扰会话', () => {
      conversationsDAO.muteConversation(testConversationId);
      const conv = conversationsDAO.findById(testConversationId);
      if (!conv.is_muted) throw new Error('免打扰失败');
    });

    await test('findByAccount(is_muted=true) - 过滤免打扰会话', () => {
      const mutedConvs = conversationsDAO.findByAccount(testAccountId, { is_muted: true });
      const found = mutedConvs.some(c => c.id === testConversationId);
      if (!found) throw new Error('未找到免打扰的会话');
    });

    await test('unmuteConversation() - 取消免打扰', () => {
      conversationsDAO.unmuteConversation(testConversationId);
      const conv = conversationsDAO.findById(testConversationId);
      if (conv.is_muted) throw new Error('取消免打扰失败');
    });

    await test('getStats() - 包含新的统计字段', () => {
      const stats = conversationsDAO.getStats(testAccountId);
      if (!('pinned' in stats)) throw new Error('缺少 pinned 统计');
      if (!('muted' in stats)) throw new Error('缺少 muted 统计');
      if (!('active' in stats)) throw new Error('缺少 active 统计');
    });
  }

  // ============================================
  // 测试 3: MessagesDAO 新方法
  // ============================================
  console.log('\n📋 测试 3: MessagesDAO 新方法');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testMessageId) {
    await test('updateStatus() - 更新消息状态', () => {
      const success = messagesDAO.updateStatus(testMessageId, 'delivered');
      if (!success) throw new Error('更新状态失败');

      const msg = messagesDAO.findById(testMessageId);
      if (msg.status !== 'delivered') throw new Error('状态未更新');
    });

    await test('findAll(status=delivered) - 按状态过滤', () => {
      const messages = messagesDAO.findAll({
        conversation_id: testConversationId,
        status: 'delivered'
      });
      if (messages.length > 0) {
        const allDelivered = messages.every(m => m.status === 'delivered');
        if (!allDelivered) throw new Error('过滤结果不正确');
      }
    });

    await test('recallMessage() - 撤回消息', () => {
      const success = messagesDAO.recallMessage(testMessageId);
      if (!success) throw new Error('撤回失败');

      const msg = messagesDAO.findById(testMessageId);
      if (!msg.is_recalled) throw new Error('is_recalled 应为 true');
      if (!msg.recalled_at) throw new Error('缺少 recalled_at');
    });

    await test('findAll(is_recalled=true) - 查询已撤回消息', () => {
      const messages = messagesDAO.findAll({
        conversation_id: testConversationId,
        is_recalled: true
      });
      const found = messages.some(m => m.id === testMessageId);
      if (!found) throw new Error('未找到已撤回的消息');
    });

    await test('update() - 通用更新方法', () => {
      const success = messagesDAO.update(testMessageId, {
        status: 'read',
        is_read: true
      });
      if (!success) throw new Error('更新失败');

      const msg = messagesDAO.findById(testMessageId);
      if (msg.status !== 'read') throw new Error('status 未更新');
      if (!msg.is_read) throw new Error('is_read 未更新');
    });

    await test('softDelete() - 软删除消息', () => {
      const success = messagesDAO.softDelete(testMessageId);
      if (!success) throw new Error('软删除失败');

      const msg = messagesDAO.findById(testMessageId);
      if (!msg.is_deleted) throw new Error('is_deleted 应为 true');
    });

    await test('findAll(is_deleted=false) - 过滤未删除消息', () => {
      const messages = messagesDAO.findAll({
        conversation_id: testConversationId,
        is_deleted: false
      });
      const hasDeleted = messages.some(m => m.is_deleted);
      if (hasDeleted) throw new Error('返回了已删除的消息');
    });

    // 恢复测试消息状态
    await test('恢复测试消息状态', () => {
      messagesDAO.update(testMessageId, {
        is_deleted: false,
        is_recalled: false,
        recalled_at: null,
        status: 'sent'
      });
    });
  }

  // ============================================
  // 测试 4: Transformers 新字段
  // ============================================
  console.log('\n📋 测试 4: Transformers 新字段转换');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testConversationId) {
    await test('ConversationTransformer 包含新字段', () => {
      const masterConv = conversationsDAO.findById(testConversationId);
      const imConv = ConversationTransformer.toIMConversation(masterConv);

      if (!('is_pinned' in imConv)) throw new Error('缺少 is_pinned');
      if (!('is_muted' in imConv)) throw new Error('缺少 is_muted');
      if (!('last_message_type' in imConv)) throw new Error('缺少 last_message_type');
      if (!('status' in imConv)) throw new Error('缺少 status');
    });
  }

  if (testMessageId) {
    await test('MessageTransformer 包含新字段', () => {
      const masterMsg = messagesDAO.findById(testMessageId);
      const imMsg = MessageTransformer.toIMMessage(masterMsg);

      if (!('status' in imMsg)) throw new Error('缺少 status');
      if (!('is_deleted' in imMsg)) throw new Error('缺少 is_deleted');
      if (!('is_recalled' in imMsg)) throw new Error('缺少 is_recalled');
      if (!('reply_to_message_id' in imMsg)) throw new Error('缺少 reply_to_message_id');
      if (!('media_url' in imMsg)) throw new Error('缺少 media_url');
      if (!('recalled_at' in imMsg)) throw new Error('缺少 recalled_at');
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
    console.log('\n🎉 所有测试通过！IM DAO 和 Transformer 功能正常！');
  } else {
    console.log(`\n⚠️  有 ${failed} 个测试失败，请检查上面的错误信息。`);

    console.log('\n失败的测试：');
    testResults.filter(r => r.status === 'failed').forEach(r => {
      console.log(`  - ${r.description}`);
      console.log(`    ${r.error}`);
    });
  }

  db.close();
  process.exit(failed > 0 ? 1 : 0);
}

// 运行测试
runDatabaseTests().catch(error => {
  console.error('\n❌ 测试运行失败:', error.message);
  console.error(error.stack);
  process.exit(1);
});
