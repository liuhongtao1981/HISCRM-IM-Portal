/**
 * 修复会话表中被错误更新的超大时间�? *
 * 问题：update-conversation-times-from-messages.js 脚本错误地将毫秒级时间戳再次乘以 1000
 * 导致时间戳变�?16 位数字，代表 57809 �? */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 修复会话表中的超大时间戳                             �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 1. 检查当前状�?console.log('�?】检查会话表�?last_message_time:\n');

const conversations = db.prepare(`
  SELECT
    id,
    user_id,
    last_message_time,
    CASE
      WHEN last_message_time > 10000000000000 THEN '超大 (>13�?'
      WHEN last_message_time < 10000000000000 THEN '毫秒�?(13�?'
      WHEN last_message_time < 10000000000 THEN '秒级 (10�?'
      ELSE '未知'
    END as format_type,
    json_extract(data, '$.userName') as user_name
  FROM cache_conversations
  WHERE account_id = ?
  ORDER BY last_message_time DESC
`).all(accountId);

const invalidCount = conversations.filter(c => c.last_message_time > 10000000000000).length;
const validCount = conversations.filter(c => c.last_message_time <= 10000000000000).length;

console.log(`总会话数: ${conversations.length}`);
console.log(`超大时间�?(错误): ${invalidCount} 个`);
console.log(`正常时间�? ${validCount} 个\n`);

if (invalidCount > 0) {
  console.log('超大时间戳的会话示例（前 5 个）:\n');

  const invalidConversations = conversations.filter(c => c.last_message_time > 10000000000000).slice(0, 5);

  invalidConversations.forEach((conv, index) => {
    console.log(`${index + 1}. ${conv.user_name}`);
    console.log(`   超大时间�? ${conv.last_message_time}`);
    console.log(`   应该除以 1000: ${conv.last_message_time / 1000}`);
    console.log('');
  });
}

// 2. 修复超大时间�?if (invalidCount > 0) {
  console.log('�?】开始修�?..\n');

  try {
    db.exec('BEGIN TRANSACTION');

    // 将超大时间戳除以 1000
    const updateResult = db.prepare(`
      UPDATE cache_conversations
      SET last_message_time = last_message_time / 1000
      WHERE account_id = ? AND last_message_time > 10000000000000
    `).run(accountId);

    db.exec('COMMIT');

    console.log('══════════════════════════════════════════════════════�?);
    console.log(`�?成功修复 ${updateResult.changes} 个会话的时间戳`);
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('�?修复失败:', error);
    db.close();
    process.exit(1);
  }
} else {
  console.log('�?没有需要修复的超大时间戳\n');
}

// 3. 验证结果
console.log('�?】验证修复结�?\n');

const verifyConversations = db.prepare(`
  SELECT
    json_extract(data, '$.userName') as user_name,
    last_message_time,
    datetime(last_message_time / 1000, 'unixepoch', 'localtime') as formatted_time
  FROM cache_conversations
  WHERE account_id = ?
  ORDER BY last_message_time DESC
  LIMIT 10
`).all(accountId);

console.log('最新的 10 个会�?\n');

verifyConversations.forEach((conv, index) => {
  console.log(`${index + 1}. ${conv.user_name}`);
  console.log(`   时间: ${conv.formatted_time}`);
  console.log(`   时间�? ${conv.last_message_time} (毫秒�?`);
  console.log('');
});

const finalStats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN last_message_time > 10000000000000 THEN 1 ELSE 0 END) as invalid_count,
    SUM(CASE WHEN last_message_time <= 10000000000000 THEN 1 ELSE 0 END) as valid_count
  FROM cache_conversations
  WHERE account_id = ?
`).get(accountId);

console.log('══════════════════════════════════════════════════════�?);
console.log('修复后统�?');
console.log(`  总会话数: ${finalStats.total}`);
console.log(`  超大时间�? ${finalStats.invalid_count} 个`);
console.log(`  正常时间�? ${finalStats.valid_count} 个`);
console.log('═══════════════════════════════════════════════════════\n');

if (finalStats.invalid_count === 0) {
  console.log('�?所有会话时间戳已正�?);
} else {
  console.log(`⚠️  仍有 ${finalStats.invalid_count} 个会话的时间戳异常`);
}

console.log('\n═══════════════════════════════════════════════════════\n');

db.close();
