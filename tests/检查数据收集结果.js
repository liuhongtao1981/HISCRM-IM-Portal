/**
 * 检查数据收集结果
 * 查看各个表中收集到的数据
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');

function checkDataCollection() {
  console.log('==========================================');
  console.log('📊 数据收集结果检查');
  console.log('==========================================\n');

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  try {
    // 1. 基础统计
    console.log('📈 数据统计:\n');

    const stats = {
      '私信': db.prepare('SELECT COUNT(*) as count FROM direct_messages').get().count,
      '会话': db.prepare('SELECT COUNT(*) as count FROM conversations').get().count,
      '评论': db.prepare('SELECT COUNT(*) as count FROM comments').get().count,
      '讨论': db.prepare('SELECT COUNT(*) as count FROM discussions').get().count,
      '作品': db.prepare('SELECT COUNT(*) as count FROM contents').get().count,
      '通知': db.prepare('SELECT COUNT(*) as count FROM notifications').get().count,
    };

    console.table(stats);

    // 2. 会话详情
    if (stats['会话'] > 0) {
      console.log('\n💬 会话详情 (前10条):\n');
      const conversations = db.prepare(`
        SELECT
          platform_user_name as '用户名',
          platform_user_id as '用户ID',
          last_message_content as '最后消息',
          unread_count as '未读数'
        FROM conversations
        ORDER BY last_message_time DESC
        LIMIT 10
      `).all();

      console.table(conversations);
    }

    // 3. 私信详情
    if (stats['私信'] > 0) {
      console.log('\n📨 私信详情 (前5条):\n');
      const messages = db.prepare(`
        SELECT
          conversation_id as '会话ID',
          sender_name as '发送者',
          content as '内容',
          created_at as '时间'
        FROM direct_messages
        ORDER BY created_at DESC
        LIMIT 5
      `).all();

      console.table(messages);
    }

    // 4. 评论详情
    if (stats['评论'] > 0) {
      console.log('\n💬 评论详情 (前5条):\n');
      const comments = db.prepare(`
        SELECT
          author_name as '作者',
          text as '内容',
          like_count as '点赞数',
          reply_count as '回复数'
        FROM comments
        ORDER BY created_at DESC
        LIMIT 5
      `).all();

      console.table(comments);
    }

    // 5. 作品详情
    if (stats['作品'] > 0) {
      console.log('\n🎬 作品详情 (前5条):\n');
      const contents = db.prepare(`
        SELECT
          title as '标题',
          type as '类型',
          view_count as '播放数',
          like_count as '点赞数',
          comment_count as '评论数'
        FROM contents
        ORDER BY created_at DESC
        LIMIT 5
      `).all();

      console.table(contents);
    }

    // 6. 通知详情
    if (stats['通知'] > 0) {
      console.log('\n🔔 通知详情 (前10条):\n');
      const notifications = db.prepare(`
        SELECT
          type as '类型',
          title as '标题',
          status as '状态',
          created_at as '创建时间'
        FROM notifications
        ORDER BY created_at DESC
        LIMIT 10
      `).all();

      console.table(notifications);
    }

    console.log('\n==========================================');
    console.log('✅ 数据检查完成');
    console.log('==========================================\n');

  } catch (error) {
    console.error('❌ 检查失败:', error);
    throw error;
  } finally {
    db.close();
  }
}

checkDataCollection();
