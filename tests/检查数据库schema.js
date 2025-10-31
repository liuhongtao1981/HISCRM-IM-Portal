const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');

try {
  const db = new Database(DB_PATH, { readonly: true });

  console.log('=== comments 表结构 ===');
  const commentsSchema = db.prepare("PRAGMA table_info(comments)").all();
  commentsSchema.forEach(col => {
    console.log(`${col.name} (${col.type})`);
  });

  console.log('\n=== accounts 表结构 ===');
  const accountsSchema = db.prepare("PRAGMA table_info(accounts)").all();
  accountsSchema.forEach(col => {
    console.log(`${col.name} (${col.type})`);
  });

  db.close();
} catch (error) {
  console.error('错误:', error.message);
}
