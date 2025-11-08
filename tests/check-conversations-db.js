/**
 * 检查数据库中的会话数据
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

const conversations = db.prepare(`
  SELECT
    conversation_id,
    nickname,
    user_id,
    last_message_time,
    unread_count,
    datetime(last_message_time, 'unixepoch', 'localtime') as formatted_time
  FROM cache_conversations
  WHERE account_id = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  ORDER BY last_message_time DESC
`).all();

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? Master 数据库中的会话数据（cache_conversations�?    �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');
console.log(`总计: ${conversations.length} 个会话\n`);

conversations.forEach((conv, index) => {
  const time = new Date(conv.last_message_time * 1000);
  const formattedTime = `${time.getMonth() + 1}/${time.getDate()}`;

  console.log(`${index + 1}. ${conv.nickname || conv.user_id}`);
  console.log(`   用户ID: ${conv.user_id}`);
  console.log(`   会话ID: ${conv.conversation_id}`);
  console.log(`   最后消息时�? ${formattedTime} (${conv.formatted_time})`);
  console.log(`   时间�? ${conv.last_message_time}`);
  console.log(`   未读�? ${conv.unread_count || 0}`);
  console.log('');
});

console.log('═══════════════════════════════════════════════════════\n');

db.close();
