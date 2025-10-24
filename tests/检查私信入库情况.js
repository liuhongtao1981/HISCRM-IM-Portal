/**
 * 检查私信爬虫数据是否成功入库
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n========================================');
console.log('📊 数据库入库验证');
console.log('========================================\n');

// 1. 查询账户信息
const account = db.prepare('SELECT * FROM accounts WHERE platform = ?').get('douyin');
console.log('📱 测试账户:');
console.log('  ID:', account.id);
console.log('  用户名:', account.platform_username || '(无)');
console.log('  登录状态:', account.login_status);
console.log('');

// 2. 查询会话数量
const conversations = db.prepare('SELECT * FROM conversations WHERE account_id = ? ORDER BY last_message_time DESC').all(account.id);
console.log('💬 会话统计:');
console.log('  总数:', conversations.length);
if (conversations.length > 0) {
  console.log('\n  前3个会话:');
  conversations.slice(0, 3).forEach((conv, i) => {
    console.log(`    ${i + 1}. ID: ${conv.id}`);
    console.log(`       用户名: ${conv.platform_user_name || '(无)'}`);
    console.log(`       最后消息时间: ${conv.last_message_time ? new Date(conv.last_message_time * 1000).toLocaleString('zh-CN') : '(无)'}`);
  });
}
console.log('');

// 3. 查询私信数量
const totalMessages = db.prepare('SELECT COUNT(*) as count FROM direct_messages WHERE account_id = ?').get(account.id).count;
console.log('📩 私信统计:');
console.log('  总数:', totalMessages);
console.log('');

// 4. 查询最新的消息
const messages = db.prepare(`
  SELECT * FROM direct_messages
  WHERE account_id = ?
  ORDER BY created_at DESC
  LIMIT 10
`).all(account.id);

if (messages.length > 0) {
  console.log('  最新 5 条消息:\n');
  messages.slice(0, 5).forEach((msg, i) => {
    console.log(`    消息 ${i + 1}:`);
    console.log(`      消息ID: ${msg.platform_message_id}`);
    console.log(`      会话ID: ${msg.conversation_id}`);
    console.log(`      方向: ${msg.direction === 'inbound' ? '接收' : '发送'}`);
    console.log(`      发送者ID: ${msg.platform_sender_id || '(无)'}`);
    console.log(`      发送者昵称: ${msg.sender_nickname || '(无)'}`);
    console.log(`      发送者头像: ${msg.sender_avatar ? '有' : '(无)'}`);
    console.log(`      内容: ${(msg.content || '').substring(0, 50)}...`);
    console.log(`      时间: ${new Date(msg.created_at * 1000).toLocaleString('zh-CN')}`);
    console.log('');
  });
}

// 5. 统计用户信息提取情况
const hasSenderIdCount = db.prepare(`
  SELECT COUNT(*) as count
  FROM direct_messages
  WHERE account_id = ?
    AND platform_sender_id IS NOT NULL
    AND platform_sender_id != 'unknown'
    AND platform_sender_id != 'self'
    AND platform_sender_id != 'other'
`).get(account.id).count;

const hasAvatarCount = db.prepare(`
  SELECT COUNT(*) as count
  FROM direct_messages
  WHERE account_id = ? AND sender_avatar IS NOT NULL
`).get(account.id).count;

const hasNicknameCount = db.prepare(`
  SELECT COUNT(*) as count
  FROM direct_messages
  WHERE account_id = ? AND sender_nickname IS NOT NULL
`).get(account.id).count;

console.log('📈 用户信息提取统计:');
console.log(`  有效发送者ID: ${hasSenderIdCount}/${totalMessages} (${(hasSenderIdCount / totalMessages * 100).toFixed(1)}%)`);
console.log(`  有头像: ${hasAvatarCount}/${totalMessages} (${(hasAvatarCount / totalMessages * 100).toFixed(1)}%)`);
console.log(`  有昵称: ${hasNicknameCount}/${totalMessages} (${(hasNicknameCount / totalMessages * 100).toFixed(1)}%)`);

console.log('\n========================================');

if (totalMessages === 0) {
  console.log('❌ 未发现任何私信数据入库！');
  console.log('   可能原因：');
  console.log('   1. 爬虫未执行');
  console.log('   2. Worker 发送数据但 Master 未接收');
  console.log('   3. Master 接收数据但未写入数据库');
} else if (totalMessages > 0 && hasSenderIdCount === totalMessages) {
  console.log('✅ 数据入库成功！用户信息提取功能正常！');
} else {
  console.log('⚠️ 数据已入库但用户信息提取不完整');
}

console.log('========================================\n');

db.close();
