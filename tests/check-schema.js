const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(DB_PATH);

console.log('=== contents 表字段 ===');
const worksSchema = db.prepare("PRAGMA table_info(contents)").all();
worksSchema.forEach(col => {
  console.log(`${col.name.padEnd(30)} ${col.type.padEnd(15)} ${col.notnull ? 'NOT NULL' : ''}`);
});

console.log('\n=== comments 表字段 ===');
const commentsSchema = db.prepare("PRAGMA table_info(comments)").all();
commentsSchema.forEach(col => {
  console.log(`${col.name.padEnd(30)} ${col.type.padEnd(15)} ${col.notnull ? 'NOT NULL' : ''}`);
});

console.log('\n=== conversations 表字段 ===');
const conversationsSchema = db.prepare("PRAGMA table_info(conversations)").all();
conversationsSchema.forEach(col => {
  console.log(`${col.name.padEnd(30)} ${col.type.padEnd(15)} ${col.notnull ? 'NOT NULL' : ''}`);
});

db.close();
