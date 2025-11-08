/**
 * 查询账户登录状�? */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('========================================');
console.log('查询账户登录状�?);
console.log('========================================\n');

const accounts = db.prepare(`
  SELECT
    id,
    account_id,
    platform,
    login_status,
    worker_status,
    assigned_worker_id,
    last_login_time,
    cookies_valid_until
  FROM accounts
  WHERE platform = 'douyin'
`).all();

console.log(`找到 ${accounts.length} 个抖音账�?\n`);

accounts.forEach((account, index) => {
  console.log(`账户 ${index + 1}:`);
  console.log(`  ID: ${account.id}`);
  console.log(`  Account ID: ${account.account_id}`);
  console.log(`  Platform: ${account.platform}`);
  console.log(`  Login Status: ${account.login_status}`);
  console.log(`  Worker Status: ${account.worker_status}`);
  console.log(`  Assigned Worker: ${account.assigned_worker_id || 'None'}`);
  console.log(`  Last Login: ${account.last_login_time || 'Never'}`);
  console.log(`  Cookies Valid Until: ${account.cookies_valid_until || 'N/A'}`);
  console.log('');
});

db.close();

console.log('========================================');
