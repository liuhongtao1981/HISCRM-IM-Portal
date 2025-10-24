/**
 * 清空测试数据表
 * 清空：works（作品）、discussions（讨论）、comments（评论）、
 *      direct_messages（私信）、conversations（会话）
 */

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('='.repeat(80));
console.log('开始清空测试数据表');
console.log('='.repeat(80));
console.log('');

try {
  // 查询清空前的数据量
  console.log('📊 清空前数据统计:');
  console.log('-'.repeat(80));

  const beforeStats = {
    works: db.prepare('SELECT COUNT(*) as count FROM works').get(),
    discussions: db.prepare('SELECT COUNT(*) as count FROM discussions').get(),
    comments: db.prepare('SELECT COUNT(*) as count FROM comments').get(),
    direct_messages: db.prepare('SELECT COUNT(*) as count FROM direct_messages').get(),
    conversations: db.prepare('SELECT COUNT(*) as count FROM conversations').get(),
    douyin_videos: db.prepare('SELECT COUNT(*) as count FROM douyin_videos').get(),
  };

  console.log(`  作品(works): ${beforeStats.works.count} 条`);
  console.log(`  讨论(discussions): ${beforeStats.discussions.count} 条`);
  console.log(`  评论(comments): ${beforeStats.comments.count} 条`);
  console.log(`  私信(direct_messages): ${beforeStats.direct_messages.count} 条`);
  console.log(`  会话(conversations): ${beforeStats.conversations.count} 条`);
  console.log(`  抖音视频(douyin_videos): ${beforeStats.douyin_videos.count} 条`);
  console.log('');

  // 开始事务
  db.prepare('BEGIN TRANSACTION').run();

  console.log('🗑️  开始清空数据表...');
  console.log('-'.repeat(80));

  // 清空表（按依赖顺序，先删除子表）
  const tables = [
    'discussions',      // 依赖 comments 和 works
    'comments',
    'direct_messages',
    'conversations',
    'works',
    'douyin_videos',
  ];

  for (const table of tables) {
    try {
      const result = db.prepare(`DELETE FROM ${table}`).run();
      console.log(`  ✅ ${table}: 删除了 ${result.changes} 条记录`);
    } catch (error) {
      console.error(`  ❌ ${table}: 删除失败 - ${error.message}`);
      throw error;
    }
  }

  // 提交事务
  db.prepare('COMMIT').run();

  console.log('');
  console.log('📊 清空后数据统计:');
  console.log('-'.repeat(80));

  const afterStats = {
    works: db.prepare('SELECT COUNT(*) as count FROM works').get(),
    discussions: db.prepare('SELECT COUNT(*) as count FROM discussions').get(),
    comments: db.prepare('SELECT COUNT(*) as count FROM comments').get(),
    direct_messages: db.prepare('SELECT COUNT(*) as count FROM direct_messages').get(),
    conversations: db.prepare('SELECT COUNT(*) as count FROM conversations').get(),
    douyin_videos: db.prepare('SELECT COUNT(*) as count FROM douyin_videos').get(),
  };

  console.log(`  作品(works): ${afterStats.works.count} 条`);
  console.log(`  讨论(discussions): ${afterStats.discussions.count} 条`);
  console.log(`  评论(comments): ${afterStats.comments.count} 条`);
  console.log(`  私信(direct_messages): ${afterStats.direct_messages.count} 条`);
  console.log(`  会话(conversations): ${afterStats.conversations.count} 条`);
  console.log(`  抖音视频(douyin_videos): ${afterStats.douyin_videos.count} 条`);
  console.log('');

  console.log('='.repeat(80));
  console.log('✅ 数据表清空完成！');
  console.log('='.repeat(80));

} catch (error) {
  // 回滚事务
  try {
    db.prepare('ROLLBACK').run();
    console.error('\n❌ 清空失败，已回滚事务');
  } catch (rollbackError) {
    console.error('\n❌ 回滚失败:', rollbackError);
  }
  console.error('错误详情:', error);
  process.exit(1);
} finally {
  db.close();
}
