/**
 * 修复 cache_conversations 表的时间�? * �?cache_messages 表获取真实的最后消息时�? */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 修复 cache_conversations 时间�?                     �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

// 1. 查找所有会话及其真实的最后消息时�?const conversationsWithMessages = db.prepare(`
  SELECT
    c.id as conv_id,
    c.user_id,
    c.last_message_time as old_time,
    m.latest_message_time,
    m.message_count,
    json_extract(c.data, '$.userName') as user_name
  FROM cache_conversations c
  LEFT JOIN (
    SELECT
      conversation_id,
      MAX(created_at) * 1000 as latest_message_time,
      COUNT(*) as message_count
    FROM cache_messages
    WHERE account_id = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
    GROUP BY conversation_id
  ) m ON c.user_id = m.conversation_id
  WHERE c.account_id = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  ORDER BY m.latest_message_time DESC NULLS LAST
`).all();

console.log(`找到 ${conversationsWithMessages.length} 个会话\n`);

// 2. 更新会话时间�?const updateStmt = db.prepare(`
  UPDATE cache_conversations
  SET last_message_time = ?,
      updated_at = ?
  WHERE id = ?
`);

let updatedCount = 0;
let skippedCount = 0;
const now = Date.now();

console.log('开始更新会话时间戳...\n');

const transaction = db.transaction(() => {
  conversationsWithMessages.forEach((conv, index) => {
    if (conv.latest_message_time) {
      // 有真实消息时间，更新
      updateStmt.run(conv.latest_message_time, now, conv.conv_id);

      const oldDate = new Date(conv.old_time);
      const newDate = new Date(conv.latest_message_time);

      console.log(`${index + 1}. ${conv.user_name || conv.user_id.substring(0, 20)}`);
      console.log(`   旧时�? ${oldDate.toLocaleString('zh-CN')}`);
      console.log(`   新时�? ${newDate.toLocaleString('zh-CN')}`);
      console.log(`   消息�? ${conv.message_count}`);
      console.log('');

      updatedCount++;
    } else {
      // 没有消息记录，跳�?      skippedCount++;
      console.log(`⚠️  ${index + 1}. ${conv.user_name || conv.user_id.substring(0, 20)} - 无消息记录，跳过`);
    }
  });
});

try {
  transaction();
  console.log('\n══════════════════════════════════════════════════════�?);
  console.log('�?会话时间戳修复完�?');
  console.log(`   - 已更�? ${updatedCount} 个`);
  console.log(`   - 已跳�?(无消�?: ${skippedCount} 个`);
  console.log(`   - 总计: ${conversationsWithMessages.length} 个`);
  console.log('═══════════════════════════════════════════════════════\n');
} catch (error) {
  console.error('�?更新失败:', error);
  process.exit(1);
}

// 3. 验证结果
console.log('验证修复结果...\n');

const verifyQuery = db.prepare(`
  SELECT
    json_extract(data, '$.userName') as user_name,
    last_message_time,
    datetime(last_message_time / 1000, 'unixepoch', 'localtime') as formatted_time
  FROM cache_conversations
  WHERE account_id = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  ORDER BY last_message_time DESC
  LIMIT 10
`);

const topConversations = verifyQuery.all();

console.log('最新的 10 个会�?');
topConversations.forEach((conv, index) => {
  console.log(`${index + 1}. ${conv.user_name}`);
  console.log(`   时间: ${conv.formatted_time}`);
  console.log(`   时间�? ${conv.last_message_time}`);
});

console.log('\n═══════════════════════════════════════════════════════\n');

db.close();
