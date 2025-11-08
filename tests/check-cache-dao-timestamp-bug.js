/**
 * 检�?CacheDAO 时间戳格式问�? *
 * 问题：CacheDAO.batchUpsertMessages() 将毫秒级时间戳转换为秒级存储
 * �?schema.sql 定义的是毫秒�?INTEGER
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 检�?CacheDAO 时间戳格式问�?                         �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 1. 检查消息表的时间戳
console.log('�?】检�?cache_messages 表的 created_at 字段:\n');

const messages = db.prepare(`
  SELECT
    id,
    created_at,
    CASE
      WHEN created_at < 10000000000 THEN '秒级 (10�?'
      WHEN created_at < 100000000000 THEN '秒级 (11�?'
      WHEN created_at < 10000000000000 THEN '毫秒�?(13�?'
      ELSE '未知格式'
    END as format_type,
    datetime(created_at / 1000, 'unixepoch', 'localtime') as formatted_time_assume_ms,
    datetime(created_at, 'unixepoch', 'localtime') as formatted_time_assume_sec
  FROM cache_messages
  WHERE account_id = ?
  LIMIT 5
`).all(accountId);

messages.forEach((msg, index) => {
  console.log(`${index + 1}. Message ID: ${msg.id.substring(0, 40)}...`);
  console.log(`   created_at: ${msg.created_at}`);
  console.log(`   格式类型: ${msg.format_type}`);
  console.log(`   假设是毫秒级: ${msg.formatted_time_assume_ms}`);
  console.log(`   假设是秒�? ${msg.formatted_time_assume_sec}`);
  console.log('');
});

// 2. 检查会话表的时间戳
console.log('\n�?】检�?cache_conversations 表的 last_message_time 字段:\n');

const conversations = db.prepare(`
  SELECT
    id,
    user_id,
    last_message_time,
    CASE
      WHEN last_message_time < 10000000000 THEN '秒级 (10�?'
      WHEN last_message_time < 100000000000 THEN '秒级 (11�?'
      WHEN last_message_time < 10000000000000 THEN '毫秒�?(13�?'
      ELSE '未知格式'
    END as format_type,
    datetime(last_message_time / 1000, 'unixepoch', 'localtime') as formatted_time_assume_ms,
    datetime(last_message_time, 'unixepoch', 'localtime') as formatted_time_assume_sec,
    json_extract(data, '$.userName') as user_name
  FROM cache_conversations
  WHERE account_id = ?
  ORDER BY last_message_time DESC
`).all(accountId);

conversations.forEach((conv, index) => {
  console.log(`${index + 1}. ${conv.user_name}`);
  console.log(`   last_message_time: ${conv.last_message_time}`);
  console.log(`   格式类型: ${conv.format_type}`);
  console.log(`   假设是毫秒级: ${conv.formatted_time_assume_ms}`);
  console.log(`   假设是秒�? ${conv.formatted_time_assume_sec}`);
  console.log('');
});

// 3. 分析结论
console.log('╔═══════════════════════════════════════════════════════�?);
console.log('�? 分析结论                                             �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const messageCount = db.prepare('SELECT COUNT(*) as count FROM cache_messages WHERE account_id = ?').get(accountId);
const conversationCount = db.prepare('SELECT COUNT(*) as count FROM cache_conversations WHERE account_id = ?').get(accountId);

console.log(`消息总数: ${messageCount.count}`);
console.log(`会话总数: ${conversationCount.count}\n`);

if (messages.length > 0) {
  const firstMessage = messages[0];

  if (firstMessage.created_at < 10000000000) {
    console.log('�?问题确认: cache_messages.created_at 是秒级时间戳');
    console.log('   原因: CacheDAO.batchUpsertMessages() �?Line 396-398 将毫秒转换为�?);
    console.log('   修复方案: 删除 CacheDAO 中的时间戳转换逻辑，保持毫秒级');
  } else {
    console.log('�?cache_messages.created_at 是毫秒级时间�?);
  }
  console.log('');
}

if (conversations.length > 0) {
  const firstConv = conversations[0];

  if (firstConv.last_message_time < 10000000000) {
    console.log('�?问题确认: cache_conversations.last_message_time 是秒级时间戳');
    console.log('   原因: 可能�?batchUpsertConversations() 中也有类似转�?);
  } else {
    console.log('�?cache_conversations.last_message_time 是毫秒级时间�?);
  }
}

console.log('\n═══════════════════════════════════════════════════════\n');

db.close();
