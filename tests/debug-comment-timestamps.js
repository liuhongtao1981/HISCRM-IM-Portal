/**
 * 调试脚本: 检查所有评论的createdAt时间�? */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n══════════════════════════════════════════════════════�?);
console.log('检查所有评论的时间�?);
console.log('═══════════════════════════════════════════════════════\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 查询所有评�?const comments = db.prepare(`
  SELECT
    id,
    json_extract(data, '$.commentId') as comment_id,
    json_extract(data, '$.contentId') as content_id,
    json_extract(data, '$.content') as content,
    json_extract(data, '$.createdAt') as created_at,
    json_extract(data, '$.authorName') as author_name
  FROM cache_comments
  WHERE account_id = ?
  ORDER BY json_extract(data, '$.createdAt') DESC
`).all(accountId);

console.log(`找到 ${comments.length} 条评论\n`);

comments.forEach((comment, index) => {
  const timestamp = comment.created_at;
  const isSeconds = timestamp < 10000000000;
  const normalizedTime = isSeconds ? timestamp * 1000 : timestamp;

  console.log(`${index + 1}. ${comment.content?.substring(0, 40)}...`);
  console.log(`   contentId: ${comment.content_id}`);
  console.log(`   createdAt: ${timestamp} (${isSeconds ? '秒级' : '毫秒�?})`);
  console.log(`   归一化后: ${normalizedTime}`);
  console.log(`   转换为日�? ${new Date(normalizedTime).toLocaleString('zh-CN')}`);
  console.log('');
});

console.log('═══════════════════════════════════════════════════════\n');

db.close();
