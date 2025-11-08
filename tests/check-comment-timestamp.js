/**
 * 检查评论的 createdAt 时间�? */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 检查评论的 createdAt 时间�?                         �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 查询评论
const comments = db.prepare(`
  SELECT
    id,
    json_extract(data, '$.createdAt') as created_at,
    json_extract(data, '$.content') as content
  FROM cache_comments
  WHERE account_id = ?
  LIMIT 5
`).all(accountId);

console.log(`找到 ${comments.length} 条评论\n`);

if (comments.length > 0) {
  console.log('【评论时间戳检查】\n');

  comments.forEach((comment, index) => {
    const timestamp = comment.created_at;
    const isMilliseconds = timestamp >= 10000000000 && timestamp < 10000000000000;
    const status = isMilliseconds ? '�? : '�?;

    console.log(`${index + 1}. ${status} ${comment.content?.substring(0, 30) || '无内�?}...`);
    console.log(`   createdAt: ${timestamp}`);
    console.log(`   格式: ${isMilliseconds ? '毫秒�?(13�?' : timestamp < 10000000000 ? '秒级 (10�? �? : '未知格式'}`);
    console.log(`   转换为日�? ${new Date(timestamp).toLocaleString('zh-CN')}`);
    console.log('');
  });
}

console.log('═══════════════════════════════════════════════════════\n');

db.close();
