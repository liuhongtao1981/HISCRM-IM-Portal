/**
 * 检查未读数计算的字段一致�? * 验证 isRead vs isHandled 的差�? */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');

console.log('=== 检查未读数字段一致�?===\n');

const db = new Database(DB_PATH, { readonly: true });

// 检查评论表
console.log('1. 评论表字段检�?\n');

const commentsCount = db.prepare('SELECT COUNT(*) as count FROM comments').get();
console.log(`总评论数: ${commentsCount.count}`);

const isReadCount = db.prepare('SELECT COUNT(*) as count FROM comments WHERE is_read = 0').get();
console.log(`is_read = 0 (未读): ${isReadCount.count}`);

const isHandledCount = db.prepare('SELECT COUNT(*) as count FROM comments WHERE is_handled = 0 OR is_handled IS NULL').get();
console.log(`is_handled = 0/NULL (未处�?: ${isHandledCount.count}`);

const bothFields = db.prepare(`
  SELECT COUNT(*) as count
  FROM comments
  WHERE (is_read = 0) AND (is_handled = 0 OR is_handled IS NULL)
`).get();
console.log(`两者都未处�? ${bothFields.count}`);

console.log(`\n⚠️  差异: ${Math.abs(isReadCount.count - isHandledCount.count)} 条评论的 isRead �?isHandled 状态不一致\n`);

// 检查私信表
console.log('2. 私信表字段检�?\n');

const messagesCount = db.prepare('SELECT COUNT(*) as count FROM direct_messages').get();
console.log(`总私信数: ${messagesCount.count}`);

const messageIsReadCount = db.prepare('SELECT COUNT(*) as count FROM direct_messages WHERE is_read = 0').get();
console.log(`is_read = 0 (未读): ${messageIsReadCount.count}`);

// 检查会话表
console.log('\n3. 会话表未读数检�?\n');

const conversations = db.prepare('SELECT conversation_id, user_name, unread_count FROM conversations WHERE unread_count > 0').all();
console.log(`有未读消息的会话�? ${conversations.length}`);

let totalConvUnread = 0;
conversations.forEach(conv => {
  console.log(`  - ${conv.user_name}: unread_count = ${conv.unread_count}`);
  totalConvUnread += conv.unread_count;
});

console.log(`\n会话�?unread_count 总计: ${totalConvUnread}`);
console.log(`消息�?is_read = 0 总计: ${messageIsReadCount.count}`);
console.log(`⚠️  差异: ${Math.abs(totalConvUnread - messageIsReadCount.count)} 条私信的统计不一致\n`);

// 检查特定账户的数据
console.log('4. 账户级别统计:\n');

const accounts = db.prepare('SELECT id, account_name FROM accounts WHERE assigned_worker_id IS NOT NULL').all();

accounts.forEach(account => {
  const accountComments = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_by_isRead,
      SUM(CASE WHEN is_handled = 0 OR is_handled IS NULL THEN 1 ELSE 0 END) as unread_by_isHandled
    FROM comments
    WHERE account_id = ?
  `).get(account.id);

  const accountMessages = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_by_isRead
    FROM direct_messages
    WHERE account_id = ?
  `).get(account.id);

  const accountConversations = db.prepare(`
    SELECT SUM(unread_count) as total_unread
    FROM conversations
    WHERE account_id = ?
  `).get(account.id);

  console.log(`账户: ${account.account_name}`);
  console.log(`  评论未读 (isRead): ${accountComments.unread_by_isRead}`);
  console.log(`  评论未读 (isHandled): ${accountComments.unread_by_isHandled}`);
  console.log(`  私信未读 (消息�?isRead): ${accountMessages.unread_by_isRead}`);
  console.log(`  私信未读 (会话�?unread_count): ${accountConversations.total_unread || 0}`);

  const commentDiff = accountComments.unread_by_isRead - accountComments.unread_by_isHandled;
  const messageDiff = accountMessages.unread_by_isRead - (accountConversations.total_unread || 0);

  if (commentDiff !== 0 || messageDiff !== 0) {
    console.log(`  ⚠️  评论差异: ${commentDiff}, 私信差异: ${messageDiff}`);
  }
  console.log('');
});

db.close();

console.log('=== 总结 ===\n');
console.log('如果发现差异，说明系统中有两套不同的未读标准�?);
console.log('1. 定时推送使用：isHandled (评论) + conversation.unreadCount (私信)');
console.log('2. topics 构造使用：isRead (评论和私信都�?');
console.log('\n这会导致未读数在两个值之间跳动！');
