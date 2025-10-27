/**
 * 查看评论和讨论抓取结果
 */

const path = require('path');
const Database = require('better-sqlite3');

function checkCrawlResults() {
  console.log('📋 查看抓取结果\n');

  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  try {
    // 1. 查看评论数据
    const comments = db.prepare(`
      SELECT
        id,
        platform_comment_id,
        author_name,
        content,
        datetime(create_time, 'unixepoch', 'localtime') as create_time,
        stats_like_count,
        reply_count
      FROM comments
      ORDER BY create_time DESC
      LIMIT 10
    `).all();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📝 评论数据 (共 ${comments.length} 条)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    comments.forEach((c, i) => {
      console.log(`${i + 1}. ${c.author_name}: ${c.content.substring(0, 50)}${c.content.length > 50 ? '...' : ''}`);
      console.log(`   ID: ${c.platform_comment_id.substring(0, 40)}...`);
      console.log(`   时间: ${c.create_time}`);
      console.log(`   👍 ${c.stats_like_count} | 💬 ${c.reply_count} 回复`);
      console.log('');
    });

    // 2. 查看讨论数据
    let discussions = [];
    try {
      discussions = db.prepare(`
        SELECT
          id,
          platform_discussion_id,
          parent_comment_id,
          author_name,
          content,
          datetime(create_time, 'unixepoch', 'localtime') as create_time,
          stats_like_count,
          reply_count
        FROM discussions
        ORDER BY create_time DESC
        LIMIT 10
      `).all();

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`💬 讨论数据 (共 ${discussions.length} 条)`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      if (discussions.length === 0) {
        console.log('⚠️  没有抓取到讨论数据!\n');
        console.log('可能原因:');
        console.log('  1. Worker未执行点击"查看回复"按钮操作');
        console.log('  2. 选择的视频评论没有回复');
        console.log('  3. API拦截器未捕获讨论API');
        console.log('');
      } else {
        discussions.forEach((d, i) => {
          console.log(`${i + 1}. ${d.author_name}: ${d.content.substring(0, 50)}${d.content.length > 50 ? '...' : ''}`);
          console.log(`   父评论ID: ${d.parent_comment_id.substring(0, 40)}...`);
          console.log(`   时间: ${d.create_time}`);
          console.log(`   👍 ${d.stats_like_count} | 💬 ${d.reply_count} 回复`);
          console.log('');
        });
      }
    } catch (e) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`❌ discussions 表不存在或查询失败`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    // 3. 统计信息
    const commentsCount = db.prepare('SELECT COUNT(*) as count FROM comments').get();

    let discussionsCount = { count: 0 };
    try {
      discussionsCount = db.prepare('SELECT COUNT(*) as count FROM discussions').get();
    } catch (e) {}

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 抓取统计');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   评论: ${commentsCount.count} 条`);
    console.log(`   讨论: ${discussionsCount.count} 条`);
    console.log('');

    if (commentsCount.count > 0 && discussionsCount.count === 0) {
      console.log('⚠️  评论已抓取,但讨论为0!');
      console.log('   说明Worker未执行点击"查看回复"按钮的操作\n');

      // 检查有回复的评论
      const commentsWithReplies = db.prepare(`
        SELECT COUNT(*) as count
        FROM comments
        WHERE reply_count > 0
      `).get();

      console.log(`   有回复的评论数: ${commentsWithReplies.count}`);

      if (commentsWithReplies.count > 0) {
        console.log(`   ✅ 有 ${commentsWithReplies.count} 条评论包含回复,应该能抓取讨论数据`);
        console.log('   但实际未抓取到,说明点击操作未执行!');
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ 查询失败:', error);
  } finally {
    db.close();
  }
}

checkCrawlResults();
