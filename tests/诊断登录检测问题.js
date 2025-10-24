/**
 * 诊断登录检测问题
 *
 * 目的：
 * - 检查 Worker 为何检测账户为未登录状态
 * - 即使数据库有 platform_user_id，且 storage 文件有 cookies
 *
 * 使用方法：
 * node tests/诊断登录检测问题.js
 */

const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

console.log('='.repeat(80));
console.log('诊断登录检测问题');
console.log('='.repeat(80));
console.log('');

// 1. 检查数据库中的账户信息
console.log('📊 1. 数据库中的账户信息:');
console.log('-'.repeat(80));

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

const accounts = db.prepare(`
  SELECT
    id,
    platform,
    account_name,
    platform_user_id,
    login_status,
    worker_status,
    last_login_time,
    cookies_valid_until,
    last_error_message,
    updated_at
  FROM accounts
  ORDER BY updated_at DESC
  LIMIT 5
`).all();

if (accounts.length === 0) {
  console.log('❌ 没有找到任何账户');
} else {
  accounts.forEach((acc, index) => {
    console.log(`\n[${index + 1}] 账户 ID: ${acc.id}`);
    console.log(`    平台: ${acc.platform}`);
    console.log(`    账户名: ${acc.account_name || '(未设置)'}`);
    console.log(`    平台用户ID: ${acc.platform_user_id || '❌ 缺失'}`);
    console.log(`    登录状态: ${acc.login_status}`);
    console.log(`    Worker状态: ${acc.worker_status || '(无)'}`);
    console.log(`    最后登录: ${acc.last_login_time ? new Date(acc.last_login_time * 1000).toLocaleString('zh-CN') : '(无)'}`);
    console.log(`    Cookies有效期: ${acc.cookies_valid_until ? new Date(acc.cookies_valid_until * 1000).toLocaleString('zh-CN') : '(无)'}`);
    console.log(`    错误信息: ${acc.last_error_message || '(无)'}`);
  });
}

console.log('\n');

// 2. 检查 storage 文件
console.log('🗂️  2. Storage 文件检查:');
console.log('-'.repeat(80));

const targetAccountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';
const storagePath = path.join(__dirname, `../packages/worker/data/browser/worker1/storage-states/${targetAccountId}_storage.json`);

console.log(`目标账户: ${targetAccountId}`);
console.log(`Storage 文件路径: ${storagePath}`);

if (fs.existsSync(storagePath)) {
  console.log('✅ Storage 文件存在');

  try {
    const storageData = JSON.parse(fs.readFileSync(storagePath, 'utf8'));

    if (storageData.cookies && Array.isArray(storageData.cookies)) {
      const totalCookies = storageData.cookies.length;
      console.log(`📊 总 Cookies 数量: ${totalCookies}`);

      // 统计各域名的 cookies
      const domainCounts = {};
      const now = Date.now() / 1000; // 当前时间戳（秒）
      let expiredCount = 0;

      storageData.cookies.forEach(cookie => {
        const domain = cookie.domain || '(unknown)';
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;

        // 检查过期
        if (cookie.expires && cookie.expires < now) {
          expiredCount++;
        }
      });

      console.log('\n📊 按域名统计:');
      Object.entries(domainCounts).forEach(([domain, count]) => {
        console.log(`    ${domain}: ${count} 个`);
      });

      console.log(`\n⏰ 已过期的 Cookies: ${expiredCount} 个`);
      console.log(`⏰ 仍有效的 Cookies: ${totalCookies - expiredCount} 个`);

      // 检查关键 cookies
      const keyCookies = ['sessionid', 'sid_guard', 'uid_tt', 'sid_tt', 'passport_csrf_token'];
      console.log('\n🔑 关键 Cookies 检查:');
      keyCookies.forEach(cookieName => {
        const found = storageData.cookies.find(c => c.name === cookieName);
        if (found) {
          const expired = found.expires && found.expires < now;
          console.log(`    ${cookieName}: ✅ 存在${expired ? ' (已过期)' : ' (有效)'}`);
        } else {
          console.log(`    ${cookieName}: ❌ 不存在`);
        }
      });

    } else {
      console.log('❌ Storage 文件中没有 cookies 数据');
    }

  } catch (error) {
    console.error('❌ 读取 Storage 文件失败:', error.message);
  }

} else {
  console.log('❌ Storage 文件不存在');
}

console.log('\n');

// 3. 检查 userDataDir
console.log('📁 3. UserDataDir 检查:');
console.log('-'.repeat(80));

const userDataDir = path.join(__dirname, `../packages/worker/data/browser/worker1/browser_${targetAccountId}`);
console.log(`UserDataDir 路径: ${userDataDir}`);

if (fs.existsSync(userDataDir)) {
  console.log('✅ UserDataDir 存在');

  // 检查 Cookies 文件
  const cookiesFile = path.join(userDataDir, 'Default/Cookies');
  if (fs.existsSync(cookiesFile)) {
    const stats = fs.statSync(cookiesFile);
    console.log(`✅ Cookies 文件存在 (大小: ${(stats.size / 1024).toFixed(2)} KB)`);
    console.log(`   最后修改: ${new Date(stats.mtime).toLocaleString('zh-CN')}`);
  } else {
    console.log('❌ Cookies 文件不存在');
  }

  // 检查 Local Storage
  const localStorageDir = path.join(userDataDir, 'Default/Local Storage');
  if (fs.existsSync(localStorageDir)) {
    console.log(`✅ Local Storage 目录存在`);
  } else {
    console.log('❌ Local Storage 目录不存在');
  }

} else {
  console.log('❌ UserDataDir 不存在');
}

console.log('\n');

// 4. 问题诊断总结
console.log('🔍 4. 问题诊断总结:');
console.log('-'.repeat(80));

const issues = [];
const targetAccount = accounts.find(acc => acc.id === targetAccountId);

if (targetAccount) {
  // 检查 platform_user_id
  if (!targetAccount.platform_user_id) {
    issues.push({
      level: 'ERROR',
      message: '数据库中缺少 platform_user_id',
      solution: '需要重新登录以获取 platform_user_id'
    });
  } else {
    console.log(`✅ 数据库有 platform_user_id: ${targetAccount.platform_user_id}`);
  }

  // 检查登录状态
  if (targetAccount.login_status !== 'logged_in') {
    issues.push({
      level: 'WARNING',
      message: `数据库登录状态为: ${targetAccount.login_status}`,
      solution: '需要更新登录状态'
    });
  } else {
    console.log(`✅ 数据库登录状态: ${targetAccount.login_status}`);
  }

  // 检查 Worker 状态
  if (targetAccount.worker_status === 'error') {
    issues.push({
      level: 'ERROR',
      message: `Worker 状态为 error: ${targetAccount.last_error_message}`,
      solution: '检查 Worker 日志，解决错误'
    });
  }

} else {
  console.log(`❌ 未找到目标账户: ${targetAccountId}`);
}

// 检查 Storage 文件
if (!fs.existsSync(storagePath)) {
  issues.push({
    level: 'ERROR',
    message: 'Storage 文件不存在',
    solution: '需要重新登录以生成 storage 文件'
  });
} else {
  console.log(`✅ Storage 文件存在`);
}

// 检查 UserDataDir
if (!fs.existsSync(userDataDir)) {
  issues.push({
    level: 'ERROR',
    message: 'UserDataDir 不存在',
    solution: '需要重新启动浏览器以创建 UserDataDir'
  });
} else {
  console.log(`✅ UserDataDir 存在`);
}

console.log('\n');

if (issues.length === 0) {
  console.log('✅ 没有发现明显问题');
  console.log('\n⚠️  但 Worker 仍检测为未登录，可能的原因：');
  console.log('   1. Cookies 已过期，需要重新登录');
  console.log('   2. 平台更新了登录验证机制');
  console.log('   3. Worker 的登录检测逻辑需要调整');
  console.log('   4. 浏览器 Session 没有正确恢复');
  console.log('\n💡 建议操作：');
  console.log('   1. 手动触发一次登录，观察 Worker 日志');
  console.log('   2. 检查 checkLoginStatus() 函数的检测逻辑');
  console.log('   3. 在 Worker 中添加更详细的登录检测日志');
} else {
  issues.forEach((issue, index) => {
    const emoji = issue.level === 'ERROR' ? '❌' : issue.level === 'WARNING' ? '⚠️' : 'ℹ️';
    console.log(`${emoji} [${issue.level}] ${index + 1}. ${issue.message}`);
    console.log(`   💡 解决方案: ${issue.solution}`);
  });
}

console.log('\n');
console.log('='.repeat(80));
console.log('诊断完成');
console.log('='.repeat(80));

db.close();
