const Database = require('better-sqlite3');
const db = new Database('E:/HISCRM-IM-main/packages/master/data/master.db', { readonly: true });

console.log('\n=== 账户状态详细信�?===\n');

const account = db.prepare(`
  SELECT
    id,
    account_id,
    platform,
    login_status,
    worker_status,
    last_error_message,
    error_count,
    updated_at,
    last_login_time,
    last_heartbeat_time,
    datetime(updated_at, 'unixepoch', 'localtime') as updated_time,
    datetime(last_login_time, 'unixepoch', 'localtime') as last_login,
    datetime(last_heartbeat_time, 'unixepoch', 'localtime') as last_heartbeat
  FROM accounts
  WHERE id = ?
`).get('acc-98296c87-2e42-447a-9d8b-8be008ddb6e4');

console.log('账户 ID:', account.id);
console.log('账号�?', account.account_id);
console.log('平台:', account.platform);
console.log('');
console.log('【当前状态�?);
console.log('  登录状�?', account.login_status);
console.log('  Worker状�?', account.worker_status);
console.log('  错误次数:', account.error_count);
console.log('  错误信息:', account.last_error_message || '�?);
console.log('');
console.log('【时间信息�?);
console.log('  最后更新时�?', account.updated_time, `(${account.updated_at})`);
console.log('  最后登录时�?', account.last_login || '从未登录', account.last_login_time ? `(${account.last_login_time})` : '');
console.log('  最后心跳时�?', account.last_heartbeat || '无心�?, account.last_heartbeat_time ? `(${account.last_heartbeat_time})` : '');
console.log('');

// 计算时间�?
const now = Math.floor(Date.now() / 1000);
console.log('【时间差�?);
console.log('  距现�?', (now - account.updated_at), '�?);
if (account.last_login_time) {
  console.log('  距最后登�?', (now - account.last_login_time), '�?);
}

db.close();
