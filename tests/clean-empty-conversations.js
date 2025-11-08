/**
 * 清理没有消息记录的会�? * 只保留有真实消息的会�? */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 清理没有消息记录的会�?                              �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

// 1. 查找没有消息记录的会�?const emptyConversations = db.prepare(`
  SELECT
    c.id,
    c.user_id,
    json_extract(c.data, '$.userName') as user_name
  FROM cache_conversations c
  LEFT JOIN cache_messages m ON c.user_id = m.conversation_id AND c.account_id = m.account_id
  WHERE c.account_id = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  GROUP BY c.id
  HAVING COUNT(m.id) = 0
`).all();

console.log(`找到 ${emptyConversations.length} 个没有消息记录的会话:\n`);

emptyConversations.forEach((conv, index) => {
  console.log(`${index + 1}. ${conv.user_name || conv.user_id.substring(0, 30)}`);
});

console.log('\n是否删除这些会话? (y/n)');
console.log('⚠️  注意：这是不可逆操作！\n');

// 自动删除（无需确认�?console.log('开始删�?..\n');

const deleteStmt = db.prepare(`
  DELETE FROM cache_conversations
  WHERE id = ?
`);

let deletedCount = 0;

const transaction = db.transaction(() => {
  emptyConversations.forEach((conv) => {
    deleteStmt.run(conv.id);
    deletedCount++;
  });
});

try {
  transaction();
  console.log('══════════════════════════════════════════════════════�?);
  console.log(`�?已删�?${deletedCount} 个空会话`);
  console.log('═══════════════════════════════════════════════════════\n');
} catch (error) {
  console.error('�?删除失败:', error);
  process.exit(1);
}

// 2. 验证结果
console.log('验证清理结果...\n');

const remainingConversations = db.prepare(`
  SELECT
    json_extract(data, '$.userName') as user_name,
    last_message_time,
    datetime(last_message_time / 1000, 'unixepoch', 'localtime') as formatted_time
  FROM cache_conversations
  WHERE account_id = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  ORDER BY last_message_time DESC
`).all();

console.log(`剩余 ${remainingConversations.length} 个会话（均有消息记录�?\n`);

remainingConversations.forEach((conv, index) => {
  console.log(`${index + 1}. ${conv.user_name}`);
  console.log(`   时间: ${conv.formatted_time}`);
});

console.log('\n═══════════════════════════════════════════════════════\n');

db.close();
