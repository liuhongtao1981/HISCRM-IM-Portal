/**
 * 检�?conversation 对象的时间戳字段
 *
 * 目的：查�?DataStore �?conversation 对象有哪些时间戳相关字段
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 检�?conversation 对象的时间戳字段                    �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 从数据库读取 conversation 数据
const conversations = db.prepare(`
  SELECT * FROM cache_conversations
  WHERE account_id = ?
  ORDER BY last_message_time DESC
  LIMIT 5
`).all(accountId);

console.log(`找到 ${conversations.length} 个会话记录\n`);

if (conversations.length > 0) {
  console.log('【第一个会话的完整数据】\n');
  const first = conversations[0];

  console.log('数据库字�?');
  console.log(`  id: ${first.id}`);
  console.log(`  user_id: ${first.user_id}`);
  console.log(`  last_message_time: ${first.last_message_time}`);
  console.log(`    �?转换为日�? ${new Date(first.last_message_time).toLocaleString('zh-CN')}`);
  console.log(`  created_at: ${first.created_at}`);
  console.log(`    �?转换为日�? ${new Date(first.created_at).toLocaleString('zh-CN')}`);
  console.log(`  updated_at: ${first.updated_at}`);
  console.log(`    �?转换为日�? ${new Date(first.updated_at).toLocaleString('zh-CN')}`);
  console.log('');

  console.log('JSON data 字段:');
  const data = JSON.parse(first.data);
  console.log(`  所有字�? ${Object.keys(data).join(', ')}`);
  console.log('');

  // 检�?data 中是否有时间戳字�?  const timestampFields = Object.keys(data).filter(key =>
    key.toLowerCase().includes('time') ||
    key.toLowerCase().includes('at') ||
    key.toLowerCase().includes('date')
  );

  if (timestampFields.length > 0) {
    console.log('data 中的时间戳相关字�?');
    timestampFields.forEach(field => {
      const value = data[field];
      if (typeof value === 'number') {
        console.log(`  ${field}: ${value} �?${new Date(value).toLocaleString('zh-CN')}`);
      } else {
        console.log(`  ${field}: ${value}`);
      }
    });
    console.log('');
  }

  // 打印完整�?data 对象
  console.log('完整�?data 对象:');
  console.log(JSON.stringify(data, null, 2));
  console.log('');
}

console.log('══════════════════════════════════════════════════════�?);
console.log('\n【DataStore 转换后的 conversation 对象结构】\n');
console.log('根据 DataStore �?_loadConversationsFromDB 方法:');
console.log('');
console.log('const conversationObj = {');
console.log('  accountId: row.account_id,');
console.log('  conversationId: row.user_id,          // 注意: user_id 映射�?conversationId');
console.log('  userName: userData.userName,');
console.log('  avatarUrl: userData.avatarUrl,');
console.log('  ...(其他 userData 字段),');
console.log('  lastMessageTime: row.last_message_time, // �?这是正确的字�?');
console.log('  unreadCount: userData.unreadCount || 0,');
console.log('  createdAt: row.created_at,');
console.log('  updatedAt: row.updated_at');
console.log('};');
console.log('');

console.log('══════════════════════════════════════════════════════�?);
console.log('\n结论�?);
console.log('  im-websocket-server.js �?387 行应该使�?');
console.log('  �?错误: lastMessageTime: conversation.updatedAt');
console.log('  �?正确: lastMessageTime: conversation.lastMessageTime');
console.log('');
console.log('═══════════════════════════════════════════════════════\n');

db.close();
