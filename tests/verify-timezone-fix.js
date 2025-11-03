/**
 * 验证脚本: 检查新抓取的评论数据时间戳是否正确
 *
 * 目的: 验证时区修正是否生效
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n╔═══════════════════════════════════════════════════════╗');
console.log('║  验证时区修正效果                                     ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 查询最新的评论
const comments = db.prepare(`
  SELECT
    id,
    json_extract(data, '$.commentId') as comment_id,
    json_extract(data, '$.content') as content,
    json_extract(data, '$.createdAt') as created_at
  FROM cache_comments
  WHERE account_id = ?
  ORDER BY json_extract(data, '$.createdAt') DESC
  LIMIT 10
`).all(accountId);

console.log(`找到 ${comments.length} 条评论数据\n`);

if (comments.length === 0) {
  console.log('⚠️  数据库中还没有评论数据');
  console.log('   请等待 Worker 爬取评论后再运行此脚本\n');
  db.close();
  process.exit(0);
}

console.log('【最新的评论数据】\n');

comments.forEach((comment, index) => {
  const timestamp = comment.created_at;

  console.log(`${index + 1}. ${comment.content?.substring(0, 40)}...`);
  console.log(`   时间戳: ${timestamp}`);
  console.log(`   UTC时间: ${new Date(timestamp * 1000).toUTCString()}`);
  console.log(`   本地时间 (UTC+8): ${new Date(timestamp * 1000).toLocaleString('zh-CN')}`);

  // 检查时间是否合理
  const now = Math.floor(Date.now() / 1000);
  const ageInHours = (now - timestamp) / 3600;

  if (ageInHours < 0) {
    console.log(`   ❌ 错误: 时间戳在未来！(${Math.abs(ageInHours).toFixed(1)} 小时后)`);
  } else if (ageInHours > 24 * 365) {
    console.log(`   ❌ 错误: 时间戳太老！(${(ageInHours / 24 / 365).toFixed(1)} 年前)`);
  } else if (ageInHours > 24 * 30) {
    console.log(`   ⚠️  警告: 时间戳较老 (${(ageInHours / 24).toFixed(1)} 天前)`);
  } else {
    console.log(`   ✅ 时间合理 (${ageInHours.toFixed(1)} 小时前)`);
  }

  console.log('');
});

console.log('═══════════════════════════════════════════════════════\n');

// 验证私信数据
const messages = db.prepare(`
  SELECT
    id,
    json_extract(data, '$.messageId') as message_id,
    json_extract(data, '$.content') as content,
    json_extract(data, '$.createdAt') as created_at
  FROM cache_messages
  WHERE account_id = ?
  ORDER BY json_extract(data, '$.createdAt') DESC
  LIMIT 5
`).all(accountId);

if (messages.length > 0) {
  console.log(`找到 ${messages.length} 条私信数据\n`);
  console.log('【最新的私信数据】\n');

  messages.forEach((msg, index) => {
    const timestamp = msg.created_at;

    console.log(`${index + 1}. ${msg.content?.substring(0, 30)}...`);
    console.log(`   时间戳: ${timestamp}`);
    console.log(`   本地时间: ${new Date(timestamp * 1000).toLocaleString('zh-CN')}`);

    const now = Math.floor(Date.now() / 1000);
    const ageInHours = (now - timestamp) / 3600;

    if (ageInHours >= 0 && ageInHours < 24 * 30) {
      console.log(`   ✅ 时间合理 (${ageInHours.toFixed(1)} 小时前)`);
    } else {
      console.log(`   ⚠️  时间异常`);
    }
    console.log('');
  });
}

console.log('═══════════════════════════════════════════════════════\n');
console.log('💡 如何验证:');
console.log('   1. 对比抖音创作者中心显示的时间');
console.log('   2. 本地时间应该与抖音显示时间一致');
console.log('   3. 如果一致，说明时区修正成功！\n');

db.close();
