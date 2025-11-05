/**
 * 检查数据库表和数据
 */

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
console.log('数据库路径:', dbPath);

const db = new Database(dbPath);

console.log('\n所有表:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log('  -', t.name));

console.log('\n检查 cache_ 表的记录数:');
const cacheTables = tables.filter(t => t.name.startsWith('cache_'));
cacheTables.forEach(t => {
  const count = db.prepare(`SELECT COUNT(*) as count FROM ${t.name}`).get();
  console.log(`  ${t.name}: ${count.count} 条`);
});

db.close();
