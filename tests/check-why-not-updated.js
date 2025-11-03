/**
 * 检查为什么时间戳没有更新成功
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n检查数据库状态...\n');

// 检查会话表
const conversations = db.prepare(`
  SELECT
    id,
    user_id,
    last_message_time,
    json_extract(data, '$.userName') as user_name
  FROM cache_conversations
  WHERE account_id = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  LIMIT 5
`).all();

console.log('会话表前 5 条:');
conversations.forEach(conv => {
  console.log(`- ${conv.user_name}: last_message_time = ${conv.last_message_time}`);
});

// 检查消息表
const messages = db.prepare(`
  SELECT
    conversation_id,
    MAX(created_at) as latest_time,
    COUNT(*) as count
  FROM cache_messages
  WHERE account_id = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  GROUP BY conversation_id
  LIMIT 5
`).all();

console.log('\n消息表前 5 个会话:');
messages.forEach(msg => {
  console.log(`- conversation_id: ${msg.conversation_id.substring(0, 30)}...`);
  console.log(`  latest_time: ${msg.latest_time} (${new Date(msg.latest_time * 1000).toLocaleString('zh-CN')})`);
  console.log(`  count: ${msg.count}`);
});

// 检查是否匹配
console.log('\n检查 user_id 和 conversation_id 是否匹配...\n');

const conv1 = conversations[0];
const hasMatch = messages.some(msg => msg.conversation_id === conv1.user_id);

console.log(`会话 "${conv1.user_name}" 的 user_id: ${conv1.user_id.substring(0, 50)}...`);
console.log(`是否在消息表中找到匹配: ${hasMatch ? '✅ 是' : '❌ 否'}`);

if (!hasMatch) {
  console.log('\n⚠️  问题发现：user_id 和 conversation_id 不匹配！');
  console.log('消息表的第一个 conversation_id:');
  console.log(messages[0].conversation_id);
}

db.close();
