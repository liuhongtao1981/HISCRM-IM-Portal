/**
 * 诊断脚本: 检查抖音API返回的时间戳时区问题
 *
 * 问题: 抖音创作者中心显示 "10月30日 04:28"
 *       但IM客户端显示 "10/30 12:28"
 *       差了8小时
 *
 * 假设: 抖音API返回的create_time时间戳是UTC+8时区的
 *       需要减去8小时才是真正的UTC时间戳
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n╔═══════════════════════════════════════════════════════╗');
console.log('║  抖音API时间戳时区诊断                                ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 查询10月30日的评论
const comments = db.prepare(`
  SELECT
    id,
    json_extract(data, '$.commentId') as comment_id,
    json_extract(data, '$.content') as content,
    json_extract(data, '$.createdAt') as created_at
  FROM cache_comments
  WHERE account_id = ?
    AND json_extract(data, '$.createdAt') >= 1761750000
    AND json_extract(data, '$.createdAt') <= 1761850000
  ORDER BY json_extract(data, '$.createdAt') DESC
`).all(accountId);

console.log(`找到 ${comments.length} 条10月30日左右的评论\n`);

comments.forEach((comment, index) => {
  const timestamp = comment.created_at;

  console.log(`${index + 1}. ${comment.content?.substring(0, 30)}...`);
  console.log(`   原始时间戳: ${timestamp}`);
  console.log('');

  console.log('   【假设1: 时间戳是UTC时间】');
  console.log(`     UTC时间: ${new Date(timestamp * 1000).toUTCString()}`);
  console.log(`     本地时间 (UTC+8): ${new Date(timestamp * 1000).toLocaleString('zh-CN')}`);
  console.log('');

  console.log('   【假设2: 时间戳是UTC+8时间】');
  const correctedTimestamp = timestamp - (8 * 3600); // 减去8小时
  console.log(`     修正后的UTC时间: ${new Date(correctedTimestamp * 1000).toUTCString()}`);
  console.log(`     修正后的本地时间: ${new Date(correctedTimestamp * 1000).toLocaleString('zh-CN')}`);
  console.log('');

  console.log('   【对比抖音创作者中心】');
  console.log(`     抖音显示: 10月30日 04:28`);
  console.log(`     假设1结果: ${new Date(timestamp * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`);
  console.log(`     假设2结果: ${new Date(correctedTimestamp * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`);
  console.log('');

  if (new Date(correctedTimestamp * 1000).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }) === '04:28') {
    console.log('   ✅ 假设2正确！抖音API返回的是UTC+8时间戳');
  } else {
    console.log('   ❌ 需要进一步分析');
  }

  console.log('\n' + '─'.repeat(60) + '\n');
});

console.log('═══════════════════════════════════════════════════════\n');
console.log('【结论】\n');
console.log('如果假设2正确，那么：');
console.log('1. 抖音API返回的create_time时间戳是以UTC+8（中国时区）为基准的');
console.log('2. 我们需要在存储时减去8小时（28800秒）来转换为标准UTC时间戳');
console.log('3. 或者在显示时特殊处理，明确这是UTC+8时区的时间戳\n');

db.close();
