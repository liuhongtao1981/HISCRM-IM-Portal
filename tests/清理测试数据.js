/**
 * 清理测试数据
 * 清理日志、私信、评论、作品、会话等数据，保留账户和配置
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');

async function cleanTestData() {
  console.log('==========================================');
  console.log('开始清理测试数据...');
  console.log('==========================================\n');

  // 1. 连接数据库
  console.log('📁 连接数据库:', DB_PATH);
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  try {
    // 2. 显示清理前的数据统计
    console.log('\n📊 清理前数据统计:');
    const beforeStats = {
      direct_messages: db.prepare('SELECT COUNT(*) as count FROM direct_messages').get().count,
      conversations: db.prepare('SELECT COUNT(*) as count FROM conversations').get().count,
      comments: db.prepare('SELECT COUNT(*) as count FROM comments').get().count,
      discussions: db.prepare('SELECT COUNT(*) as count FROM discussions').get().count,
      contents: db.prepare('SELECT COUNT(*) as count FROM contents').get().count,
      replies: db.prepare('SELECT COUNT(*) as count FROM replies').get().count,
      notifications: db.prepare('SELECT COUNT(*) as count FROM notifications').get().count,
      worker_logs: db.prepare('SELECT COUNT(*) as count FROM worker_logs').get().count,
      accounts: db.prepare('SELECT COUNT(*) as count FROM accounts').get().count,
      workers: db.prepare('SELECT COUNT(*) as count FROM workers').get().count,
    };

    console.table(beforeStats);

    // 3. 清理数据表
    console.log('\n🧹 开始清理数据表...\n');

    db.transaction(() => {
      // 清理私信相关
      console.log('  ✓ 清理私信 (direct_messages)');
      db.prepare('DELETE FROM direct_messages').run();

      console.log('  ✓ 清理会话 (conversations)');
      db.prepare('DELETE FROM conversations').run();

      // 清理评论相关
      console.log('  ✓ 清理评论 (comments)');
      db.prepare('DELETE FROM comments').run();

      console.log('  ✓ 清理讨论 (discussions)');
      db.prepare('DELETE FROM discussions').run();

      // 清理作品
      console.log('  ✓ 清理作品 (contents)');
      db.prepare('DELETE FROM contents').run();

      // 清理回复记录
      console.log('  ✓ 清理回复记录 (replies)');
      db.prepare('DELETE FROM replies').run();

      // 清理通知
      console.log('  ✓ 清理通知 (notifications)');
      db.prepare('DELETE FROM notifications').run();

      // 清理 Worker 日志
      console.log('  ✓ 清理 Worker 日志 (worker_logs)');
      db.prepare('DELETE FROM worker_logs').run();

      // 清理 Worker 运行时状态（保留 Worker 注册信息）
      console.log('  ✓ 重置 Worker 运行时状态 (worker_runtime)');
      db.prepare(`
        UPDATE worker_runtime
        SET last_heartbeat = NULL,
            error_count = 0,
            last_error = NULL,
            active_tasks = 0
      `).run();

      // 重置账户状态
      console.log('  ✓ 重置账户爬取统计 (accounts)');
      db.prepare(`
        UPDATE accounts
        SET recent_comments_count = 0,
            recent_contents_count = 0,
            last_crawl_time = NULL
      `).run();
    })();

    // 4. 显示清理后的数据统计
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
      accounts: db.prepare('SELECT COUNT(*) as count FROM accounts').get().count,
      workers: db.prepare('SELECT COUNT(*) as count FROM workers').get().count,
    };

    console.table(afterStats);

    // 5. 清理日志文件
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

    // 6. 保留的数据说明
    console.log('\n💾 保留的数据:');
    const preservedData = {
      '账户 (accounts)': db.prepare('SELECT COUNT(*) as count FROM accounts').get().count,
      'Worker (workers)': db.prepare('SELECT COUNT(*) as count FROM workers').get().count,
      'Worker 配置 (worker_configs)': db.prepare('SELECT COUNT(*) as count FROM worker_configs').get().count,
      '代理 (proxies)': db.prepare('SELECT COUNT(*) as count FROM proxies').get().count,
      '登录会话 (login_sessions)': db.prepare('SELECT COUNT(*) as count FROM login_sessions').get().count,
    };
    console.table(preservedData);

    console.log('\n==========================================');
    console.log('✅ 数据清理完成!');
    console.log('==========================================\n');

    console.log('📋 清理总结:');
    console.log(`  ✓ 私信: ${beforeStats.direct_messages} → ${afterStats.direct_messages}`);
    console.log(`  ✓ 会话: ${beforeStats.conversations} → ${afterStats.conversations}`);
    console.log(`  ✓ 评论: ${beforeStats.comments} → ${afterStats.comments}`);
    console.log(`  ✓ 讨论: ${beforeStats.discussions} → ${afterStats.discussions}`);
    console.log(`  ✓ 作品: ${beforeStats.contents} → ${afterStats.contents}`);
    console.log(`  ✓ 回复: ${beforeStats.replies} → ${afterStats.replies}`);
    console.log(`  ✓ 通知: ${beforeStats.notifications} → ${afterStats.notifications}`);
    console.log(`  ✓ 日志: ${beforeStats.worker_logs} → ${afterStats.worker_logs}`);

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
