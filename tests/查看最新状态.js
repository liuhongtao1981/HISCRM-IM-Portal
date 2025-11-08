const Database = require('better-sqlite3');
const db = new Database('E:/HISCRM-IM-main/packages/master/data/master.db', { readonly: true });

const row = db.prepare(`
  SELECT
    login_status,
    worker_status,
    updated_at,
    datetime(updated_at, 'unixepoch', 'localtime') as update_time
  FROM accounts
  WHERE id = ?
`).get('acc-98296c87-2e42-447a-9d8b-8be008ddb6e4');

console.log('\n=== 账户最新状�?===\n');
console.log('登录状�?', row.login_status);
console.log('Worker状�?', row.worker_status);
console.log('更新时间�?', row.updated_at);
console.log('更新时间:', row.update_time);
console.log('');

// 计算与当前时间的差距
const now = Math.floor(Date.now() / 1000);
const diff = now - row.updated_at;
console.log(`距离现在: ${diff} 秒`);

db.close();
