const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n=== 账户登录状态查�?===\n');

const account = db.prepare(`
  SELECT
    id,
    platform,
    account_id,
    login_status,
    worker_status,
    updated_at
  FROM accounts
  WHERE id = ?
`).get('acc-98296c87-2e42-447a-9d8b-8be008ddb6e4');

if (account) {
  console.log('账户信息:');
  console.log('  ID:', account.id);
  console.log('  账号:', account.account_id);
  console.log('  平台:', account.platform);
  console.log('  登录状�?', account.login_status);
  console.log('  Worker状�?', account.worker_status);
  console.log('  更新时间:', account.updated_at);
  console.log('');

  if (account.login_status === 'not_logged_in' && account.worker_status === 'offline') {
    console.log('�?登录状态检测正�? 账户显示为未登录且离�?);
  } else if (account.login_status === 'logged_in' && account.worker_status === 'online') {
    console.log('�?登录状态错�? 账户显示为已登录且在�?实际未登�?');
  } else {
    console.log('⚠️  状态不一�?');
    console.log('   login_status:', account.login_status);
    console.log('   worker_status:', account.worker_status);
  }
} else {
  console.log('�?未找到账�?);
}

db.close();
