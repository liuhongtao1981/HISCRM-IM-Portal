const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('📊 数据库表数据统计:\n');

const tables = ['contents', 'comments', 'discussions', 'direct_messages', 'conversations', 'accounts'];
tables.forEach(t => {
  const count = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get();
  console.log(`  ${t}: ${count.c} 条`);
});

db.close();
