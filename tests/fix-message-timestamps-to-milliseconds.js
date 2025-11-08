/**
 * 修复 cache_messages 表中的秒级时间戳 �?毫秒级时间戳
 *
 * 问题：CacheDAO 在入库时将毫秒级转换为秒�? * 修复：将所有秒级时间戳 (10�? 乘以 1000 转换为毫秒级 (13�?
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 修复 cache_messages 时间戳格�?                      �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 1. 检查当前状�?console.log('�?】检查当前数据状�?\n');

const messages = db.prepare(`
  SELECT
    id,
    created_at,
    CASE
      WHEN created_at < 10000000000 THEN '秒级'
      WHEN created_at < 10000000000000 THEN '毫秒�?
      ELSE '未知'
    END as format_type
  FROM cache_messages
  WHERE account_id = ?
`).all(accountId);

const secondsCount = messages.filter(m => m.created_at < 10000000000).length;
const millisecondsCount = messages.filter(m => m.created_at >= 10000000000 && m.created_at < 10000000000000).length;

console.log(`总消息数: ${messages.length}`);
console.log(`秒级时间�? ${secondsCount} 条`);
console.log(`毫秒级时间戳: ${millisecondsCount} 条\n`);

if (secondsCount === 0) {
  console.log('�?所有消息时间戳已经是毫秒级，无需修复');
  db.close();
  process.exit(0);
}

// 2. 显示将要修复的记录示�?console.log('�?】将要修复的记录示例（前 5 条）:\n');

const samplesToFix = messages.filter(m => m.created_at < 10000000000).slice(0, 5);

samplesToFix.forEach((msg, index) => {
  const oldTimestamp = msg.created_at;
  const newTimestamp = oldTimestamp * 1000;
  const oldDate = new Date(oldTimestamp * 1000);
  const newDate = new Date(newTimestamp);

  console.log(`${index + 1}. ${msg.id.substring(0, 40)}...`);
  console.log(`   旧�? ${oldTimestamp} (秒级) �?${oldDate.toLocaleString('zh-CN')}`);
  console.log(`   新�? ${newTimestamp} (毫秒�? �?${newDate.toLocaleString('zh-CN')}`);
  console.log('');
});

// 3. 执行修复
console.log('�?】开始修�?..\n');

try {
  db.exec('BEGIN TRANSACTION');

  // 修复秒级时间戳：乘以 1000 转换为毫秒级
  const updateResult = db.prepare(`
    UPDATE cache_messages
    SET created_at = created_at * 1000
    WHERE account_id = ? AND created_at < 10000000000
  `).run(accountId);

  db.exec('COMMIT');

  console.log('══════════════════════════════════════════════════════�?);
  console.log(`�?成功修复 ${updateResult.changes} 条消息的时间戳`);
  console.log('═══════════════════════════════════════════════════════\n');

} catch (error) {
  db.exec('ROLLBACK');
  console.error('�?修复失败:', error);
  db.close();
  process.exit(1);
}

// 4. 验证结果
console.log('�?】验证修复结�?\n');

const verifyMessages = db.prepare(`
  SELECT
    created_at,
    CASE
      WHEN created_at < 10000000000 THEN '秒级'
      WHEN created_at < 10000000000000 THEN '毫秒�?
      ELSE '未知'
    END as format_type,
    datetime(created_at / 1000, 'unixepoch', 'localtime') as formatted_time
  FROM cache_messages
  WHERE account_id = ?
  ORDER BY created_at DESC
  LIMIT 5
`).all(accountId);

console.log('最新的 5 条消�?\n');

verifyMessages.forEach((msg, index) => {
  console.log(`${index + 1}. ${msg.formatted_time}`);
  console.log(`   时间�? ${msg.created_at} (${msg.format_type})`);
  console.log('');
});

const finalStats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN created_at < 10000000000 THEN 1 ELSE 0 END) as seconds_count,
    SUM(CASE WHEN created_at >= 10000000000 AND created_at < 10000000000000 THEN 1 ELSE 0 END) as milliseconds_count
  FROM cache_messages
  WHERE account_id = ?
`).get(accountId);

console.log('══════════════════════════════════════════════════════�?);
console.log('修复后统�?');
console.log(`  总消息数: ${finalStats.total}`);
console.log(`  秒级时间�? ${finalStats.seconds_count} 条`);
console.log(`  毫秒级时间戳: ${finalStats.milliseconds_count} 条`);
console.log('═══════════════════════════════════════════════════════\n');

if (finalStats.seconds_count === 0) {
  console.log('�?所有消息时间戳已成功转换为毫秒�?);
} else {
  console.log(`⚠️  仍有 ${finalStats.seconds_count} 条消息的时间戳是秒级`);
}

console.log('\n═══════════════════════════════════════════════════════\n');

db.close();
