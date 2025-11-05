const db = require('better-sqlite3')('./packages/master/data/master.db');

console.log('=== 检查数据库时间戳格式 ===\n');

console.log('1. cache_messages 表 (最新5条):');
const msgs = db.prepare('SELECT id, data FROM cache_messages ORDER BY persist_at DESC LIMIT 5').all();
msgs.forEach((row, i) => {
  const data = JSON.parse(row.data);
  console.log(`\n消息${i+1}: ${row.id.substring(0, 50)}...`);
  console.log(`  createdAt: ${data.createdAt}`);
  console.log(`  类型: ${typeof data.createdAt}`);
  if (typeof data.createdAt === 'number') {
    const date = new Date(data.createdAt);
    console.log(`  ✅ 转换: ${date.toLocaleString('zh-CN')} (年份: ${date.getFullYear()})`);
  }
});

console.log('\n\n2. cache_conversations 表 (最新5条):');
const convs = db.prepare('SELECT id, data FROM cache_conversations ORDER BY id DESC LIMIT 5').all();
convs.forEach((row, i) => {
  const data = JSON.parse(row.data);
  console.log(`\n会话${i+1}: ${data.senderName || data.conversationId}`);
  console.log(`  lastMessageTime: ${data.lastMessageTime}`);
  console.log(`  类型: ${typeof data.lastMessageTime}`);
  if (typeof data.lastMessageTime === 'number') {
    const date = new Date(data.lastMessageTime);
    console.log(`  ✅ 转换: ${date.toLocaleString('zh-CN')} (年份: ${date.getFullYear()})`);
  }
});

console.log('\n\n3. cache_contents 表 (最新3条):');
const contents = db.prepare('SELECT id, data FROM cache_contents ORDER BY id DESC LIMIT 3').all();
contents.forEach((row, i) => {
  const data = JSON.parse(row.data);
  console.log(`\n作品${i+1}: ${data.title?.substring(0, 30)}`);
  console.log(`  publishTime: ${data.publishTime}`);
  console.log(`  类型: ${typeof data.publishTime}`);
  if (typeof data.publishTime === 'number') {
    const date = new Date(data.publishTime * 1000);
    console.log(`  ✅ 转换: ${date.toLocaleString('zh-CN')} (年份: ${date.getFullYear()})`);
  }
});

db.close();
