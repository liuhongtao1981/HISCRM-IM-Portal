/**
 * 查看最新抓取的数据
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('📊 查看最新抓取数据\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📈 数据统计');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 统计各表数据量
const tables = {
  'contents': '作品',
  'comments': '评论',
  'discussions': '讨论',
  'direct_messages': '私信',
  'conversations': '会话',
};

Object.entries(tables).forEach(([table, name]) => {
  try {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
    console.log(`${name} (${table}): ${count} 条`);
  } catch (e) {
    console.log(`${name} (${table}): ❌ 查询失败`);
  }
});

// 查看作品数据
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎬 作品数据 (最新5条)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

try {
  const contents = db.prepare(`
    SELECT title, url, stats_comment_count, created_at
    FROM contents
    ORDER BY created_at DESC
    LIMIT 5
  `).all();

  if (contents.length === 0) {
    console.log('暂无作品数据\n');
  } else {
    contents.forEach((work, i) => {
      console.log(`${i + 1}. ${work.title || '(无标题)'}`);
      console.log(`   URL: ${work.url || 'N/A'}`);
      console.log(`   评论数: ${work.stats_comment_count || 0}`);
      console.log(`   时间: ${new Date(work.created_at * 1000).toLocaleString('zh-CN')}\n`);
    });
  }
} catch (e) {
  console.log('❌ 查询失败:', e.message, '\n');
}

// 查看评论数据
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('💬 评论数据 (最新10条)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

try {
  const comments = db.prepare(`
    SELECT content, author_name, reply_count, created_at
    FROM comments
    ORDER BY created_at DESC
    LIMIT 10
  `).all();

  if (comments.length === 0) {
    console.log('暂无评论数据\n');
  } else {
    comments.forEach((comment, i) => {
      console.log(`${i + 1}. ${comment.author_name || '匿名'}: ${comment.content}`);
      console.log(`   回复数: ${comment.reply_count || 0}`);
      console.log(`   时间: ${new Date(comment.created_at * 1000).toLocaleString('zh-CN')}\n`);
    });
  }
} catch (e) {
  console.log('❌ 查询失败:', e.message, '\n');
}

// 查看讨论数据
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('💭 讨论数据 (最新10条)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

try {
  const discussions = db.prepare(`
    SELECT content, author_name, parent_comment_id, created_at
    FROM discussions
    ORDER BY created_at DESC
    LIMIT 10
  `).all();

  if (discussions.length === 0) {
    console.log('暂无讨论数据\n');
  } else {
    discussions.forEach((disc, i) => {
      console.log(`${i + 1}. ${disc.author_name || '匿名'}: ${disc.content}`);
      console.log(`   父评论ID: ${disc.parent_comment_id || 'N/A'}`);
      console.log(`   时间: ${new Date(disc.created_at * 1000).toLocaleString('zh-CN')}\n`);
    });
  }
} catch (e) {
  console.log('❌ 查询失败:', e.message, '\n');
}

// 查看会话数据
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('💬 会话数据 (最新10条)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

try {
  const conversations = db.prepare(`
    SELECT platform_user_name, last_message_content, unread_count, updated_at
    FROM conversations
    ORDER BY updated_at DESC
    LIMIT 10
  `).all();

  if (conversations.length === 0) {
    console.log('暂无会话数据\n');
  } else {
    conversations.forEach((conv, i) => {
      console.log(`${i + 1}. ${conv.platform_user_name || '(未知用户)'}`);
      console.log(`   最后消息: ${conv.last_message_content || 'N/A'}`);
      console.log(`   未读数: ${conv.unread_count || 0}`);
      console.log(`   更新时间: ${new Date(conv.updated_at * 1000).toLocaleString('zh-CN')}\n`);
    });
  }
} catch (e) {
  console.log('❌ 查询失败:', e.message, '\n');
}

// 查看私信数据
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✉️  私信数据 (最新20条)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

try {
  const messages = db.prepare(`
    SELECT content, message_type, direction, conversation_id, created_at, sender_name
    FROM direct_messages
    ORDER BY created_at DESC
    LIMIT 20
  `).all();

  if (messages.length === 0) {
    console.log('暂无私信数据\n');
  } else {
    messages.forEach((msg, i) => {
      const directionText = msg.direction === 'sent' ? '➡️ 我发送' : '⬅️ 收到';
      console.log(`${i + 1}. ${directionText} [${msg.message_type || 'unknown'}] - ${msg.sender_name || '未知'}`);
      console.log(`   内容: ${msg.content || '(无文本内容)'}`);
      console.log(`   会话ID: ${msg.conversation_id || 'N/A'}`);
      console.log(`   时间: ${new Date(msg.created_at * 1000).toLocaleString('zh-CN')}\n`);
    });
  }
} catch (e) {
  console.log('❌ 查询失败:', e.message, '\n');
}

db.close();
console.log('✅ 查询完成');
