/**
 * 修复登录状态
 *
 * 修复因 Worker 误覆盖导致的 login_status 错误
 *
 * 逻辑：
 * - 如果账户有 platform_user_id（说明登录过）
 * - 但 login_status = 'not_logged_in'（状态错误）
 * - 则修复为 'logged_in'
 *
 * 使用方法：
 * node tests/修复登录状态.js
 */

const path = require('path');
const Database = require('better-sqlite3');

console.log('='.repeat(80));
console.log('修复登录状态');
console.log('='.repeat(80));
console.log('');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('📊 1. 检查需要修复的账户:');
console.log('-'.repeat(80));

// 查找需要修复的账户：有 platform_user_id 但 login_status 为 not_logged_in
const needFix = db.prepare(`
  SELECT
    id,
    platform,
    account_name,
    platform_user_id,
    login_status,
    last_login_time,
    cookies_valid_until
  FROM accounts
  WHERE platform_user_id IS NOT NULL
    AND platform_user_id != ''
    AND login_status = 'not_logged_in'
`).all();

if (needFix.length === 0) {
  console.log('✅ 没有需要修复的账户');
  db.close();
  process.exit(0);
}

console.log(`找到 ${needFix.length} 个需要修复的账户:\n`);

needFix.forEach((acc, index) => {
  console.log(`[${index + 1}] 账户 ID: ${acc.id}`);
  console.log(`    平台: ${acc.platform}`);
  console.log(`    账户名: ${acc.account_name || '(未设置)'}`);
  console.log(`    平台用户ID: ${acc.platform_user_id} ✅`);
  console.log(`    当前登录状态: ${acc.login_status} ❌`);
  console.log(`    最后登录时间: ${acc.last_login_time ? new Date(acc.last_login_time * 1000).toLocaleString('zh-CN') : '(无)'}`);
  console.log(`    Cookies有效期: ${acc.cookies_valid_until ? new Date(acc.cookies_valid_until * 1000).toLocaleString('zh-CN') : '(无)'}`);
  console.log('');
});

console.log('');
console.log('🔧 2. 开始修复:');
console.log('-'.repeat(80));

try {
  const updateStmt = db.prepare(`
    UPDATE accounts
    SET login_status = 'logged_in'
    WHERE id = ?
  `);

  let fixed = 0;
  for (const acc of needFix) {
    try {
      const result = updateStmt.run(acc.id);
      if (result.changes > 0) {
        console.log(`✅ [${fixed + 1}/${needFix.length}] 修复成功: ${acc.account_name} (${acc.id})`);
        fixed++;
      } else {
        console.log(`⚠️  [${fixed + 1}/${needFix.length}] 修复失败: ${acc.account_name} (${acc.id}) - 没有行被更新`);
      }
    } catch (error) {
      console.error(`❌ [${fixed + 1}/${needFix.length}] 修复失败: ${acc.account_name} (${acc.id})`, error.message);
    }
  }

  console.log('');
  console.log('📊 3. 修复结果统计:');
  console.log('-'.repeat(80));
  console.log(`总账户数: ${needFix.length}`);
  console.log(`成功修复: ${fixed}`);
  console.log(`修复失败: ${needFix.length - fixed}`);

  if (fixed > 0) {
    console.log('');
    console.log('✅ 修复完成！');
    console.log('');
    console.log('💡 下一步操作:');
    console.log('   1. 重启 Worker 以加载修复后的配置');
    console.log('   2. 观察 Worker 日志，确认不再报错');
    console.log('   3. 等待爬虫任务执行，验证数据采集');
  } else {
    console.log('');
    console.log('⚠️  没有账户被修复，请检查数据库状态');
  }

} catch (error) {
  console.error('❌ 修复过程中出错:', error);
  process.exit(1);
} finally {
  db.close();
}

console.log('');
console.log('='.repeat(80));
console.log('修复操作完成');
console.log('='.repeat(80));
