/**
 * 清空评论、作品、私信表
 * 用于测试推送消息功能
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'master.db');
console.log(`📂 Database path: ${dbPath}`);

try {
  const db = new Database(dbPath);

  console.log('\n🗑️  Clearing tables...\n');

  // 清空评论表
  const commentsResult = db.prepare('DELETE FROM comments').run();
  console.log(`✅ Comments table cleared: ${commentsResult.changes} rows deleted`);

  // 清空私信表
  const dmsResult = db.prepare('DELETE FROM direct_messages').run();
  console.log(`✅ Direct messages table cleared: ${dmsResult.changes} rows deleted`);

  // 清空作品表
  const worksResult = db.prepare('DELETE FROM contents').run();
  console.log(`✅ Works table cleared: ${worksResult.changes} rows deleted`);

  // 验证清空结果
  console.log('\n📊 Verification:');
  const commentsCount = db.prepare('SELECT COUNT(*) as count FROM comments').get();
  const dmsCount = db.prepare('SELECT COUNT(*) as count FROM direct_messages').get();
  const worksCount = db.prepare('SELECT COUNT(*) as count FROM contents').get();

  console.log(`   Comments: ${commentsCount.count} rows`);
  console.log(`   Direct messages: ${dmsCount.count} rows`);
  console.log(`   Works: ${worksCount.count} rows`);

  db.close();
  console.log('\n✅ All tables cleared successfully!\n');

} catch (error) {
  console.error('❌ Error clearing tables:', error);
  process.exit(1);
}
