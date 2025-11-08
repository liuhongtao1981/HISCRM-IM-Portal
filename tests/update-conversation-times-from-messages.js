/**
 * �?cache_messages 表更新会话的真实最后消息时�? */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 更新会话的真实最后消息时�?                          �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 1. 获取所有会�?const conversations = db.prepare(`
  SELECT
    id,
    user_id,
    json_extract(data, '$.userName') as user_name,
    last_message_time as old_time
  FROM cache_conversations
  WHERE account_id = ?
`).all(accountId);

console.log(`找到 ${conversations.length} 个会话\n`);

// 2. 为每个会话查找真实的最后消息时�?const updates = [];

conversations.forEach(conv => {
  // 查找这个 user_id 对应的最后消息时�?  const latestMessage = db.prepare(`
    SELECT MAX(created_at) as latest_time
    FROM cache_messages
    WHERE account_id = ? AND conversation_id = ?
  `).get(accountId, conv.user_id);

  if (latestMessage && latestMessage.latest_time) {
    // cache_messages.created_at 现在已经是毫秒级时间戳，直接使用
    const newTime = latestMessage.latest_time;

    updates.push({
      id: conv.id,
      user_name: conv.user_name,
      old_time: conv.old_time,
      new_time: newTime,
      latest_time_ms: latestMessage.latest_time
    });
  }
});

console.log(`找到 ${updates.length} 个会话有真实的消息时间\n`);

if (updates.length === 0) {
  console.log('⚠️  没有需要更新的会话');
  db.close();
  process.exit(0);
}

// 3. 显示将要更新的记�?console.log('将要更新的会�?\n');

updates.forEach((update, index) => {
  const oldDate = new Date(update.old_time);
  const newDate = new Date(update.new_time);

  console.log(`${index + 1}. ${update.user_name}`);
  console.log(`   旧时�? ${oldDate.toLocaleString('zh-CN')}`);
  console.log(`   新时�? ${newDate.toLocaleString('zh-CN')}`);
  console.log(`   消息时间�? ${update.latest_time_ms} (毫秒�?`);
  console.log('');
});

// 4. 执行更新
console.log('开始更�?..\n');

const updateStmt = db.prepare(`
  UPDATE cache_conversations
  SET last_message_time = ?,
      data = json_set(data, '$.lastMessageTime', ?),
      updated_at = ?
  WHERE id = ?
`);

let updatedCount = 0;
const now = Date.now();

try {
  db.exec('BEGIN TRANSACTION');

  updates.forEach(update => {
    updateStmt.run(update.new_time, update.new_time, now, update.id);
    updatedCount++;
  });

  db.exec('COMMIT');

  console.log('══════════════════════════════════════════════════════�?);
  console.log(`�?成功更新 ${updatedCount} 个会话的时间戳`);
  console.log('═══════════════════════════════════════════════════════\n');
} catch (error) {
  db.exec('ROLLBACK');
  console.error('�?更新失败:', error);
  db.close();
  process.exit(1);
}

// 5. 验证结果
const verifyQuery = db.prepare(`
  SELECT
    json_extract(data, '$.userName') as user_name,
    json_extract(data, '$.lastMessageTime') as lastMessageTime,
    last_message_time,
    datetime(last_message_time / 1000, 'unixepoch', 'localtime') as formatted_time
  FROM cache_conversations
  WHERE account_id = ?
  ORDER BY last_message_time DESC
`);

const updated = verifyQuery.all(accountId);

console.log('更新后的会话列表（按时间排序�?\n');

updated.forEach((conv, index) => {
  console.log(`${index + 1}. ${conv.user_name}`);
  console.log(`   时间: ${conv.formatted_time}`);
  console.log(`   时间�? ${conv.last_message_time} (毫秒�?`);
  console.log('');
});

console.log('═══════════════════════════════════════════════════════\n');

db.close();
