/**
 * 检查所有爬虫数据（作品、评论、讨论、私信）
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n========================================');
console.log('📊 所有爬虫数据统计');
console.log('========================================\n');

// 1. 获取账户信息
const account = db.prepare('SELECT * FROM accounts WHERE platform = ?').get('douyin');
console.log('📱 测试账户:');
console.log('  ID:', account.id);
console.log('  登录状态:', account.login_status);
console.log('  Worker状态:', account.worker_status);
console.log('');

// 2. 统计各类数据
const worksCount = db.prepare('SELECT COUNT(*) as count FROM contents WHERE account_id = ?').get(account.id)?.count || 0;
const commentsCount = db.prepare('SELECT COUNT(*) as count FROM comments WHERE account_id = ?').get(account.id)?.count || 0;
const discussionsCount = db.prepare('SELECT COUNT(*) as count FROM discussions WHERE account_id = ?').get(account.id)?.count || 0;
const messagesCount = db.prepare('SELECT COUNT(*) as count FROM direct_messages WHERE account_id = ?').get(account.id)?.count || 0;
const conversationsCount = db.prepare('SELECT COUNT(*) as count FROM conversations WHERE account_id = ?').get(account.id)?.count || 0;

console.log('📈 数据统计:');
console.log(`  🎬 作品 (contents): ${worksCount} 个`);
console.log(`  💬 评论 (comments): ${commentsCount} 条`);
console.log(`  🗣️  讨论 (discussions): ${discussionsCount} 条`);
console.log(`  📩 私信 (direct_messages): ${messagesCount} 条`);
console.log(`  💬 会话 (conversations): ${conversationsCount} 个`);
console.log('');

// 3. 检查最新的私信数据
if (messagesCount > 0) {
  console.log('📩 最新 3 条私信:\n');
  const recentMessages = db.prepare(`
    SELECT platform_message_id, detected_at, platform_sender_id, sender_nickname, sender_avatar, content
    FROM direct_messages
    WHERE account_id = ?
    ORDER BY detected_at DESC
    LIMIT 3
  `).all(account.id);

  recentMessages.forEach((m, i) => {
    console.log(`  ${i + 1}. 消息ID: ${m.platform_message_id}`);
    console.log(`     检测时间: ${new Date(m.detected_at * 1000).toLocaleString('zh-CN')}`);
    console.log(`     发送者ID: ${m.platform_sender_id || '(无)'}`);
    console.log(`     昵称: ${m.sender_nickname || '(无)'}`);
    console.log(`     头像: ${m.sender_avatar ? '有' : '(无)'}`);
    console.log(`     内容: ${(m.content || '').substring(0, 30)}...`);
    console.log('');
  });
}

// 4. 检查作品表结构
console.log('📋 检查 contents 表是否存在:');
try {
  const tableInfo = db.prepare('PRAGMA table_info(contents)').all();
  if (tableInfo.length > 0) {
    console.log('  ✅ contents 表存在');
    console.log(`  字段数: ${tableInfo.length}`);
  } else {
    console.log('  ❌ contents 表不存在');
  }
} catch (error) {
  console.log('  ❌ contents 表不存在:', error.message);
}
console.log('');

// 5. 检查评论表结构
console.log('📋 检查 comments 表是否存在:');
try {
  const tableInfo = db.prepare('PRAGMA table_info(comments)').all();
  if (tableInfo.length > 0) {
    console.log('  ✅ comments 表存在');
    console.log(`  字段数: ${tableInfo.length}`);
  } else {
    console.log('  ❌ comments 表不存在');
  }
} catch (error) {
  console.log('  ❌ comments 表不存在:', error.message);
}
console.log('');

// 6. 检查讨论表结构
console.log('📋 检查 discussions 表是否存在:');
try {
  const tableInfo = db.prepare('PRAGMA table_info(discussions)').all();
  if (tableInfo.length > 0) {
    console.log('  ✅ discussions 表存在');
    console.log(`  字段数: ${tableInfo.length}`);
  } else {
    console.log('  ❌ discussions 表不存在');
  }
} catch (error) {
  console.log('  ❌ discussions 表不存在:', error.message);
}

console.log('\n========================================');
console.log('📝 总结:');
if (worksCount === 0 && commentsCount === 0 && discussionsCount === 0) {
  console.log('  ❌ 作品、评论、讨论数据均未入库');
  console.log('  ✅ 私信数据已入库 (' + messagesCount + ' 条)');
  console.log('');
  console.log('  可能原因:');
  console.log('  1. Worker 只配置了私信爬虫任务');
  console.log('  2. 作品/评论/讨论爬虫未自动触发');
  console.log('  3. 表结构不存在导致入库失败');
} else {
  console.log('  ✅ 所有爬虫数据均已入库');
}
console.log('========================================\n');

db.close();
