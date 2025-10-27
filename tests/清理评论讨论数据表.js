/**
 * 清理评论和讨论相关数据表
 * 为重新测试抓取做准备
 */

const path = require('path');
const Database = require('better-sqlite3');

function cleanCommentTables() {
  console.log('📋 清理评论和讨论相关数据表\n');

  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  try {
    console.log('🗑️  开始清理数据...\n');

    // 1. 清理评论表
    const commentsResult = db.prepare('DELETE FROM comments').run();
    console.log(`✅ comments 表: 删除 ${commentsResult.changes} 条记录`);

    // 2. 清理讨论表 (如果存在)
    try {
      const discussionsResult = db.prepare('DELETE FROM discussions').run();
      console.log(`✅ discussions 表: 删除 ${discussionsResult.changes} 条记录`);
    } catch (e) {
      console.log(`⚠️  discussions 表不存在或清理失败: ${e.message}`);
    }

    // 3. 清理作品表 (如果需要)
    try {
      const worksResult = db.prepare('DELETE FROM contents').run();
      console.log(`✅ contents 表: 删除 ${worksResult.changes} 条记录`);
    } catch (e) {
      console.log(`⚠️  contents 表不存在或清理失败: ${e.message}`);
    }

    // 4. 清理回复表
    try {
      const repliesResult = db.prepare('DELETE FROM replies').run();
      console.log(`✅ replies 表: 删除 ${repliesResult.changes} 条记录`);
    } catch (e) {
      console.log(`⚠️  replies 表不存在或清理失败: ${e.message}`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 数据清理完成!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 5. 验证清理结果
    console.log('🔍 验证清理结果:\n');

    const commentsCount = db.prepare('SELECT COUNT(*) as count FROM comments').get();
    console.log(`   comments: ${commentsCount.count} 条`);

    try {
      const discussionsCount = db.prepare('SELECT COUNT(*) as count FROM discussions').get();
      console.log(`   discussions: ${discussionsCount.count} 条`);
    } catch (e) {
      console.log(`   discussions: 表不存在`);
    }

    try {
      const worksCount = db.prepare('SELECT COUNT(*) as count FROM contents').get();
      console.log(`   contents: ${worksCount.count} 条`);
    } catch (e) {
      console.log(`   contents: 表不存在`);
    }

    try {
      const repliesCount = db.prepare('SELECT COUNT(*) as count FROM replies').get();
      console.log(`   replies: ${repliesCount.count} 条`);
    } catch (e) {
      console.log(`   replies: 表不存在`);
    }

    console.log('\n✅ 数据库已清理,可以重新测试抓取!');

  } catch (error) {
    console.error('❌ 清理失败:', error);
    throw error;
  } finally {
    db.close();
  }
}

// 执行清理
cleanCommentTables();
