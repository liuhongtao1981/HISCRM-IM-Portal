/**
 * 分析会话时间戳问�? */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

// 查询所有会�?const conversations = db.prepare(`
  SELECT
    id,
    user_id,
    last_message_time,
    data,
    datetime(last_message_time / 1000, 'unixepoch', 'localtime') as formatted_time
  FROM cache_conversations
  WHERE account_id = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  ORDER BY last_message_time DESC
`).all();

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 会话时间戳分析（cache_conversations�?                �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');
console.log(`总计: ${conversations.length} 个会话\n`);

// 统计时间�?const timestampGroups = {};
conversations.forEach(conv => {
  const timestamp = conv.last_message_time;
  if (!timestampGroups[timestamp]) {
    timestampGroups[timestamp] = [];
  }

  const dataObj = JSON.parse(conv.data);
  timestampGroups[timestamp].push({
    userName: dataObj.userName,
    userId: conv.user_id
  });
});

console.log('══════════════════════════════════════════════════════�?);
console.log('  时间戳分组统�?);
console.log('═══════════════════════════════════════════════════════\n');

Object.keys(timestampGroups).sort((a, b) => b - a).forEach(timestamp => {
  const convs = timestampGroups[timestamp];
  const date = new Date(parseInt(timestamp));
  console.log(`时间�? ${timestamp}`);
  console.log(`日期: ${date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log(`会话�? ${convs.length} 个`);
  convs.forEach(conv => {
    console.log(`  - ${conv.userName}`);
  });
  console.log('');
});

// 查询 cache_messages 表，查看是否有真实的消息时间
console.log('══════════════════════════════════════════════════════�?);
console.log('  查询 cache_messages 表获取真实消息时�?);
console.log('═══════════════════════════════════════════════════════\n');

const messagesQuery = db.prepare(`
  SELECT
    conversation_id,
    MAX(created_at) as latest_message_time,
    COUNT(*) as message_count,
    datetime(MAX(created_at), 'unixepoch', 'localtime') as formatted_time
  FROM cache_messages
  WHERE account_id = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  GROUP BY conversation_id
  ORDER BY latest_message_time DESC
`);

const messagesData = messagesQuery.all();
console.log(`找到 ${messagesData.length} 个会话有真实消息记录\n`);

messagesData.forEach((msg, index) => {
  // �?conversation_id 中提�?user_id
  const userId = msg.conversation_id;
  const conv = conversations.find(c => c.user_id === userId);

  if (conv) {
    const dataObj = JSON.parse(conv.data);
    console.log(`${index + 1}. ${dataObj.userName}`);
    console.log(`   最新消息时�? ${msg.formatted_time}`);
    console.log(`   时间�? ${msg.latest_message_time}`);
    console.log(`   消息�? ${msg.message_count}`);
    console.log(`   会话表中的时�? ${new Date(conv.last_message_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    console.log(`   ⚠️  时间不匹�? (相差 ${Math.abs(msg.latest_message_time - conv.last_message_time / 1000)} �?`);
    console.log('');
  }
});

db.close();
