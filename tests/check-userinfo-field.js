const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('=== 检查 accounts 表的 user_info 字段 ===\n');

const accounts = db.prepare('SELECT id, account_name, user_info, avatar FROM accounts').all();

console.log(`总账户数: ${accounts.length}\n`);

accounts.forEach((account, index) => {
  console.log(`账户 ${index + 1}:`);
  console.log(`  ID: ${account.id}`);
  console.log(`  账户名称: ${account.account_name}`);
  console.log(`  头像: ${account.avatar ? account.avatar.substring(0, 50) + '...' : 'null'}`);
  console.log(`  user_info: ${account.user_info || 'null'}`);

  if (account.user_info) {
    try {
      const userInfo = JSON.parse(account.user_info);
      console.log(`  解析后的 user_info:`);
      console.log(`    - nickname: ${userInfo.nickname || 'null'}`);
      console.log(`    - douyin_id: ${userInfo.douyin_id || 'null'}`);
      console.log(`    - avatar: ${userInfo.avatar ? userInfo.avatar.substring(0, 50) + '...' : 'null'}`);
    } catch (e) {
      console.log(`  ❌ JSON 解析失败: ${e.message}`);
    }
  }
  console.log('');
});

db.close();
