/**
 * 调试 getMessagesFromDataStore 方法
 */

const Database = require('better-sqlite3');

// 模拟 DataStore 结构
const db = new Database('packages/master/data/master.db');

// 加载数据
const metadata = db.prepare('SELECT account_id FROM cache_metadata LIMIT 1').get();
const accountId = metadata.account_id;

const messagesRows = db.prepare('SELECT data FROM cache_messages WHERE account_id = ?').all(accountId);
const conversationsRows = db.prepare('SELECT data FROM cache_conversations WHERE account_id = ?').all(accountId);

console.log('='.repeat(80));
console.log('模拟 DataStore 加载逻辑');
console.log('='.repeat(80));
console.log('');

// 模拟 DataStore 的 messages Map
const messages = new Map();
messagesRows.forEach(row => {
  const message = JSON.parse(row.data);
  messages.set(message.id, message);  // ⚠️ 使用 message.id 作为 key
});

console.log(`DataStore messages Map 大小: ${messages.size}`);
console.log('');

// 打印前3个 key
let count = 0;
for (const [key, value] of messages) {
  if (count < 3) {
    console.log(`Key ${count + 1}: ${key}`);
    console.log(`  conversationId: ${value.conversationId}`);
    console.log(`  content: ${value.content?.substring(0, 30)}...`);
    count++;
  }
}
console.log('');

// 模拟 conversations
const conversations = conversationsRows.map(row => JSON.parse(row.data));
console.log(`会话数: ${conversations.length}`);
console.log('');

// 测试过滤逻辑
const testConv = conversations[0];
const topicId = testConv.conversationId;

console.log(`测试会话:`);
console.log(`  conversationId: ${topicId}`);
console.log(`  userName: ${testConv.userName}`);
console.log('');

// 模拟 getMessagesFromDataStore 的过滤
const messagesList = Array.from(messages.values());
console.log(`消息总数: ${messagesList.length}`);

const filteredMessages = messagesList.filter(m => m.conversationId === topicId);
console.log(`过滤后消息数 (conversationId === topicId): ${filteredMessages.length}`);
console.log('');

if (filteredMessages.length > 0) {
  console.log('✅ 过滤逻辑正常工作！');
  console.log('');
  console.log('第一条匹配的消息:');
  console.log(`  messageId: ${filteredMessages[0].messageId}`);
  console.log(`  conversationId: ${filteredMessages[0].conversationId}`);
  console.log(`  content: ${filteredMessages[0].content}`);
} else {
  console.log('❌ 过滤失败！没有匹配的消息');
  console.log('');
  console.log('调试信息:');
  console.log(`  topicId: ${topicId}`);
  console.log(`  topicId 类型: ${typeof topicId}`);
  console.log('');
  console.log('所有消息的 conversationId:');
  const uniqueConvIds = [...new Set(messagesList.map(m => m.conversationId))];
  uniqueConvIds.slice(0, 5).forEach(id => {
    console.log(`    ${id} (类型: ${typeof id})`);
  });
}

db.close();
