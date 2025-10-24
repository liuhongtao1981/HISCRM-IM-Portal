/**
 * 修复账户状态和Worker分配
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('🔧 修复账户状态和Worker分配\n');

// 1. 查看当前状态
const account = db.prepare('SELECT * FROM accounts WHERE platform = ?').get('douyin');
console.log('当前账户状态:');
console.log('  ID:', account.id);
console.log('  登录状态:', account.login_status);
console.log('  Worker状态:', account.worker_status);
console.log('  Worker ID:', account.worker_id);
console.log('  平台用户ID:', account.platform_user_id);
console.log('');

// 2. 更新账户状态
console.log('📝 更新账户状态...');
db.prepare(`
  UPDATE accounts
  SET login_status = 'logged_in',
      worker_status = 'online',
      worker_id = 'worker1'
  WHERE id = ?
`).run(account.id);

console.log('✅ 账户状态已更新\n');

// 3. 验证更新
const updated = db.prepare('SELECT * FROM accounts WHERE platform = ?').get('douyin');
console.log('更新后账户状态:');
console.log('  ID:', updated.id);
console.log('  登录状态:', updated.login_status);
console.log('  Worker状态:', updated.worker_status);
console.log('  Worker ID:', updated.worker_id);
console.log('  平台用户ID:', updated.platform_user_id);

db.close();
console.log('\n✅ 完成!');
