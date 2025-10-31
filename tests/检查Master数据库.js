/**
 * 检查 Master 数据库中的数据
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');
const ACCOUNT_ID = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('='.repeat(80));
console.log('检查 Master 数据库数据');
console.log('='.repeat(80));
console.log(`数据库路径: ${DB_PATH}`);
console.log(`账户 ID: ${ACCOUNT_ID}`);
console.log('='.repeat(80));

try {
  const db = new Database(DB_PATH, { readonly: true });

  // 1. 检查账户信息
  console.log('\n📊 1. 账户信息:');
  const account = db.prepare(`
    SELECT account_id, platform, account_name, status, login_status, worker_status
    FROM accounts
    WHERE account_id = ?
  `).get(ACCOUNT_ID);

  if (account) {
    console.log(`  账户 ID: ${account.account_id}`);
    console.log(`  平台: ${account.platform}`);
    console.log(`  账户名: ${account.account_name}`);
    console.log(`  状态: ${account.status}`);
    console.log(`  登录状态: ${account.login_status}`);
    console.log(`  Worker 状态: ${account.worker_status}`);
  } else {
    console.log('  ❌ 没有找到账户信息');
  }

  // 2. 检查评论数据
  console.log('\n📝 2. 评论数据:');
  const comments = db.prepare(`
    SELECT
      comment_id,
      work_id,
      work_title,
      author_name,
      content,
      parent_comment_id,
      is_author_reply,
      created_at,
      detected_at
    FROM comments
    WHERE account_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(ACCOUNT_ID);

  console.log(`  总数: ${comments.length} 条评论`);

  if (comments.length > 0) {
    comments.forEach((comment, index) => {
      console.log(`\n  评论 ${index + 1}:`);
      console.log(`    ID: ${comment.comment_id}`);
      console.log(`    作品 ID: ${comment.work_id}`);
      console.log(`    作品标题: ${comment.work_title || '无'}`);
      console.log(`    作者: ${comment.author_name || '未知'}`);
      console.log(`    内容: ${comment.content || '无'}`);
      console.log(`    是否作者回复: ${comment.is_author_reply ? '是' : '否'}`);
      console.log(`    父评论 ID: ${comment.parent_comment_id || '无'}`);
      console.log(`    创建时间: ${new Date(comment.created_at).toLocaleString('zh-CN')}`);
    });
  } else {
    console.log('  ⚠️  没有评论数据');
  }

  // 3. 检查作品数据
  console.log('\n🎬 3. 作品数据:');
  const works = db.prepare(`
    SELECT
      work_id,
      title,
      author_name,
      created_at
    FROM douyin_videos
    WHERE account_id = ?
    ORDER BY created_at DESC
    LIMIT 5
  `).all(ACCOUNT_ID);

  console.log(`  总数: ${works.length} 个作品`);

  if (works.length > 0) {
    works.forEach((work, index) => {
      // 统计这个作品的评论数
      const commentCount = db.prepare(`
        SELECT COUNT(*) as count
        FROM comments
        WHERE account_id = ? AND work_id = ?
      `).get(ACCOUNT_ID, work.work_id);

      console.log(`\n  作品 ${index + 1}:`);
      console.log(`    ID: ${work.work_id}`);
      console.log(`    标题: ${work.title || '无'}`);
      console.log(`    作者: ${work.author_name || '未知'}`);
      console.log(`    评论数: ${commentCount.count || 0}`);
      console.log(`    创建时间: ${new Date(work.created_at).toLocaleString('zh-CN')}`);
    });
  } else {
    console.log('  ⚠️  没有作品数据');
  }

  // 4. 检查私信会话数据
  console.log('\n💬 4. 私信会话数据:');
  const conversations = db.prepare(`
    SELECT
      conversation_id,
      user_name,
      last_message_content,
      unread_count,
      last_message_time,
      created_at
    FROM conversations
    WHERE account_id = ?
    ORDER BY last_message_time DESC
    LIMIT 5
  `).all(ACCOUNT_ID);

  console.log(`  总数: ${conversations.length} 个会话`);

  if (conversations.length > 0) {
    conversations.forEach((conv, index) => {
      // 统计这个会话的消息数
      const messageCount = db.prepare(`
        SELECT COUNT(*) as count
        FROM direct_messages
        WHERE account_id = ? AND conversation_id = ?
      `).get(ACCOUNT_ID, conv.conversation_id);

      console.log(`\n  会话 ${index + 1}:`);
      console.log(`    ID: ${conv.conversation_id}`);
      console.log(`    用户: ${conv.user_name || '未知'}`);
      console.log(`    最后消息: ${conv.last_message_content || '无'}`);
      console.log(`    未读数: ${conv.unread_count || 0}`);
      console.log(`    消息数: ${messageCount.count || 0}`);
      console.log(`    最后消息时间: ${new Date(conv.last_message_time).toLocaleString('zh-CN')}`);
    });
  } else {
    console.log('  ⚠️  没有私信会话数据');
  }

  // 5. 检查私信消息数据
  console.log('\n📩 5. 私信消息数据:');
  const messages = db.prepare(`
    SELECT
      message_id,
      conversation_id,
      sender_name,
      content,
      direction,
      created_at
    FROM direct_messages
    WHERE account_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(ACCOUNT_ID);

  console.log(`  总数: ${messages.length} 条私信`);

  if (messages.length > 0) {
    messages.forEach((msg, index) => {
      console.log(`\n  消息 ${index + 1}:`);
      console.log(`    ID: ${msg.message_id}`);
      console.log(`    会话 ID: ${msg.conversation_id}`);
      console.log(`    发送者: ${msg.sender_name || '未知'}`);
      console.log(`    内容: ${msg.content || '无'}`);
      console.log(`    方向: ${msg.direction || '未知'}`);
      console.log(`    时间: ${new Date(msg.created_at).toLocaleString('zh-CN')}`);
    });
  } else {
    console.log('  ⚠️  没有私信消息数据');
  }

  db.close();

  console.log('\n' + '='.repeat(80));
  console.log('数据库检查完成');
  console.log('='.repeat(80));

} catch (error) {
  console.error('\n❌ 错误:', error.message);
  process.exit(1);
}
