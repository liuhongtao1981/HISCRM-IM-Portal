/**
 * 简单清理测试数据
 * 只清理数据表,不更新其他字段
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');

async function cleanTestData() {
  console.log('==========================================');
  console.log('开始清理测试数据...');
  console.log('==========================================\n');

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  try {
    // 显示清理前的数据统计
    console.log('📊 清理前数据统计:');
    const beforeStats = {
      direct_messages: db.prepare('SELECT COUNT(*) as count FROM direct_messages').get().count,
      conversations: db.prepare('SELECT COUNT(*) as count FROM conversations').get().count,
      comments: db.prepare('SELECT COUNT(*) as count FROM comments').get().count,
      discussions: db.prepare('SELECT COUNT(*) as count FROM discussions').get().count,
      contents: db.prepare('SELECT COUNT(*) as count FROM contents').get().count,
      replies: db.prepare('SELECT COUNT(*) as count FROM replies').get().count,
      notifications: db.prepare('SELECT COUNT(*) as count FROM notifications').get().count,
      worker_logs: db.prepare('SELECT COUNT(*) as count FROM worker_logs').get().count,
    };
    console.table(beforeStats);

    // 清理数据表
    console.log('\n🧹 清理数据...\n');

    db.transaction(() => {
      console.log('  ✓ 清理私信 (direct_messages)');
      db.prepare('DELETE FROM direct_messages').run();

      console.log('  ✓ 清理会话 (conversations)');
      db.prepare('DELETE FROM conversations').run();

      console.log('  ✓ 清理评论 (comments)');
      db.prepare('DELETE FROM comments').run();

      console.log('  ✓ 清理讨论 (discussions)');
      db.prepare('DELETE FROM discussions').run();

      console.log('  ✓ 清理作品 (contents)');
      db.prepare('DELETE FROM contents').run();

      console.log('  ✓ 清理回复记录 (replies)');
      db.prepare('DELETE FROM replies').run();

      console.log('  ✓ 清理通知 (notifications)');
      db.prepare('DELETE FROM notifications').run();

      console.log('  ✓ 清理 Worker 日志 (worker_logs)');
      db.prepare('DELETE FROM worker_logs').run();
    })();

    // 显示清理后的数据统计
    console.log('\n📊 清理后数据统计:');
    const afterStats = {
      direct_messages: db.prepare('SELECT COUNT(*) as count FROM direct_messages').get().count,
      conversations: db.prepare('SELECT COUNT(*) as count FROM conversations').get().count,
      comments: db.prepare('SELECT COUNT(*) as count FROM comments').get().count,
      discussions: db.prepare('SELECT COUNT(*) as count FROM discussions').get().count,
      contents: db.prepare('SELECT COUNT(*) as count FROM contents').get().count,
      replies: db.prepare('SELECT COUNT(*) as count FROM replies').get().count,
      notifications: db.prepare('SELECT COUNT(*) as count FROM notifications').get().count,
      worker_logs: db.prepare('SELECT COUNT(*) as count FROM worker_logs').get().count,
    };
    console.table(afterStats);

    // 清理日志文件
    console.log('\n📝 清理日志文件...\n');

    const logDirs = [
      path.join(__dirname, '../packages/master/logs'),
      path.join(__dirname, '../packages/worker/logs'),
      path.join(__dirname, '../logs'),
    ];

    for (const logDir of logDirs) {
      if (fs.existsSync(logDir)) {
        const files = fs.readdirSync(logDir);
        let cleaned = 0;

        for (const file of files) {
          if (file.endsWith('.log')) {
            const filePath = path.join(logDir, file);
            try {
              fs.unlinkSync(filePath);
              cleaned++;
            } catch (err) {
              console.warn(`    ⚠ 无法删除 ${file}: ${err.message}`);
            }
          }
        }

        if (cleaned > 0) {
          console.log(`  ✓ 清理 ${logDir}: ${cleaned} 个日志文件`);
        }
      }
    }

    console.log('\n==========================================');
    console.log('✅ 数据清理完成!');
    console.log('==========================================\n');

    console.log('📋 清理总结:');
    console.log(`  ✓ 私信: ${beforeStats.direct_messages} → 0`);
    console.log(`  ✓ 会话: ${beforeStats.conversations} → 0`);
    console.log(`  ✓ 评论: ${beforeStats.comments} → 0`);
    console.log(`  ✓ 讨论: ${beforeStats.discussions} → 0`);
    console.log(`  ✓ 作品: ${beforeStats.contents} → 0`);
    console.log(`  ✓ 回复: ${beforeStats.replies} → 0`);
    console.log(`  ✓ 通知: ${beforeStats.notifications} → 0`);
    console.log(`  ✓ 日志: ${beforeStats.worker_logs} → 0`);

    console.log('\n🚀 现在可以开始整体测试了!\n');

  } catch (error) {
    console.error('❌ 清理失败:', error);
    throw error;
  } finally {
    db.close();
  }
}

// 执行清理
cleanTestData().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
