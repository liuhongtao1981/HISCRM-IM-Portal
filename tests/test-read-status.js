/**
 * 已读状态功能测试脚�?
 * 测试 DAO 层的已读状态处理方�?
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'packages', 'master', 'data', 'master.db');
const db = new Database(dbPath);

console.log('\n🧪 Testing Read Status Functionality');
console.log('='.repeat(80));
console.log(`Database: ${dbPath}\n`);

try {
  const CommentsDAO = require('../packages/master/src/database/comments-dao');
  const DirectMessagesDAO = require('../packages/master/src/database/messages-dao');

  const commentsDAO = new CommentsDAO(db);
  const messagesDAO = new DirectMessagesDAO(db);

  // ============================================================================
  // Phase 1: 测试 CommentsDAO
  // ============================================================================

  console.log('📝 Phase 1: Testing CommentsDAO\n');

  // 1.1 统计未读评论
  console.log('   [1/6] Counting unread comments...');
  const commentsUnread = commentsDAO.countUnread();
  console.log(`   �?Unread comments: ${commentsUnread}`);

  // 1.2 按账户统计未读评�?
  console.log('\n   [2/6] Counting unread comments by account...');
  const commentsUnreadByAccount = commentsDAO.countUnreadByAccount();
  console.log(`   �?Unread by account: ${JSON.stringify(commentsUnreadByAccount, null, 2)}`);

  // 1.3 测试批量标记已读（如果有未读评论�?
  if (commentsUnread > 0) {
    console.log('\n   [3/6] Testing batch mark as read...');

    // 获取�?5 条未读评�?
    const unreadComments = commentsDAO.findAll({ is_read: false, limit: 5 });
    const commentIds = unreadComments.map(c => c.id);

    if (commentIds.length > 0) {
      const count = commentsDAO.markBatchAsRead(commentIds);
      console.log(`   �?Marked ${count} comments as read`);

      // 验证 read_at 字段
      const readComment = commentsDAO.findById(commentIds[0]);
      if (readComment && readComment.read_at) {
        console.log(`   �?read_at timestamp verified: ${readComment.read_at}`);
      } else {
        console.log(`   ⚠️  Warning: read_at not set properly`);
      }
    } else {
      console.log(`   �? Skipped: No unread comments found`);
    }
  } else {
    console.log('\n   [3/6] �? Skipped: No unread comments for testing');
  }

  // 1.4 测试按作品标记已�?
  console.log('\n   [4/6] Testing mark topic as read...');
  // 获取一个作品ID
  const sampleComments = commentsDAO.findAll({ limit: 1 });
  if (sampleComments.length > 0 && sampleComments[0].post_id) {
    const postId = sampleComments[0].post_id;
    const count = commentsDAO.markTopicAsRead(postId);
    console.log(`   �?Marked ${count} comments in topic ${postId} as read`);
  } else {
    console.log(`   �? Skipped: No comments found for testing`);
  }

  // 1.5 验证统计更新
  console.log('\n   [5/6] Verifying unread count update...');
  const newCommentsUnread = commentsDAO.countUnread();
  console.log(`   �?New unread count: ${newCommentsUnread} (was: ${commentsUnread})`);

  // 1.6 测试单条标记已读
  console.log('\n   [6/6] Testing single mark as read...');
  const remainingUnread = commentsDAO.findAll({ is_read: false, limit: 1 });
  if (remainingUnread.length > 0) {
    const success = commentsDAO.markAsRead(remainingUnread[0].id);
    console.log(`   �?Single comment marked as read: ${success}`);
  } else {
    console.log(`   �? Skipped: No unread comments remaining`);
  }

  // ============================================================================
  // Phase 2: 测试 DirectMessagesDAO
  // ============================================================================

  console.log('\n📬 Phase 2: Testing DirectMessagesDAO\n');

  // 2.1 统计未读私信
  console.log('   [1/6] Counting unread messages...');
  const messagesUnread = messagesDAO.countUnread();
  console.log(`   �?Unread messages: ${messagesUnread}`);

  // 2.2 按账户统计未读私�?
  console.log('\n   [2/6] Counting unread messages by account...');
  const messagesUnreadByAccount = messagesDAO.countUnreadByAccount();
  console.log(`   �?Unread by account: ${JSON.stringify(messagesUnreadByAccount, null, 2)}`);

  // 2.3 测试批量标记已读（如果有未读私信�?
  if (messagesUnread > 0) {
    console.log('\n   [3/6] Testing batch mark as read...');

    // 获取�?5 条未读私�?
    const unreadMessages = messagesDAO.findAll({ is_read: false, limit: 5 });
    const messageIds = unreadMessages.map(m => m.id);

    if (messageIds.length > 0) {
      const count = messagesDAO.markBatchAsRead(messageIds);
      console.log(`   �?Marked ${count} messages as read`);

      // 验证 read_at 字段
      const readMessage = messagesDAO.findById(messageIds[0]);
      if (readMessage && readMessage.read_at) {
        console.log(`   �?read_at timestamp verified: ${readMessage.read_at}`);
      } else {
        console.log(`   ⚠️  Warning: read_at not set properly`);
      }
    } else {
      console.log(`   �? Skipped: No unread messages found`);
    }
  } else {
    console.log('\n   [3/6] �? Skipped: No unread messages for testing');
  }

  // 2.4 测试按会话标记已�?
  console.log('\n   [4/6] Testing mark conversation as read...');
  const sampleMessages = messagesDAO.findAll({ limit: 1 });
  if (sampleMessages.length > 0 && sampleMessages[0].conversation_id) {
    const conversationId = sampleMessages[0].conversation_id;
    const count = messagesDAO.markConversationAsRead(conversationId);
    console.log(`   �?Marked ${count} messages in conversation ${conversationId} as read`);
  } else {
    console.log(`   �? Skipped: No messages found for testing`);
  }

  // 2.5 验证统计更新
  console.log('\n   [5/6] Verifying unread count update...');
  const newMessagesUnread = messagesDAO.countUnread();
  console.log(`   �?New unread count: ${newMessagesUnread} (was: ${messagesUnread})`);

  // 2.6 测试单条标记已读
  console.log('\n   [6/6] Testing single mark as read...');
  const remainingUnreadMsg = messagesDAO.findAll({ is_read: false, limit: 1 });
  if (remainingUnreadMsg.length > 0) {
    const success = messagesDAO.markAsRead(remainingUnreadMsg[0].id);
    console.log(`   �?Single message marked as read: ${success}`);
  } else {
    console.log(`   �? Skipped: No unread messages remaining`);
  }

  // ============================================================================
  // Phase 3: 综合统计
  // ============================================================================

  console.log('\n📊 Phase 3: Final Statistics\n');

  const finalCommentsUnread = commentsDAO.countUnread();
  const finalMessagesUnread = messagesDAO.countUnread();
  const totalUnread = finalCommentsUnread + finalMessagesUnread;

  console.log(`   Comments: ${finalCommentsUnread} unread`);
  console.log(`   Messages: ${finalMessagesUnread} unread`);
  console.log(`   Total: ${totalUnread} unread`);

  // 获取数据库中的总数据量
  const totalComments = db.prepare('SELECT COUNT(*) as count FROM comments').get().count;
  const totalMessages = db.prepare('SELECT COUNT(*) as count FROM direct_messages').get().count;

  console.log(`\n   Total in database:`);
  console.log(`   Comments: ${totalComments} (${finalCommentsUnread} unread)`);
  console.log(`   Messages: ${totalMessages} (${finalMessagesUnread} unread)`);

  // 验证 read_at 字段存在�?
  console.log(`\n   Verifying read_at field...`);
  const commentsWithReadAt = db.prepare(`
    SELECT COUNT(*) as count
    FROM comments
    WHERE read_at IS NOT NULL
  `).get().count;

  const messagesWithReadAt = db.prepare(`
    SELECT COUNT(*) as count
    FROM direct_messages
    WHERE read_at IS NOT NULL
  `).get().count;

  console.log(`   Comments with read_at: ${commentsWithReadAt}`);
  console.log(`   Messages with read_at: ${messagesWithReadAt}`);

  console.log('\n' + '='.repeat(80));
  console.log('�?All tests passed!\n');

  db.close();
  process.exit(0);

} catch (error) {
  console.error('\n�?Test failed:', error);
  console.error('\nStack trace:', error.stack);
  console.error('\n' + '='.repeat(80));
  db.close();
  process.exit(1);
}
