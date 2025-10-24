const Database = require('better-sqlite3');
const db = new Database('E:/HISCRM-IM-main/packages/master/data/master.db', { readonly: true });

console.log('\n=== 账户状态详细信息 ===\n');

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
console.log('账号名:', account.account_id);
console.log('平台:', account.platform);
console.log('');
console.log('【当前状态】');
console.log('  登录状态:', account.login_status);
console.log('  Worker状态:', account.worker_status);
console.log('  错误次数:', account.error_count);
console.log('  错误信息:', account.last_error_message || '无');
console.log('');
console.log('【时间信息】');
console.log('  最后更新时间:', account.updated_time, `(${account.updated_at})`);
console.log('  最后登录时间:', account.last_login || '从未登录', account.last_login_time ? `(${account.last_login_time})` : '');
console.log('  最后心跳时间:', account.last_heartbeat || '无心跳', account.last_heartbeat_time ? `(${account.last_heartbeat_time})` : '');
console.log('');

// 计算时间差
const now = Math.floor(Date.now() / 1000);
console.log('【时间差】');
console.log('  距现在:', (now - account.updated_at), '秒');
if (account.last_login_time) {
  console.log('  距最后登录:', (now - account.last_login_time), '秒');
}

db.close();
