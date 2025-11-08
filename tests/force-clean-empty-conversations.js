/**
 * 强制清理没有消息记录的会话（修复版）
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 强制清理没有消息记录的会�?                          �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 1. 统计当前状�?const totalConvs = db.prepare(`
  SELECT COUNT(*) as count FROM cache_conversations WHERE account_id = ?
`).get(accountId);

const totalMessages = db.prepare(`
  SELECT COUNT(DISTINCT conversation_id) as count FROM cache_messages WHERE account_id = ?
`).get(accountId);

console.log(`当前状�?`);
console.log(`  - 会话总数: ${totalConvs.count}`);
console.log(`  - 有消息的会话: ${totalMessages.count}`);
console.log(`  - 空会话数: ${totalConvs.count - totalMessages.count}\n`);

// 2. 获取所有有消息记录�?conversation_id
const conversationsWithMessages = db.prepare(`
  SELECT DISTINCT conversation_id
  FROM cache_messages
  WHERE account_id = ?
`).all(accountId).map(row => row.conversation_id);

console.log(`有消息记录的 conversation_id 列表（前 5 个）:`);
conversationsWithMessages.slice(0, 5).forEach(id => {
  console.log(`  - ${id}`);
});
console.log('');

// 3. 查找所有会话的 user_id
const allConversations = db.prepare(`
  SELECT id, user_id, json_extract(data, '$.userName') as user_name
  FROM cache_conversations
  WHERE account_id = ?
`).all(accountId);

console.log(`所有会话的 user_id 列表（前 5 个）:`);
allConversations.slice(0, 5).forEach(conv => {
  console.log(`  - ${conv.user_name}: ${conv.user_id.substring(0, 30)}...`);
});
console.log('');

// 4. 找出需要删除的会话
const conversationsToDelete = [];

allConversations.forEach(conv => {
  // 检查这个会话是否有消息记录
  // 注意：这里需要检�?user_id 是否等于任何 conversation_id
  const hasMessages = conversationsWithMessages.includes(conv.user_id);

  if (!hasMessages) {
    conversationsToDelete.push(conv);
  }
});

console.log(`需要删除的会话�? ${conversationsToDelete.length}\n`);

if (conversationsToDelete.length > 0) {
  console.log('将要删除的会�?');
  conversationsToDelete.forEach((conv, index) => {
    console.log(`${index + 1}. ${conv.user_name || conv.user_id.substring(0, 30)}`);
  });
  console.log('');
}

// 5. 执行删除
if (conversationsToDelete.length > 0) {
  console.log('开始删�?..\n');

  const deleteStmt = db.prepare(`
    DELETE FROM cache_conversations WHERE id = ?
  `);

  let deletedCount = 0;

  try {
    db.exec('BEGIN TRANSACTION');

    conversationsToDelete.forEach((conv) => {
      deleteStmt.run(conv.id);
      deletedCount++;
    });

    db.exec('COMMIT');

    console.log('══════════════════════════════════════════════════════�?);
    console.log(`�?成功删除 ${deletedCount} 个空会话`);
    console.log('═══════════════════════════════════════════════════════\n');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('�?删除失败:', error);
    process.exit(1);
  }

  // 6. 验证结果
  const remainingConvs = db.prepare(`
    SELECT COUNT(*) as count FROM cache_conversations WHERE account_id = ?
  `).get(accountId);

  console.log(`删除后的状�?`);
  console.log(`  - 剩余会话�? ${remainingConvs.count}`);
  console.log(`  - 预期会话�? ${totalMessages.count}`);
  console.log(`  - 验证: ${remainingConvs.count === totalMessages.count ? '�?正确' : '�?错误'}\n`);

  // 7. 列出剩余的会�?  const remaining = db.prepare(`
    SELECT
      json_extract(data, '$.userName') as user_name,
      json_extract(data, '$.lastMessageTime') as last_message_time
    FROM cache_conversations
    WHERE account_id = ?
    ORDER BY json_extract(data, '$.lastMessageTime') DESC
    LIMIT 10
  `).all(accountId);

  console.log('剩余的会话（�?10 个）:');
  remaining.forEach((conv, index) => {
    const time = new Date(conv.last_message_time);
    console.log(`${index + 1}. ${conv.user_name} (${time.toLocaleString('zh-CN')})`);
  });
} else {
  console.log('�?没有需要删除的空会�?);
}

console.log('\n═══════════════════════════════════════════════════════\n');

db.close();
