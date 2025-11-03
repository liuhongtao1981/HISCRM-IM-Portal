/**
 * 数据迁移脚本: 修正数据库中已存在的时间戳时区问题
 *
 * 问题: 抖音API返回的时间戳是UTC+8时区的，数据库中存储的时间戳需要减去8小时
 * 影响: cache_comments 表和 cache_messages 表中的所有 createdAt 字段
 *
 * 警告: 此脚本会修改数据库！运行前请备份！
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const backupPath = path.join(__dirname, '../packages/master/data/master.db.backup-' + Date.now());

// 备份数据库
console.log('\n╔═══════════════════════════════════════════════════════╗');
console.log('║  抖音时间戳时区修正工具                               ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');

console.log('📦 第1步: 备份数据库...');
fs.copyFileSync(dbPath, backupPath);
console.log(`✅ 备份完成: ${backupPath}\n`);

const db = new Database(dbPath);

// 时区偏移量
const TIMEZONE_OFFSET = 8 * 3600; // 8小时 = 28800秒

console.log('📊 第2步: 检查需要修正的数据...\n');

// 检查 cache_comments 表
const comments = db.prepare(`
  SELECT
    id,
    account_id,
    json_extract(data, '$.commentId') as comment_id,
    json_extract(data, '$.content') as content,
    json_extract(data, '$.createdAt') as created_at
  FROM cache_comments
  WHERE account_id = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
`).all();

console.log(`找到 ${comments.length} 条评论数据`);

if (comments.length > 0) {
  console.log('\n【示例数据 - 修正前后对比】\n');

  const sample = comments[0];
  const originalTimestamp = sample.created_at;
  const correctedTimestamp = originalTimestamp - TIMEZONE_OFFSET;

  console.log(`评论内容: ${sample.content?.substring(0, 30)}...`);
  console.log(`\n原始时间戳: ${originalTimestamp}`);
  console.log(`  → UTC时间: ${new Date(originalTimestamp * 1000).toUTCString()}`);
  console.log(`  → 本地时间: ${new Date(originalTimestamp * 1000).toLocaleString('zh-CN')}`);
  console.log(`\n修正后时间戳: ${correctedTimestamp}`);
  console.log(`  → UTC时间: ${new Date(correctedTimestamp * 1000).toUTCString()}`);
  console.log(`  → 本地时间: ${new Date(correctedTimestamp * 1000).toLocaleString('zh-CN')}`);
  console.log('');
}

// 检查 cache_messages 表
const messages = db.prepare(`
  SELECT
    id,
    account_id,
    json_extract(data, '$.messageId') as message_id,
    json_extract(data, '$.content') as content,
    json_extract(data, '$.createdAt') as created_at
  FROM cache_messages
  WHERE account_id = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  LIMIT 5
`).all();

console.log(`找到私信数据: ${messages.length} 条（示例）\n`);

// 询问用户是否继续
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('⚠️  即将修改数据库！是否继续？(输入 yes 继续): ', (answer) => {
  if (answer.toLowerCase() !== 'yes') {
    console.log('\n❌ 已取消操作\n');
    readline.close();
    db.close();
    process.exit(0);
  }

  console.log('\n📝 第3步: 开始修正时间戳...\n');

  try {
    db.exec('BEGIN TRANSACTION');

    // 修正 cache_comments 表
    console.log('正在修正 cache_comments 表...');
    const updateCommentsStmt = db.prepare(`
      UPDATE cache_comments
      SET data = json_set(
        data,
        '$.createdAt',
        CAST(json_extract(data, '$.createdAt') AS INTEGER) - ?
      )
      WHERE account_id = ?
    `);

    const commentsResult = updateCommentsStmt.run(TIMEZONE_OFFSET, 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4');
    console.log(`✅ 已更新 ${commentsResult.changes} 条评论数据\n`);

    // 修正 cache_messages 表
    console.log('正在修正 cache_messages 表...');
    const updateMessagesStmt = db.prepare(`
      UPDATE cache_messages
      SET data = json_set(
        data,
        '$.createdAt',
        CAST(json_extract(data, '$.createdAt') AS INTEGER) - ?
      )
      WHERE account_id = ?
    `);

    const messagesResult = updateMessagesStmt.run(TIMEZONE_OFFSET, 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4');
    console.log(`✅ 已更新 ${messagesResult.changes} 条私信数据\n`);

    db.exec('COMMIT');

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ 数据迁移完成！\n');

    // 验证结果
    console.log('📋 第4步: 验证修正结果...\n');

    const verifyComments = db.prepare(`
      SELECT
        json_extract(data, '$.content') as content,
        json_extract(data, '$.createdAt') as created_at
      FROM cache_comments
      WHERE account_id = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
      ORDER BY json_extract(data, '$.createdAt') DESC
      LIMIT 3
    `).all();

    console.log('【修正后的评论数据】\n');
    verifyComments.forEach((comment, index) => {
      const timestamp = comment.created_at;
      console.log(`${index + 1}. ${comment.content?.substring(0, 30)}...`);
      console.log(`   时间戳: ${timestamp}`);
      console.log(`   UTC时间: ${new Date(timestamp * 1000).toUTCString()}`);
      console.log(`   本地时间: ${new Date(timestamp * 1000).toLocaleString('zh-CN')}`);
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════\n');
    console.log('💡 提示:');
    console.log(`   - 数据库备份位置: ${backupPath}`);
    console.log('   - 如有问题，可使用备份恢复数据库');
    console.log('   - 重启 Master 服务器后，IM 客户端应显示正确时间\n');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('\n❌ 错误: ', error.message);
    console.log('\n数据库已回滚到修改前的状态\n');
  } finally {
    readline.close();
    db.close();
  }
});
