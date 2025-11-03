/**
 * 测试缓存数据库表结构
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'packages', 'master', 'data', 'master.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n🧪 Testing Cache Schema');
console.log('='.repeat(80));
console.log(`Database: ${dbPath}\n`);

try {
  // 获取所有缓存表
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name LIKE 'cache_%'
    ORDER BY name
  `).all();

  console.log(`📋 Found ${tables.length} cache tables:\n`);

  for (const table of tables) {
    console.log(`\n✅ ${table.name}`);

    // 获取表信息
    const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
    console.log(`   Columns (${columns.length}):`);
    columns.forEach(col => {
      console.log(`     - ${col.name.padEnd(20)} ${col.type.padEnd(10)} ${col.notnull ? 'NOT NULL' : ''}`);
    });

    // 获取索引
    const indexes = db.prepare(`PRAGMA index_list(${table.name})`).all();
    const realIndexes = indexes.filter(idx => !idx.name.startsWith('sqlite_autoindex_'));
    if (realIndexes.length > 0) {
      console.log(`   Indexes (${realIndexes.length}):`);
      realIndexes.forEach(idx => {
        console.log(`     - ${idx.name} ${idx.unique ? '(UNIQUE)' : ''}`);
      });
    }

    // 获取行数
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
    console.log(`   Rows: ${count.count}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Cache schema test passed!\n');

} catch (error) {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
} finally {
  db.close();
}
