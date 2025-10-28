/**
 * 设置账户为已登录状态
 * 用于测试目的，跳过登录检查
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');
const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

async function setAccountLoggedIn() {
  console.log('🔧 设置账户为已登录状态...\n');

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  try {
    // 1. 检查当前状态
    const account = db.prepare('SELECT id, username, status, platform FROM accounts WHERE id = ?').get(accountId);

    if (!account) {
      console.error(`❌ 账户不存在: ${accountId}`);
      process.exit(1);
    }

    console.log('📊 当前账户状态:');
    console.table({
      'ID': account.id,
      '用户名': account.username || 'N/A',
      '平台': account.platform,
      '状态': account.status
    });

    // 2. 更新状态
    console.log('\n🔄 更新账户状态为 online...');

    db.prepare(`
      UPDATE accounts
      SET status = 'online',
          is_active = 1
      WHERE id = ?
    `).run(accountId);

    // 3. 验证更新
    const updatedAccount = db.prepare('SELECT id, username, status, is_active FROM accounts WHERE id = ?').get(accountId);

    console.log('\n✅ 更新后账户状态:');
    console.table({
      'ID': updatedAccount.id,
      '用户名': updatedAccount.username || 'N/A',
      '状态': updatedAccount.status,
      '激活': updatedAccount.is_active ? '是' : '否'
    });

    console.log('\n✅ 账户状态已更新!');
    console.log('📌 注意: 这只是为了测试目的，实际使用中账户需要真实登录');

  } catch (error) {
    console.error('❌ 更新失败:', error);
    throw error;
  } finally {
    db.close();
  }
}

setAccountLoggedIn().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
