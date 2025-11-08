/**
 * 检�?cache_conversations 表结�? */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n══════════════════════════════════════════════════════�?);
console.log('  cache_conversations 表结�?);
console.log('═══════════════════════════════════════════════════════\n');

const columns = db.prepare('PRAGMA table_info(cache_conversations)').all();
columns.forEach(col => {
  console.log(`${col.name.padEnd(30)} ${col.type.padEnd(15)} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
});

console.log('\n══════════════════════════════════════════════════════�?);
console.log('  cache_conversations 数据总数');
console.log('═══════════════════════════════════════════════════════\n');

const count = db.prepare('SELECT COUNT(*) as count FROM cache_conversations').get();
console.log(`总计: ${count.count} 条记录\n`);

if (count.count > 0) {
  console.log('══════════════════════════════════════════════════════�?);
  console.log('  �?10 条记�?(按更新时间排�?');
  console.log('═══════════════════════════════════════════════════════\n');

  const rows = db.prepare(`
    SELECT * FROM cache_conversations
    ORDER BY updated_at DESC
    LIMIT 10
  `).all();

  rows.forEach((row, index) => {
    console.log(`${index + 1}. ID: ${row.id}`);
    console.log(`   Account ID: ${row.account_id}`);
    Object.keys(row).forEach(key => {
      if (!['id', 'account_id'].includes(key)) {
        console.log(`   ${key}: ${row[key]}`);
      }
    });
    console.log('');
  });
}

db.close();
