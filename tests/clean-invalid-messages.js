/**
 * 清理无效的消息数据（1970年的消息�? */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 清理无效的消息数�?                                  �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 查询所�?1970 年的消息（created_at < 某个合理的时间戳�?// 2020-01-01 的时间戳�?1577836800000 (毫秒)
const YEAR_2020_MS = 1577836800000;

const invalidMessages = db.prepare(`
  SELECT
    id,
    created_at,
    datetime(created_at / 1000, 'unixepoch', 'localtime') as formatted_time
  FROM cache_messages
  WHERE account_id = ? AND created_at < ?
`).all(accountId, YEAR_2020_MS);

console.log(`发现 ${invalidMessages.length} 条无效消息（时间 < 2020-01-01）\n`);

if (invalidMessages.length === 0) {
  console.log('�?没有需要清理的无效消息');
  db.close();
  process.exit(0);
}

// 显示�?5 �?console.log('无效消息示例（前 5 条）:\n');
invalidMessages.slice(0, 5).forEach((msg, index) => {
  console.log(`${index + 1}. ${msg.formatted_time} (created_at: ${msg.created_at})`);
});
console.log('');

// 执行删除
console.log('开始删�?..\n');

try {
  db.exec('BEGIN TRANSACTION');

  const result = db.prepare(`
    DELETE FROM cache_messages
    WHERE account_id = ? AND created_at < ?
  `).run(accountId, YEAR_2020_MS);

  db.exec('COMMIT');

  console.log('══════════════════════════════════════════════════════�?);
  console.log(`�?成功删除 ${result.changes} 条无效消息`);
  console.log('═══════════════════════════════════════════════════════\n');

  // 验证结果
  const remaining = db.prepare(`
    SELECT COUNT(*) as count FROM cache_messages WHERE account_id = ?
  `).get(accountId);

  console.log(`剩余消息�? ${remaining.count}`);
  console.log('');

} catch (error) {
  db.exec('ROLLBACK');
  console.error('�?删除失败:', error);
  db.close();
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════\n');

db.close();
