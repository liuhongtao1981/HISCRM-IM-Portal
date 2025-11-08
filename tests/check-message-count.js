/**
 * 检查数据库中的消息数量
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n' + '='.repeat(60));
console.log('数据库消息统�?);
console.log('='.repeat(60) + '\n');

try {
  // 查询总数
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM cache_conversations) as conversations,
      (SELECT COUNT(*) FROM cache_messages) as messages,
      (SELECT COUNT(*) FROM cache_comments) as comments,
      (SELECT COUNT(*) FROM cache_contents) as contents
  `).get();

  console.log('数据统计:');
  console.log(`  会话�? ${counts.conversations}`);
  console.log(`  消息�? ${counts.messages} ${counts.messages === 0 ? '�? : '�?}`);
  console.log(`  评论�? ${counts.comments}`);
  console.log(`  内容�? ${counts.contents}`);

  if (counts.messages > 0) {
    console.log('\n消息示例:');
    const messages = db.prepare(`
      SELECT id, conversation_id, data, created_at
      FROM cache_messages
      LIMIT 5
    `).all();

    messages.forEach((msg, idx) => {
      const data = JSON.parse(msg.data);
      console.log(`\n  消息 #${idx + 1}:`);
      console.log(`    ID: ${data.messageId}`);
      console.log(`    会话ID: ${msg.conversation_id}`);
      console.log(`    内容: ${data.content ? data.content.substring(0, 50) : '无内�?}...`);
      console.log(`    发送�? ${data.senderName || '未知'}`);
      console.log(`    时间: ${new Date(msg.created_at).toISOString()}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log(`${counts.messages === 0 ? '�?消息数为 0 - 需要等�?Worker 爬取' : '�?已有消息数据'}`);
  console.log('='.repeat(60) + '\n');

} catch (error) {
  console.error('查询失败:', error.message);
} finally {
  db.close();
}
