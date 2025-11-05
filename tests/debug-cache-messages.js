/**
 * 调试 cache_messages 表的账户ID问题
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n' + '='.repeat(60));
console.log('DEBUG: cache_messages 表账户ID分析');
console.log('='.repeat(60) + '\n');

try {
  // 1. 查询所有 account_id 的分布
  console.log('1. 账户ID分布:');
  const accountGroups = db.prepare(`
    SELECT account_id, COUNT(*) as count
    FROM cache_messages
    GROUP BY account_id
  `).all();

  accountGroups.forEach(row => {
    console.log(`  账户ID: ${row.account_id || '(NULL)'} - ${row.count} 条消息`);
  });

  // 2. 查询 cache_metadata 中的账户
  console.log('\n2. cache_metadata 中的账户:');
  const metadata = db.prepare(`
    SELECT account_id, platform, messages_count
    FROM cache_metadata
  `).all();

  metadata.forEach(row => {
    console.log(`  账户ID: ${row.account_id} - 平台: ${row.platform} - 元数据消息数: ${row.messages_count}`);
  });

  // 3. 查看第一条消息的完整结构
  console.log('\n3. 第一条消息的完整结构:');
  const firstMessage = db.prepare(`
    SELECT * FROM cache_messages LIMIT 1
  `).get();

  if (firstMessage) {
    console.log('  所有字段:');
    Object.keys(firstMessage).forEach(key => {
      console.log(`    ${key}: ${firstMessage[key]}`);
    });

    console.log('\n  data 字段解析:');
    const data = JSON.parse(firstMessage.data);
    console.log('    messageId:', data.messageId);
    console.log('    conversationId:', data.conversationId);
    console.log('    content:', data.content?.substring(0, 50));
    console.log('    senderName:', data.senderName);
  }

  // 4. 检查是否存在没有 account_id 的消息
  console.log('\n4. 检查 account_id 为 NULL 的消息:');
  const nullAccountMessages = db.prepare(`
    SELECT COUNT(*) as count
    FROM cache_messages
    WHERE account_id IS NULL OR account_id = ''
  `).get();

  console.log(`  NULL/空 account_id 的消息数: ${nullAccountMessages.count}`);

  console.log('\n' + '='.repeat(60));

} catch (error) {
  console.error('查询失败:', error.message);
  console.error(error.stack);
} finally {
  db.close();
}
