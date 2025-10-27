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

// 检查各表的数据量
const tables = [
  'works',
  'comments',
  'discussions',
  'conversations',
  'direct_messages',
  'replies'
];

console.log('\n📊 数据表统计:');
console.log('-'.repeat(70));
const stats = {};
for (const table of tables) {
  const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
  stats[table] = result.count;
  const icon = result.count > 0 ? '✅' : '⚠️ ';
  console.log(`${icon} ${table.padEnd(20)} ${result.count.toString().padStart(5)} 条`);
}

// 如果有作品数据,检查字段
if (stats.works > 0) {
  console.log('\n📋 works 表数据示例 (验证字段映射):');
  console.log('-'.repeat(70));
  const works = db.prepare(`
    SELECT
      id,
      platform,
      platform_work_id,
      platform_user_id,
      title,
      description,
      view_count,
      like_count,
      total_comment_count,
      share_count,
      datetime(publish_time, 'unixepoch') as publish_time_readable,
      publish_time,
      datetime(created_at, 'unixepoch') as created_at_readable
    FROM works
    ORDER BY created_at DESC
    LIMIT 3
  `).all();

  works.forEach((work, idx) => {
    console.log(`\n作品 ${idx + 1}:`);
    console.log(`  ID: ${work.id}`);
    console.log(`  平台: ${work.platform}`);
    console.log(`  平台作品ID: ${work.platform_work_id}`);
    console.log(`  平台用户ID: ${work.platform_user_id}`);
    console.log(`  标题: ${work.title || '(无标题)'}`);
    console.log(`  描述: ${work.description ? work.description.substring(0, 50) + '...' : '(无)'}`);
    console.log(`  播放: ${work.view_count}, 点赞: ${work.like_count}, 评论: ${work.total_comment_count}, 分享: ${work.share_count}`);
    console.log(`  发布时间: ${work.publish_time_readable} (时间戳: ${work.publish_time})`);

    // 验证时间戳格式
    if (work.publish_time) {
      const year = new Date(work.publish_time * 1000).getFullYear();
      if (year >= 2020 && year <= 2030) {
        console.log(`    ✅ 时间戳格式正确 (秒级)`);
      } else {
        console.log(`    ❌ 时间戳格式可能错误 (年份: ${year})`);
      }
    }

    console.log(`  创建时间: ${work.created_at_readable}`);
  });
}

// 如果有评论数据,检查字段
if (stats.comments > 0) {
  console.log('\n💬 comments 表数据示例 (验证字段映射):');
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
      w.id as work_id,
      w.title as work_title,
      w.platform_work_id,
      w.platform,
      datetime(c.created_at, 'unixepoch') as created_at_readable
    FROM comments c
    LEFT JOIN works w ON c.post_id = w.platform_work_id
    ORDER BY c.created_at DESC
    LIMIT 3
  `).all();

  comments.forEach((comment, idx) => {
    console.log(`\n评论 ${idx + 1}:`);
    console.log(`  ID: ${comment.id}`);
    console.log(`  账户ID: ${comment.account_id}`);
    console.log(`  平台: ${comment.platform || '(从关联作品获取)'}`);
    console.log(`  平台评论ID: ${comment.platform_comment_id || '(null)'}`);
    console.log(`  内容: ${comment.content.substring(0, 50)}...`);
    console.log(`  作者: ${comment.author_name || '(null)'}`);
    console.log(`  post_id字段: ${comment.post_id || '(null)'}`);
    console.log(`  post_title字段: ${comment.post_title || '(null)'}`);

    // 验证 post_title
    if (comment.post_title === '未知作品') {
      console.log(`    ❌ 警告: post_title 为 "未知作品" (字段映射问题)`);
    } else if (comment.post_title && comment.post_title !== '未知作品') {
      console.log(`    ✅ post_title 正确`);
    }

    console.log(`  关联作品ID: ${comment.work_id || '(未关联)'}`);
    console.log(`  关联作品标题: ${comment.work_title || '(未关联)'}`);
    console.log(`  关联作品platform_work_id: ${comment.platform_work_id || '(未关联)'}`);

    // 验证关联
    if (comment.post_id && comment.work_id) {
      console.log(`    ✅ 评论已正确关联到作品`);
    } else if (comment.post_id && !comment.work_id) {
      console.log(`    ⚠️  有 post_id 但未关联到作品 (works 表可能缺少该作品)`);
    }

    console.log(`  创建时间: ${comment.created_at_readable}`);
  });
}

// 如果有会话数据,检查字段
if (stats.conversations > 0) {
  console.log('\n💬 conversations 表数据示例 (验证字段映射):');
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

    // 检查是否是占位符 ID
    if (conv.platform_user_id.startsWith('user_')) {
      console.log(`    ❌ 警告: 使用占位符 ID (应该是真实平台 ID)`);
    } else if (/^\d+$/.test(conv.platform_user_id)) {
      console.log(`    ✅ 正确: 使用真实平台 ID (数字)`);
    } else {
      console.log(`    ⚠️  未知格式的 ID`);
    }

    console.log(`  平台用户名: ${conv.platform_user_name}`);
    console.log(`  平台用户头像: ${conv.platform_user_avatar || '(null)'}`);

    // 检查头像是否有效
    if (conv.platform_user_avatar && conv.platform_user_avatar.startsWith('http')) {
      console.log(`    ✅ 正确: 有效的头像 URL`);
    } else if (!conv.platform_user_avatar) {
      console.log(`    ❌ 警告: 头像为 null (应该有 URL)`);
    }

    console.log(`  未读数: ${conv.unread_count}`);
    console.log(`  最后消息: ${conv.last_message_content ? conv.last_message_content.substring(0, 30) : '(无)'}...`);
    console.log(`  最后消息时间: ${conv.last_message_time_readable}`);
    console.log(`  创建时间: ${conv.created_at_readable}`);
  });
}

// 如果有私信数据,检查字段
if (stats.direct_messages > 0) {
  console.log('\n📨 direct_messages 表数据示例:');
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
    console.log(`  发送者 (sender_name): ${msg.sender_name || '(null)'}`);
    console.log(`  发送者 (platform_sender_name): ${msg.platform_sender_name || '(null)'}`);
    console.log(`  内容: ${msg.content ? msg.content.substring(0, 50) : '(无)'}...`);
    console.log(`  类型: ${msg.message_type}`);
    console.log(`  方向: ${msg.direction}`);
    console.log(`  检测时间: ${msg.detected_at_readable}`);
  });
}

console.log('\n' + '='.repeat(70));
console.log('验证总结');
console.log('='.repeat(70));

const hasData = Object.values(stats).some(count => count > 0);
if (hasData) {
  console.log('✅ 已检测到抓取的数据');
  console.log('\n验证项:');
  if (stats.works > 0) {
    console.log('  ✅ works 表有数据 - 请检查 publish_time 时间戳格式');
  }
  if (stats.comments > 0) {
    console.log('  ✅ comments 表有数据 - 请检查 post_title 和 work_id 关联');
  }
  if (stats.conversations > 0) {
    console.log('  ✅ conversations 表有数据 - 请检查 platform_user_id 是否为真实 ID');
  }
  if (stats.direct_messages > 0) {
    console.log('  ✅ direct_messages 表有数据');
  }
} else {
  console.log('⚠️  所有表都没有数据');
  console.log('\n可能的原因:');
  console.log('  1. Worker 尚未开始抓取 (需要等待更长时间)');
  console.log('  2. 账户未登录或监控未启动');
  console.log('  3. 抓取过程中出现错误');
  console.log('\n建议:');
  console.log('  1. 检查 Master 日志中的 Worker 注册信息');
  console.log('  2. 检查 Worker 日志中的抓取执行情况');
  console.log('  3. 手动触发一次抓取任务');
}

db.close();
