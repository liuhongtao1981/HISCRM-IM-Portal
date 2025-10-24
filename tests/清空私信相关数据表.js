/**
 * 清空私信和会话相关数据表，准备重新测试
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n========================================');
console.log('🗑️  清空私信相关数据表');
console.log('========================================\n');

try {
  // 1. 查询清空前的数据量
  const beforeMessages = db.prepare('SELECT COUNT(*) as count FROM direct_messages').get().count;
  const beforeConversations = db.prepare('SELECT COUNT(*) as count FROM conversations').get().count;

  console.log('📊 清空前数据统计:');
  console.log(`  私信消息: ${beforeMessages} 条`);
  console.log(`  会话: ${beforeConversations} 个`);
  console.log('');

  // 2. 清空数据表
  console.log('🗑️  执行清空操作...\n');

  db.prepare('DELETE FROM direct_messages').run();
  console.log('  ✅ direct_messages 表已清空');

  db.prepare('DELETE FROM conversations').run();
  console.log('  ✅ conversations 表已清空');

  // 3. 验证清空结果
  const afterMessages = db.prepare('SELECT COUNT(*) as count FROM direct_messages').get().count;
  const afterConversations = db.prepare('SELECT COUNT(*) as count FROM conversations').get().count;

  console.log('');
  console.log('✅ 清空后数据统计:');
  console.log(`  私信消息: ${afterMessages} 条`);
  console.log(`  会话: ${afterConversations} 个`);

  console.log('\n========================================');
  console.log('✅ 数据表清空完成！');
  console.log('========================================\n');

} catch (error) {
  console.error('❌ 清空失败:', error.message);
  console.error(error.stack);
} finally {
  db.close();
}
