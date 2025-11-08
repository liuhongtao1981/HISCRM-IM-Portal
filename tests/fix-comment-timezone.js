/**
 * 修复数据库中评论时间戳的时区问题
 *
 * 问题: 抖音API返回的时间戳是UTC+8，但旧评论数据没有应用时区修�? * 解决: 将所有评论的 createdAt 减去 8 小时 (28800�?
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const backupPath = path.join(__dirname, '../packages/master/data/master.db.backup-timezone-fix-' + Date.now());

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 修复评论时间戳时区问�?                             �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

// 备份数据�?console.log('📦 �?�? 备份数据�?..');
fs.copyFileSync(dbPath, backupPath);
console.log(`�?备份完成: ${backupPath}\n`);

const db = new Database(dbPath);

const TIMEZONE_OFFSET = 8 * 3600; // 8小时 = 28800�?const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('📊 �?�? 检查需要修正的评论数据...\n');

// 查询所有评�?const comments = db.prepare(`
  SELECT
    id,
    json_extract(data, '$.commentId') as comment_id,
    json_extract(data, '$.content') as content,
    json_extract(data, '$.createdAt') as created_at
  FROM cache_comments
  WHERE account_id = ?
`).all(accountId);

console.log(`找到 ${comments.length} 条评论数据\n`);

if (comments.length === 0) {
  console.log('⚠️  没有需要修正的数据\n');
  db.close();
  process.exit(0);
}

// 显示修正前后对比
console.log('【修正前后对�?- �?条】\n');
comments.slice(0, 3).forEach((comment, index) => {
  const originalTimestamp = comment.created_at;
  const correctedTimestamp = originalTimestamp - TIMEZONE_OFFSET;

  const originalDate = new Date(originalTimestamp * 1000);
  const correctedDate = new Date(correctedTimestamp * 1000);

  console.log(`${index + 1}. ${comment.content?.substring(0, 30)}...`);
  console.log(`   原始: ${originalTimestamp} �?${originalDate.toLocaleString('zh-CN')}`);
  console.log(`   修正: ${correctedTimestamp} �?${correctedDate.toLocaleString('zh-CN')}`);
  console.log('');
});

// 询问用户是否继续
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('⚠️  即将修改数据库！是否继续�?输入 yes 继续): ', (answer) => {
  if (answer.toLowerCase() !== 'yes') {
    console.log('\n�?已取消操作\n');
    readline.close();
    db.close();
    process.exit(0);
  }

  console.log('\n📝 �?�? 开始修正时间戳...\n');

  try {
    db.exec('BEGIN TRANSACTION');

    // 修正评论�?createdAt 字段
    console.log('正在修正 cache_comments �?..');
    const updateStmt = db.prepare(`
      UPDATE cache_comments
      SET data = json_set(
        data,
        '$.createdAt',
        CAST(json_extract(data, '$.createdAt') AS INTEGER) - ?
      )
      WHERE account_id = ?
    `);

    const result = updateStmt.run(TIMEZONE_OFFSET, accountId);
    console.log(`�?已更�?${result.changes} 条评论数据\n`);

    db.exec('COMMIT');

    console.log('══════════════════════════════════════════════════════�?);
    console.log('�?数据修正完成！\n');

    // 验证结果
    console.log('📋 �?�? 验证修正结果...\n');

    const verifyComments = db.prepare(`
      SELECT
        json_extract(data, '$.content') as content,
        json_extract(data, '$.createdAt') as created_at
      FROM cache_comments
      WHERE account_id = ?
      ORDER BY json_extract(data, '$.createdAt') DESC
      LIMIT 3
    `).all(accountId);

    console.log('【修正后的评论数据】\n');
    verifyComments.forEach((comment, index) => {
      const timestamp = comment.created_at;
      const date = new Date(timestamp * 1000);
      console.log(`${index + 1}. ${comment.content?.substring(0, 30)}...`);
      console.log(`   时间�? ${timestamp}`);
      console.log(`   UTC时间: ${date.toUTCString()}`);
      console.log(`   本地时间: ${date.toLocaleString('zh-CN')}`);
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════\n');
    console.log('💡 提示:');
    console.log(`   - 数据库备份位�? ${backupPath}`);
    console.log('   - 如有问题，可使用备份恢复数据�?);
    console.log('   - IM 客户端应显示正确时间（如 10/30 04:28）\n');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('\n�?错误: ', error.message);
    console.log('\n数据库已回滚到修改前的状态\n');
  } finally {
    readline.close();
    db.close();
  }
});
