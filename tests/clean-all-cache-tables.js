/**
 * 清理所�?cache_* 表数�? */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 清理所�?cache 缓存表数�?                           �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 检查当前状�?const tables = ['cache_comments', 'cache_messages', 'cache_conversations', 'cache_contents'];

console.log('清理前状�?\n');
const before = {};
tables.forEach(table => {
  const count = db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE account_id = ?`).get(accountId);
  before[table] = count.count;
  console.log(`  - ${table}: ${count.count} 条记录`);
});
console.log('');

// 执行清理
console.log('开始清�?..\n');

try {
  db.exec('BEGIN TRANSACTION');

  tables.forEach(table => {
    const result = db.prepare(`DELETE FROM ${table} WHERE account_id = ?`).run(accountId);
    console.log(`�?${table}: 删除 ${result.changes} 条记录`);
  });

  db.exec('COMMIT');

  console.log('\n══════════════════════════════════════════════════════�?);
  console.log('�?所�?cache 表清理完�?);
  console.log('═══════════════════════════════════════════════════════\n');

  // 验证结果
  console.log('清理后状�?\n');
  tables.forEach(table => {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE account_id = ?`).get(accountId);
    console.log(`  - ${table}: ${count.count} 条记录`);
  });

} catch (error) {
  db.exec('ROLLBACK');
  console.error('�?清理失败:', error);
  db.close();
  process.exit(1);
}

console.log('\n═══════════════════════════════════════════════════════\n');

db.close();
