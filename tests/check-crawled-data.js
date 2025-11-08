/**
 * 检查抓取的数据
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(DB_PATH);

console.log('='.repeat(70));
console.log('数据抓取验证报告');
console.log('='.repeat(70));

// 检查各表的数据�?
const tables = [
  'contents',
  'comments',
  'discussions',
  'conversations',
  'direct_messages',
  'replies'
];

console.log('\n📊 数据表统�?');
console.log('-'.repeat(70));
const stats = {};
for (const table of tables) {
  const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
  stats[table] = result.count;
  const icon = result.count > 0 ? '�? : '⚠️ ';
  console.log(`${icon} ${table.padEnd(20)} ${result.count.toString().padStart(5)} 条`);
}

// 如果有作品数�?检查字�?
if (stats.contents > 0) {
  console.log('\n📋 contents 表数据示�?(验证字段映射):');
  console.log('-'.repeat(70));
  const contents = db.prepare(`
    SELECT
      id,
      platform,
      platform_content_id,
      platform_user_id,
      title,
      description,
      stats_view_count,
      stats_like_count,
      stats_comment_count,
      stats_share_count,
      datetime(publish_time, 'unixepoch') as publish_time_readable,
      publish_time,
      datetime(created_at, 'unixepoch') as created_at_readable
    FROM contents
    ORDER BY created_at DESC
    LIMIT 3
  `).all();

  contents.forEach((work, idx) => {
    console.log(`\n作品 ${idx + 1}:`);
    console.log(`  ID: ${work.id}`);
    console.log(`  平台: ${work.platform}`);
    console.log(`  平台作品ID: ${work.platform_content_id}`);
    console.log(`  平台用户ID: ${work.platform_user_id}`);
    console.log(`  标题: ${work.title || '(无标�?'}`);
    console.log(`  描述: ${work.description ? work.description.substring(0, 50) + '...' : '(�?'}`);
    console.log(`  播放: ${work.stats_view_count}, 点赞: ${work.stats_like_count}, 评论: ${work.stats_comment_count}, 分享: ${work.stats_share_count}`);
    console.log(`  发布时间: ${work.publish_time_readable} (时间�? ${work.publish_time})`);

    // 验证时间戳格�?
    if (work.publish_time) {
      const year = new Date(work.publish_time * 1000).getFullYear();
      if (year >= 2020 && year <= 2030) {
        console.log(`    �?时间戳格式正�?(秒级)`);
      } else {
        console.log(`    �?时间戳格式可能错�?(年份: ${year})`);
      }
    }

    console.log(`  创建时间: ${work.created_at_readable}`);
  });
}

// 如果有评论数�?检查字�?
if (stats.comments > 0) {
  console.log('\n💬 comments 表数据示�?(验证字段映射):');
  console.log('-'.repeat(70));
  const comments = db.prepare(`
    SELECT
      c.id,
      c.account_id,
      c.platform_comment_id,
      c.content,
      c.author_name,
      c.post_title,
      c.post_id,
      w.id as content_id,
      w.title as work_title,
      w.platform_content_id,
      w.platform,
      datetime(c.created_at, 'unixepoch') as created_at_readable
    FROM comments c
    LEFT JOIN contents w ON c.post_id = w.platform_content_id
    ORDER BY c.created_at DESC
    LIMIT 3
  `).all();

  comments.forEach((comment, idx) => {
    console.log(`\n评论 ${idx + 1}:`);
    console.log(`  ID: ${comment.id}`);
    console.log(`  账户ID: ${comment.account_id}`);
    console.log(`  平台: ${comment.platform || '(从关联作品获�?'}`);
    console.log(`  平台评论ID: ${comment.platform_comment_id || '(null)'}`);
    console.log(`  内容: ${comment.content.substring(0, 50)}...`);
    console.log(`  作�? ${comment.author_name || '(null)'}`);
    console.log(`  post_id字段: ${comment.post_id || '(null)'}`);
    console.log(`  post_title字段: ${comment.post_title || '(null)'}`);

    // 验证 post_title
    if (comment.post_title === '未知作品') {
      console.log(`    �?警告: post_title �?"未知作品" (字段映射问题)`);
    } else if (comment.post_title && comment.post_title !== '未知作品') {
      console.log(`    �?post_title 正确`);
    }

    console.log(`  关联作品ID: ${comment.content_id || '(未关�?'}`);
    console.log(`  关联作品标题: ${comment.work_title || '(未关�?'}`);
    console.log(`  关联作品platform_content_id: ${comment.platform_content_id || '(未关�?'}`);

    // 验证关联
    if (comment.post_id && comment.content_id) {
      console.log(`    �?评论已正确关联到作品`);
    } else if (comment.post_id && !comment.content_id) {
      console.log(`    ⚠️  �?post_id 但未关联到作�?(contents 表可能缺少该作品)`);
    }

    console.log(`  创建时间: ${comment.created_at_readable}`);
  });
}

// 如果有会话数�?检查字�?
if (stats.conversations > 0) {
  console.log('\n💬 conversations 表数据示�?(验证字段映射):');
  console.log('-'.repeat(70));
  const conversations = db.prepare(`
    SELECT
      id,
      account_id,
      platform_user_id,
      platform_user_name,
      platform_user_avatar,
      unread_count,
      last_message_content,
      datetime(last_message_time, 'unixepoch') as last_message_time_readable,
      datetime(created_at, 'unixepoch') as created_at_readable
    FROM conversations
    ORDER BY created_at DESC
    LIMIT 5
  `).all();

  conversations.forEach((conv, idx) => {
    console.log(`\n会话 ${idx + 1}:`);
    console.log(`  ID: ${conv.id}`);
    console.log(`  账户ID: ${conv.account_id}`);
    console.log(`  平台用户ID: ${conv.platform_user_id}`);

    // 检查是否是占位�?ID
    if (conv.platform_user_id.startsWith('user_')) {
      console.log(`    �?警告: 使用占位�?ID (应该是真实平�?ID)`);
    } else if (/^\d+$/.test(conv.platform_user_id)) {
      console.log(`    �?正确: 使用真实平台 ID (数字)`);
    } else {
      console.log(`    ⚠️  未知格式�?ID`);
    }

    console.log(`  平台用户�? ${conv.platform_user_name}`);
    console.log(`  平台用户头像: ${conv.platform_user_avatar || '(null)'}`);

    // 检查头像是否有�?
    if (conv.platform_user_avatar && conv.platform_user_avatar.startsWith('http')) {
      console.log(`    �?正确: 有效的头�?URL`);
    } else if (!conv.platform_user_avatar) {
      console.log(`    �?警告: 头像�?null (应该�?URL)`);
    }

    console.log(`  未读�? ${conv.unread_count}`);
    console.log(`  最后消�? ${conv.last_message_content ? conv.last_message_content.substring(0, 30) : '(�?'}...`);
    console.log(`  最后消息时�? ${conv.last_message_time_readable}`);
    console.log(`  创建时间: ${conv.created_at_readable}`);
  });
}

// 如果有私信数�?检查字�?
if (stats.direct_messages > 0) {
  console.log('\n📨 direct_messages 表数据示�?');
  console.log('-'.repeat(70));
  const messages = db.prepare(`
    SELECT
      id,
      conversation_id,
      platform_message_id,
      sender_name,
      platform_sender_name,
      content,
      message_type,
      direction,
      datetime(detected_at, 'unixepoch') as detected_at_readable
    FROM direct_messages
    ORDER BY detected_at DESC
    LIMIT 3
  `).all();

  messages.forEach((msg, idx) => {
    console.log(`\n私信 ${idx + 1}:`);
    console.log(`  ID: ${msg.id}`);
    console.log(`  会话ID: ${msg.conversation_id}`);
    console.log(`  平台消息ID: ${msg.platform_message_id || '(null)'}`);
    console.log(`  发送�?(sender_name): ${msg.sender_name || '(null)'}`);
    console.log(`  发送�?(platform_sender_name): ${msg.platform_sender_name || '(null)'}`);
    console.log(`  内容: ${msg.content ? msg.content.substring(0, 50) : '(�?'}...`);
    console.log(`  类型: ${msg.message_type}`);
    console.log(`  方向: ${msg.direction}`);
    console.log(`  检测时�? ${msg.detected_at_readable}`);
  });
}

console.log('\n' + '='.repeat(70));
console.log('验证总结');
console.log('='.repeat(70));

const hasData = Object.values(stats).some(count => count > 0);
if (hasData) {
  console.log('�?已检测到抓取的数�?);
  console.log('\n验证�?');
  if (stats.contents > 0) {
    console.log('  �?contents 表有数据 - 请检�?publish_time 时间戳格�?);
  }
  if (stats.comments > 0) {
    console.log('  �?comments 表有数据 - 请检�?post_title �?content_id 关联');
  }
  if (stats.conversations > 0) {
    console.log('  �?conversations 表有数据 - 请检�?platform_user_id 是否为真�?ID');
  }
  if (stats.direct_messages > 0) {
    console.log('  �?direct_messages 表有数据');
  }
} else {
  console.log('⚠️  所有表都没有数�?);
  console.log('\n可能的原�?');
  console.log('  1. Worker 尚未开始抓�?(需要等待更长时�?');
  console.log('  2. 账户未登录或监控未启�?);
  console.log('  3. 抓取过程中出现错�?);
  console.log('\n建议:');
  console.log('  1. 检�?Master 日志中的 Worker 注册信息');
  console.log('  2. 检�?Worker 日志中的抓取执行情况');
  console.log('  3. 手动触发一次抓取任�?);
}

db.close();
