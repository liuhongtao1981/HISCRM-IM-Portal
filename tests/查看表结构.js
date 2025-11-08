const Database = require('better-sqlite3');
const db = new Database('./packages/master/data/master.db');

console.log('worker_runtime 表结�?');
const columns = db.prepare("PRAGMA table_info(worker_runtime)").all();
console.table(columns);

db.close();
