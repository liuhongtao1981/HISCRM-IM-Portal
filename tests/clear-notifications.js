/**
 * 清空通知�?
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(DB_PATH);

const count = db.prepare('SELECT COUNT(*) as count FROM notifications').get().count;
console.log(`清空�? ${count} 条通知`);

db.prepare('DELETE FROM notifications').run();

const after = db.prepare('SELECT COUNT(*) as count FROM notifications').get().count;
console.log(`清空�? ${after} 条通知`);

db.close();
