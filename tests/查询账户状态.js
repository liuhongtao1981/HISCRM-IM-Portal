const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('📊 查询账户状态...\n');

// 查询账户信息
const account = db.prepare(`
  SELECT *
  FROM accounts
  WHERE id = ?
`).get('acc-98296c87-2e42-447a-9d8b-8be008ddb6e4');

if (account) {
  console.log('账户信息:');
  console.log('  ID:', account.id);
  console.log('  平台:', account.platform);
  console.log('  用户名:', account.username);
  console.log('  登录状态:', account.login_status);
  console.log('  Worker状态:', account.worker_status);
  console.log('  Worker ID:', account.worker_id);
  console.log('\n所有字段:');
  console.log(JSON.stringify(account, null, 2));
} else {
  console.log('❌ 账户不存在');
}

// 查询 storage state 文件
const fs = require('fs');
const storageStatePath = path.join(__dirname, `../packages/worker/data/browser/worker1/storage-states/${account.id}_storage.json`);
const exists = fs.existsSync(storageStatePath);
console.log('\n存储状态文件:', exists ? '✅ 存在' : '❌ 不存在');
if (exists) {
  console.log('  路径:', storageStatePath);
}

db.close();
