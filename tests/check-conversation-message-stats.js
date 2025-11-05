const Database = require('better-sqlite3');
const db = new Database('packages/master/data/master.db');

// 获取所有会话
const conversations = db.prepare('SELECT data FROM cache_conversations').all();
const convs = conversations.map(r => JSON.parse(r.data));

// 获取所有消息
const messages = db.prepare('SELECT data FROM cache_messages').all();
const msgs = messages.map(r => JSON.parse(r.data));

// 统计
const msgConvIds = msgs.map(m => m.conversationId);
const uniqueMsgConvIds = [...new Set(msgConvIds)];

console.log(`总会话数: ${convs.length}`);
console.log(`总消息数: ${msgs.length}`);
console.log(`有消息的会话数: ${uniqueMsgConvIds.length}`);
console.log(`没有消息的会话数: ${convs.length - uniqueMsgConvIds.length}`);
console.log('');

// 统计每个会话的消息数
const convMsgCount = {};
msgs.forEach(m => {
  convMsgCount[m.conversationId] = (convMsgCount[m.conversationId] || 0) + 1;
});

console.log('有消息的会话（前10个）:');
Object.entries(convMsgCount).slice(0, 10).forEach(([id, count]) => {
  const conv = convs.find(c => c.conversationId === id);
  console.log(`  ${conv?.userName || 'Unknown'}: ${count} 条消息`);
});

db.close();
