/**
 * 测试脚本: 检查数据库中的私信数据
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
console.log(`📊 正在检查数据库: ${dbPath}`);

try {
  const db = new Database(dbPath, { readonly: true });

  // 检查 cache_direct_messages 表
  console.log('\n=== cache_direct_messages 表 ===');
  const dmCount = db.prepare('SELECT COUNT(*) as count FROM cache_direct_messages').get();
  console.log(`总消息数: ${dmCount.count}`);

  if (dmCount.count > 0) {
    const sample = db.prepare('SELECT * FROM cache_direct_messages LIMIT 5').all();
    console.log('\n前5条消息:');
    console.log(JSON.stringify(sample, null, 2));
  }

  // 检查 cache_conversations 表
  console.log('\n=== cache_conversations 表 ===');
  const convCount = db.prepare('SELECT COUNT(*) as count FROM cache_conversations').get();
  console.log(`总会话数: ${convCount.count}`);

  if (convCount.count > 0) {
    const convSample = db.prepare('SELECT platform_conversation_id, platform_user_name, last_message_content, last_message_time FROM cache_conversations LIMIT 5').all();
    console.log('\n前5个会话:');
    console.log(JSON.stringify(convSample, null, 2));
  }

  // 检查按账户分组的统计
  console.log('\n=== 按账户统计 ===');
  const stats = db.prepare(`
    SELECT
      account_id,
      COUNT(*) as conversation_count
    FROM cache_conversations
    GROUP BY account_id
  `).all();
  console.log(JSON.stringify(stats, null, 2));

  db.close();
  console.log('\n✅ 数据库检查完成');
} catch (error) {
  console.error('❌ 数据库检查失败:', error.message);
  process.exit(1);
}
