#!/usr/bin/env node

/**
 * 数据库清理脚本
 * 清理 direct_messages, comments, contents 表中的数据
 * 保留 accounts 表的账户信息
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../data/master.db');

console.log('🔧 开始数据库清理操作...\n');

try {
  // 检查数据库是否存在
  if (!fs.existsSync(dbPath)) {
    console.log('ℹ️  数据库文件不存在，将在启动 master 时创建');
    console.log(`📁 数据库路径: ${dbPath}\n`);
    process.exit(0);
  }

  // 打开数据库
  const db = new Database(dbPath);
  console.log(`✅ 已打开数据库: ${dbPath}\n`);

  // 开始事务
  db.exec('BEGIN TRANSACTION');

  try {
    // 1. 清理 direct_messages 表
    const dmStmt = db.prepare('DELETE FROM direct_messages');
    const dmResult = dmStmt.run();
    console.log(`🗑️  已清理 direct_messages 表: ${dmResult.changes} 条记录\n`);

    // 2. 清理 conversations 表
    const convStmt = db.prepare('DELETE FROM conversations');
    const convResult = convStmt.run();
    console.log(`🗑️  已清理 conversations 表: ${convResult.changes} 条记录\n`);

    // 3. 清理 comments 表
    const commentsStmt = db.prepare('DELETE FROM comments');
    const commentsResult = commentsStmt.run();
    console.log(`🗑️  已清理 comments 表: ${commentsResult.changes} 条记录\n`);

    // 4. 清理 contents 表
    const worksStmt = db.prepare('DELETE FROM contents');
    const worksResult = worksStmt.run();
    console.log(`🗑️  已清理 contents 表: ${worksResult.changes} 条记录\n`);

    // 5. 清理 replies 表
    const repliesStmt = db.prepare('DELETE FROM replies');
    const repliesResult = repliesStmt.run();
    console.log(`🗑️  已清理 replies 表: ${repliesResult.changes} 条记录\n`);

    // 重置自增计数器 (SQLite 中通过 sqlite_sequence 表控制)
    try {
      db.prepare('DELETE FROM sqlite_sequence').run();
      console.log(`🔄 已重置所有表的自增计数器\n`);
    } catch (error) {
      // sqlite_sequence 可能不存在，忽略错误
      console.log(`ℹ️  自增计数器重置跳过 (表可能不存在)\n`);
    }

    // 统计剩余数据
    console.log('📊 清理后的数据统计:\n');

    const tables = [
      'accounts',
      'direct_messages',
      'conversations',
      'comments',
      'contents',
      'replies'
    ];

    for (const table of tables) {
      try {
        const countStmt = db.prepare(`SELECT COUNT(*) as count FROM ${table}`);
        const result = countStmt.get();
        console.log(`   ${table}: ${result.count} 条记录`);
      } catch (error) {
        console.log(`   ${table}: [表不存在或查询失败]`);
      }
    }

    // 提交事务
    db.exec('COMMIT');
    console.log('\n✨ 数据库清理完成! 所有变更已提交。\n');

    // 显示下一步操作
    console.log('📝 下一步:\n');
    console.log('1. 运行测试: npm test');
    console.log('2. 启动 master: npm run start:master\n');

  } catch (error) {
    // 回滚事务
    db.exec('ROLLBACK');
    console.error('❌ 清理过程出错，已回滚所有变更:\n');
    console.error(error.message);
    process.exit(1);
  } finally {
    // 关闭数据库连接
    db.close();
    console.log('🔒 数据库连接已关闭\n');
  }

} catch (error) {
  console.error('❌ 数据库清理失败:\n');
  console.error(error.message);
  process.exit(1);
}
