const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('=== 数据库数据统计 ===\n');

// 检查私信数据
const dmCount = db.prepare('SELECT COUNT(*) as count FROM direct_messages').get();
console.log('📩 私信总数:', dmCount.count);

// 检查会话数据
const convCount = db.prepare('SELECT COUNT(*) as count FROM conversations').get();
console.log('💬 会话总数:', convCount.count);

// 检查评论数据
const commentCount = db.prepare('SELECT COUNT(*) as count FROM comments').get();
console.log('💭 评论总数:', commentCount.count);

// 按账户统计私信数量
console.log('\n=== 按账户统计私信 ===\n');
const dmByAccount = db.prepare(`
  SELECT
    account_id,
    COUNT(*) as message_count,
    MAX(created_at) as last_crawl
  FROM direct_messages
  GROUP BY account_id
`).all();

dmByAccount.forEach((row, i) => {
  console.log(`[${i+1}] 账户: ${row.account_id}`);
  console.log(`    消息数: ${row.message_count}`);
  console.log(`    最后抓取: ${row.last_crawl}`);
});

// 查看最近的私信数据（前10条）
console.log('\n=== 最近抓取的私信（前10条）===\n');
const recentDMs = db.prepare(`
  SELECT
    platform_sender_name,
    platform_receiver_name,
    message_type,
    content,
    direction,
    detected_at,
    created_at
  FROM direct_messages
  ORDER BY created_at DESC
  LIMIT 10
`).all();

recentDMs.forEach((dm, i) => {
  const userName = dm.direction === 'incoming' ? dm.platform_sender_name : dm.platform_receiver_name;
  console.log(`[${i+1}] ${userName || '(未知用户)'} [${dm.direction}]`);
  console.log(`    类型: ${dm.message_type}`);
  const contentPreview = dm.content ? dm.content.substring(0, 80) : '(无内容)';
  console.log(`    内容: ${contentPreview}${dm.content && dm.content.length > 80 ? '...' : ''}`);
  console.log(`    检测时间: ${new Date(dm.detected_at * 1000).toLocaleString('zh-CN')}`);
  console.log(`    抓取时间: ${new Date(dm.created_at * 1000).toLocaleString('zh-CN')}`);
  console.log('');
});

// 查看会话列表
console.log('=== 会话列表（前15个）===\n');
const conversations = db.prepare(`
  SELECT
    platform_user_name,
    last_message_content,
    last_message_time,
    last_message_type,
    unread_count,
    created_at
  FROM conversations
  ORDER BY last_message_time DESC
  LIMIT 15
`).all();

conversations.forEach((conv, i) => {
  const lastMsg = conv.last_message_content ? conv.last_message_content.substring(0, 50) : '(无)';
  console.log(`[${i+1}] ${conv.platform_user_name || '(未知用户)'}`);
  console.log(`    最后消息: ${lastMsg}${conv.last_message_content && conv.last_message_content.length > 50 ? '...' : ''}`);
  console.log(`    消息类型: ${conv.last_message_type}`);
  console.log(`    消息时间: ${new Date(conv.last_message_time * 1000).toLocaleString('zh-CN')}`);
  console.log(`    未读数: ${conv.unread_count || 0}`);
  console.log('');
});

// 检查消息类型分布
console.log('=== 消息类型分布 ===\n');
const messageTypes = db.prepare(`
  SELECT
    message_type,
    COUNT(*) as count
  FROM direct_messages
  GROUP BY message_type
  ORDER BY count DESC
`).all();

messageTypes.forEach((type) => {
  console.log(`${type.message_type}: ${type.count} 条`);
});

// 检查是否有消息ID
console.log('\n=== 消息ID检查 ===\n');
const withId = db.prepare('SELECT COUNT(*) as count FROM direct_messages WHERE platform_message_id IS NOT NULL').get();
const withoutId = db.prepare('SELECT COUNT(*) as count FROM direct_messages WHERE platform_message_id IS NULL').get();
console.log(`有ID的消息: ${withId.count}`);
console.log(`无ID的消息: ${withoutId.count}`);

// 查看一条完整的私信数据
console.log('\n=== 完整私信数据示例 ===\n');
const sampleDM = db.prepare(`
  SELECT * FROM direct_messages
  ORDER BY created_at DESC
  LIMIT 1
`).get();

if (sampleDM) {
  console.log(JSON.stringify(sampleDM, null, 2));
}

db.close();
console.log('\n✅ 数据检查完成');
