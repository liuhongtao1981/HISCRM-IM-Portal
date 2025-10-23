/**
 * 测试脚本：验证 IM 新字段功能
 *
 * 运行方式：
 *   node packages/master/src/database/test-im-new-fields.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const ConversationsDAO = require('./conversations-dao');
const ConversationTransformer = require('../api/transformers/conversation-transformer');
const MessageTransformer = require('../api/transformers/message-transformer');
const AccountTransformer = require('../api/transformers/account-transformer');

const DB_PATH = path.join(__dirname, '../../data/master.db');

console.log('开始测试 IM 新字段功能...\n');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const conversationsDAO = new ConversationsDAO(db);

// 测试计数器
let passed = 0;
let failed = 0;

/**
 * 测试辅助函数
 */
function test(description, testFn) {
  try {
    testFn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${description}`);
    console.log(`   错误: ${error.message}`);
    failed++;
  }
}

// ============================================
// 1. 测试数据库字段是否存在
// ============================================
console.log('📋 测试 1: 验证数据库字段');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

test('conversations 表包含 is_pinned 字段', () => {
  const columns = db.prepare('PRAGMA table_info(conversations)').all();
  const hasField = columns.some(col => col.name === 'is_pinned');
  if (!hasField) throw new Error('字段不存在');
});

test('conversations 表包含 is_muted 字段', () => {
  const columns = db.prepare('PRAGMA table_info(conversations)').all();
  const hasField = columns.some(col => col.name === 'is_muted');
  if (!hasField) throw new Error('字段不存在');
});

test('conversations 表包含 last_message_type 字段', () => {
  const columns = db.prepare('PRAGMA table_info(conversations)').all();
  const hasField = columns.some(col => col.name === 'last_message_type');
  if (!hasField) throw new Error('字段不存在');
});

test('conversations 表包含 status 字段', () => {
  const columns = db.prepare('PRAGMA table_info(conversations)').all();
  const hasField = columns.some(col => col.name === 'status');
  if (!hasField) throw new Error('字段不存在');
});

test('direct_messages 表包含 status 字段', () => {
  const columns = db.prepare('PRAGMA table_info(direct_messages)').all();
  const hasField = columns.some(col => col.name === 'status');
  if (!hasField) throw new Error('字段不存在');
});

test('direct_messages 表包含 reply_to_message_id 字段', () => {
  const columns = db.prepare('PRAGMA table_info(direct_messages)').all();
  const hasField = columns.some(col => col.name === 'reply_to_message_id');
  if (!hasField) throw new Error('字段不存在');
});

test('direct_messages 表包含 media_url 字段', () => {
  const columns = db.prepare('PRAGMA table_info(direct_messages)').all();
  const hasField = columns.some(col => col.name === 'media_url');
  if (!hasField) throw new Error('字段不存在');
});

test('direct_messages 表包含 is_recalled 字段', () => {
  const columns = db.prepare('PRAGMA table_info(direct_messages)').all();
  const hasField = columns.some(col => col.name === 'is_recalled');
  if (!hasField) throw new Error('字段不存在');
});

test('accounts 表包含 avatar 字段', () => {
  const columns = db.prepare('PRAGMA table_info(accounts)').all();
  const hasField = columns.some(col => col.name === 'avatar');
  if (!hasField) throw new Error('字段不存在');
});

test('accounts 表包含 verified 字段', () => {
  const columns = db.prepare('PRAGMA table_info(accounts)').all();
  const hasField = columns.some(col => col.name === 'verified');
  if (!hasField) throw new Error('字段不存在');
});

// ============================================
// 2. 测试 ConversationsDAO 新方法
// ============================================
console.log('\n📋 测试 2: ConversationsDAO 新方法');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// 查找一个现有会话用于测试
const existingConv = db.prepare('SELECT id FROM conversations LIMIT 1').get();

if (existingConv) {
  const testConvId = existingConv.id;

  test('pinConversation() 方法存在且可调用', () => {
    conversationsDAO.pinConversation(testConvId);
    const conv = conversationsDAO.findById(testConvId);
    if (!conv.is_pinned) throw new Error('置顶失败');
  });

  test('unpinConversation() 方法存在且可调用', () => {
    conversationsDAO.unpinConversation(testConvId);
    const conv = conversationsDAO.findById(testConvId);
    if (conv.is_pinned) throw new Error('取消置顶失败');
  });

  test('muteConversation() 方法存在且可调用', () => {
    conversationsDAO.muteConversation(testConvId);
    const conv = conversationsDAO.findById(testConvId);
    if (!conv.is_muted) throw new Error('免打扰失败');
  });

  test('unmuteConversation() 方法存在且可调用', () => {
    conversationsDAO.unmuteConversation(testConvId);
    const conv = conversationsDAO.findById(testConvId);
    if (conv.is_muted) throw new Error('取消免打扰失败');
  });

  test('update() 方法支持 is_pinned 字段', () => {
    conversationsDAO.update(testConvId, { is_pinned: true });
    const conv = conversationsDAO.findById(testConvId);
    if (!conv.is_pinned) throw new Error('更新失败');
  });

  test('update() 方法支持 is_muted 字段', () => {
    conversationsDAO.update(testConvId, { is_muted: true });
    const conv = conversationsDAO.findById(testConvId);
    if (!conv.is_muted) throw new Error('更新失败');
  });

  test('update() 方法支持 status 字段', () => {
    conversationsDAO.update(testConvId, { status: 'archived' });
    const conv = conversationsDAO.findById(testConvId);
    if (conv.status !== 'archived') throw new Error('更新失败');
  });

  test('updateLastMessage() 方法支持 messageType 参数', () => {
    conversationsDAO.updateLastMessage(testConvId, 'msg_123', '图片消息', Date.now(), 'image');
    const conv = conversationsDAO.findById(testConvId);
    if (conv.last_message_type !== 'image') throw new Error('更新失败');
  });

  // 恢复测试数据
  conversationsDAO.update(testConvId, {
    is_pinned: false,
    is_muted: false,
    status: 'active',
    last_message_type: 'text'
  });
} else {
  console.log('⚠️  没有现有会话数据，跳过 DAO 方法测试');
}

// ============================================
// 3. 测试 Transformers
// ============================================
console.log('\n📋 测试 3: Transformers 字段转换');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

test('ConversationTransformer 支持 is_pinned 字段', () => {
  const masterConv = {
    conversation_id: 'conv_123',
    platform_user_id: 'user_123',
    platform_user_name: '测试用户',
    is_pinned: 1,
    is_muted: 0,
    last_message_type: 'image',
    status: 'active',
    created_at: 1729670000,
    updated_at: 1729670000
  };
  const imConv = ConversationTransformer.toIMConversation(masterConv);
  if (!imConv.is_pinned) throw new Error('转换失败');
  if (imConv.last_message_type !== 'image') throw new Error('last_message_type 转换失败');
});

test('MessageTransformer 支持 status 字段', () => {
  const masterMsg = {
    message_id: 'msg_123',
    conversation_id: 'conv_123',
    platform_sender_id: 'user_123',
    platform_receiver_id: 'user_456',
    message_type: 'text',
    content: '测试消息',
    status: 'delivered',
    is_read: 1,
    is_recalled: 0,
    created_at: 1729670000
  };
  const imMsg = MessageTransformer.toIMMessage(masterMsg);
  if (imMsg.status !== 'delivered') throw new Error('status 转换失败');
  if (!imMsg.is_read) throw new Error('is_read 转换失败');
  if (imMsg.is_recalled) throw new Error('is_recalled 转换失败');
});

test('MessageTransformer 支持媒体字段', () => {
  const masterMsg = {
    message_id: 'msg_456',
    conversation_id: 'conv_123',
    platform_sender_id: 'user_123',
    message_type: 'image',
    content: '图片',
    media_url: 'https://example.com/image.jpg',
    media_thumbnail: 'https://example.com/thumb.jpg',
    file_size: 1024000,
    created_at: 1729670000
  };
  const imMsg = MessageTransformer.toIMMessage(masterMsg);
  if (imMsg.media_url !== 'https://example.com/image.jpg') throw new Error('media_url 转换失败');
  if (imMsg.file_size !== 1024000) throw new Error('file_size 转换失败');
});

test('MessageTransformer 支持引用回复', () => {
  const masterMsg = {
    message_id: 'msg_789',
    conversation_id: 'conv_123',
    platform_sender_id: 'user_123',
    message_type: 'text',
    content: '回复消息',
    reply_to_message_id: 'msg_456',
    created_at: 1729670000
  };
  const imMsg = MessageTransformer.toIMMessage(masterMsg);
  if (imMsg.reply_to_message_id !== 'msg_456') throw new Error('reply_to_message_id 转换失败');
});

test('AccountTransformer 支持 avatar 字段', () => {
  const masterAccount = {
    account_id: 'acc_123',
    account_name: '测试账号',
    avatar: 'https://example.com/avatar.jpg',
    signature: '这是签名',
    verified: 1,
    total_followers: 1000,
    created_at: 1729670000
  };
  const imUser = AccountTransformer.toIMUser(masterAccount);
  if (imUser.avatar !== 'https://example.com/avatar.jpg') throw new Error('avatar 转换失败');
  if (!imUser.verified) throw new Error('verified 转换失败');
  if (imUser.signature !== '这是签名') throw new Error('signature 转换失败');
});

// ============================================
// 4. 测试查询过滤功能
// ============================================
console.log('\n📋 测试 4: 查询过滤功能');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// 获取第一个账户用于测试
const testAccount = db.prepare('SELECT DISTINCT account_id FROM conversations LIMIT 1').get();

if (testAccount) {
  test('findByAccount() 支持 is_pinned 过滤', () => {
    const convs = conversationsDAO.findByAccount(testAccount.account_id, { is_pinned: true });
    if (!Array.isArray(convs)) throw new Error('返回值不是数组');
  });

  test('findByAccount() 支持 status 过滤', () => {
    const convs = conversationsDAO.findByAccount(testAccount.account_id, { status: 'active' });
    if (!Array.isArray(convs)) throw new Error('返回值不是数组');
  });

  test('findByAccount() 默认按置顶排序', () => {
    const convs = conversationsDAO.findByAccount(testAccount.account_id);
    if (!Array.isArray(convs)) throw new Error('返回值不是数组');
    // 验证置顶会话在前面（如果有的话）
    let foundUnpinned = false;
    for (const conv of convs) {
      if (!conv.is_pinned && !foundUnpinned) {
        foundUnpinned = true;
      }
      if (foundUnpinned && conv.is_pinned) {
        throw new Error('置顶排序不正确');
      }
    }
  });

  test('getStats() 返回置顶和免打扰统计', () => {
    const stats = conversationsDAO.getStats(testAccount.account_id);
    if (!('pinned' in stats)) throw new Error('缺少 pinned 字段');
    if (!('muted' in stats)) throw new Error('缺少 muted 字段');
    if (!('active' in stats)) throw new Error('缺少 active 字段');
  });
} else {
  console.log('⚠️  没有会话数据，跳过查询过滤测试');
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
  console.log('\n🎉 所有测试通过！IM 新字段功能正常工作！');
} else {
  console.log(`\n⚠️  有 ${failed} 个测试失败，请检查上面的错误信息。`);
}

db.close();
process.exit(failed > 0 ? 1 : 0);
