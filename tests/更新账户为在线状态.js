/**
 * 更新账户为在线状�? */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('========================================');
console.log('更新账户为在线状�?);
console.log('========================================\n');

// 1. 查询当前状�?const account = db.prepare(`
  SELECT id, account_id, worker_status FROM accounts WHERE platform = 'douyin'
`).get();

console.log('当前状�?');
console.log(`  Account ID: ${account.id}`);
console.log(`  Worker Status: ${account.worker_status}\n`);

// 2. 更新�?online
const result = db.prepare(`
  UPDATE accounts
  SET worker_status = 'online'
  WHERE id = ?
`).run(account.id);

console.log('更新结果:');
console.log(`  变更行数: ${result.changes}`);

// 3. 验证
const updated = db.prepare(`
  SELECT worker_status FROM accounts WHERE id = ?
`).get(account.id);

console.log(`  新状�? ${updated.worker_status}\n`);

db.close();

console.log('�?账户状态已更新�?online');
console.log('现在 Worker 应该会开始执行爬虫任�?);
console.log('========================================');
