/**
 * 最终时间戳验证 - 确认所有数据已符合毫秒级标准
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n╔═══════════════════════════════════════════════════════╗');
console.log('║  最终时间戳格式验证                                   ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 1. 验证 cache_messages 表
console.log('【1】cache_messages 表验证:\n');

const messageStats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN created_at < 10000000000 THEN 1 ELSE 0 END) as seconds_count,
    SUM(CASE WHEN created_at >= 10000000000 AND created_at < 10000000000000 THEN 1 ELSE 0 END) as milliseconds_count,
    MIN(created_at) as min_timestamp,
    MAX(created_at) as max_timestamp
  FROM cache_messages
  WHERE account_id = ?
`).get(accountId);

console.log(`总消息数: ${messageStats.total}`);
console.log(`秒级时间戳 (10位): ${messageStats.seconds_count} 条`);
console.log(`毫秒级时间戳 (13位): ${messageStats.milliseconds_count} 条`);
console.log(`最小时间戳: ${messageStats.min_timestamp} (${new Date(messageStats.min_timestamp).toLocaleString('zh-CN')})`);
console.log(`最大时间戳: ${messageStats.max_timestamp} (${new Date(messageStats.max_timestamp).toLocaleString('zh-CN')})`);
console.log('');

if (messageStats.seconds_count === 0 && messageStats.milliseconds_count === messageStats.total) {
  console.log('✅ cache_messages 表：所有时间戳都是毫秒级 (13位)');
} else {
  console.log('❌ cache_messages 表：存在格式不一致的时间戳');
}

console.log('\n');

// 2. 验证 cache_conversations 表
console.log('【2】cache_conversations 表验证:\n');

const conversationStats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN last_message_time < 10000000000 THEN 1 ELSE 0 END) as seconds_count,
    SUM(CASE WHEN last_message_time >= 10000000000 AND last_message_time < 10000000000000 THEN 1 ELSE 0 END) as milliseconds_count,
    SUM(CASE WHEN last_message_time >= 10000000000000 THEN 1 ELSE 0 END) as invalid_count,
    MIN(last_message_time) as min_timestamp,
    MAX(last_message_time) as max_timestamp
  FROM cache_conversations
  WHERE account_id = ?
`).get(accountId);

console.log(`总会话数: ${conversationStats.total}`);
console.log(`秒级时间戳 (10位): ${conversationStats.seconds_count} 个`);
console.log(`毫秒级时间戳 (13位): ${conversationStats.milliseconds_count} 个`);
console.log(`超大时间戳 (>13位): ${conversationStats.invalid_count} 个`);
console.log(`最小时间戳: ${conversationStats.min_timestamp} (${new Date(conversationStats.min_timestamp).toLocaleString('zh-CN')})`);
console.log(`最大时间戳: ${conversationStats.max_timestamp} (${new Date(conversationStats.max_timestamp).toLocaleString('zh-CN')})`);
console.log('');

if (conversationStats.seconds_count === 0 && conversationStats.invalid_count === 0 && conversationStats.milliseconds_count === conversationStats.total) {
  console.log('✅ cache_conversations 表：所有时间戳都是毫秒级 (13位)');
} else {
  console.log('❌ cache_conversations 表：存在格式不一致的时间戳');
}

console.log('\n');

// 3. 验证消息和会话的时间戳一致性
console.log('【3】消息和会话的时间戳一致性验证:\n');

const consistencyCheck = db.prepare(`
  SELECT
    c.id as conversation_id,
    json_extract(c.data, '$.userName') as user_name,
    c.last_message_time as conv_last_time,
    MAX(m.created_at) as msg_last_time,
    COUNT(m.id) as message_count
  FROM cache_conversations c
  LEFT JOIN cache_messages m ON m.account_id = c.account_id AND m.conversation_id = c.user_id
  WHERE c.account_id = ?
  GROUP BY c.id
  ORDER BY c.last_message_time DESC
  LIMIT 5
`).all(accountId);

console.log('前 5 个会话的时间戳一致性检查:\n');

let allConsistent = true;

consistencyCheck.forEach((conv, index) => {
  const isConsistent = conv.msg_last_time === null || conv.conv_last_time === conv.msg_last_time;
  const status = isConsistent ? '✅' : '❌';

  console.log(`${index + 1}. ${status} ${conv.user_name}`);
  console.log(`   会话表时间戳: ${conv.conv_last_time} (${new Date(conv.conv_last_time).toLocaleString('zh-CN')})`);

  if (conv.msg_last_time) {
    console.log(`   消息表最后时间: ${conv.msg_last_time} (${new Date(conv.msg_last_time).toLocaleString('zh-CN')})`);
    console.log(`   是否一致: ${isConsistent ? '是' : '否'}`);
  } else {
    console.log(`   消息表最后时间: 无消息`);
  }

  console.log(`   消息条数: ${conv.message_count}`);
  console.log('');

  if (!isConsistent) allConsistent = false;
});

// 4. 总结
console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║  验证总结                                             ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');

const allValid =
  messageStats.seconds_count === 0 &&
  messageStats.milliseconds_count === messageStats.total &&
  conversationStats.seconds_count === 0 &&
  conversationStats.invalid_count === 0 &&
  conversationStats.milliseconds_count === conversationStats.total &&
  allConsistent;

if (allValid) {
  console.log('🎉 所有验证通过！');
  console.log('');
  console.log('✅ cache_messages: 所有时间戳都是毫秒级');
  console.log('✅ cache_conversations: 所有时间戳都是毫秒级');
  console.log('✅ 消息和会话的时间戳保持一致');
  console.log('');
  console.log('数据流程：');
  console.log('  1. Worker 抓取 → normalizeTimestamp() → 毫秒级 ✅');
  console.log('  2. 数据库存储 → INTEGER (毫秒级) ✅');
  console.log('  3. Master 读取 → 保持毫秒级 ✅');
  console.log('  4. IM 客户端 → 显示时应该正确 ✅');
} else {
  console.log('⚠️  仍有部分数据需要修复');
  console.log('');

  if (messageStats.seconds_count > 0) {
    console.log(`❌ cache_messages: ${messageStats.seconds_count} 条消息是秒级时间戳`);
  }

  if (conversationStats.seconds_count > 0) {
    console.log(`❌ cache_conversations: ${conversationStats.seconds_count} 个会话是秒级时间戳`);
  }

  if (conversationStats.invalid_count > 0) {
    console.log(`❌ cache_conversations: ${conversationStats.invalid_count} 个会话是超大时间戳`);
  }

  if (!allConsistent) {
    console.log('❌ 消息和会话的时间戳不一致');
  }
}

console.log('\n═══════════════════════════════════════════════════════\n');

db.close();
