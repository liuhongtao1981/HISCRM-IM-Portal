/**
 * 检查消息历史记�? */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 检�?cache_messages 表的历史记录                     �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 查询所有消息，按时间排�?const messages = db.prepare(`
  SELECT
    id,
    conversation_id,
    created_at,
    datetime(created_at / 1000, 'unixepoch', 'localtime') as formatted_time,
    json_extract(data, '$.content.text') as text
  FROM cache_messages
  WHERE account_id = ?
  ORDER BY created_at ASC
`).all(accountId);

console.log(`总共 ${messages.length} 条消息\n`);

// 显示�?10 条（最旧的�?console.log('最旧的 10 条消�?\n');
messages.slice(0, 10).forEach((msg, index) => {
  console.log(`${index + 1}. ${msg.formatted_time}`);
  console.log(`   Message ID: ${msg.id.substring(0, 40)}...`);
  console.log(`   Conversation: ${msg.conversation_id.substring(0, 40)}...`);
  console.log(`   Text: ${(msg.text || '').substring(0, 60)}`);
  console.log('');
});

// 显示最�?10 条（最新的�?console.log('\n最新的 10 条消�?\n');
messages.slice(-10).forEach((msg, index) => {
  console.log(`${index + 1}. ${msg.formatted_time}`);
  console.log(`   Message ID: ${msg.id.substring(0, 40)}...`);
  console.log(`   Conversation: ${msg.conversation_id.substring(0, 40)}...`);
  console.log(`   Text: ${(msg.text || '').substring(0, 60)}`);
  console.log('');
});

// 检查是否有 1 月份的消�?const januaryMessages = messages.filter(msg => {
  const date = new Date(msg.created_at);
  return date.getMonth() === 0; // 0 = January
});

console.log(`\n═══════════════════════════════════════════════════════`);
console.log(`发现 ${januaryMessages.length} �?1 月份的消息`);
console.log(`═══════════════════════════════════════════════════════\n`);

if (januaryMessages.length > 0) {
  console.log('1 月份的消�?\n');
  januaryMessages.forEach((msg, index) => {
    console.log(`${index + 1}. ${msg.formatted_time}`);
    console.log(`   Conversation: ${msg.conversation_id.substring(0, 40)}...`);
    console.log('');
  });
}

db.close();
