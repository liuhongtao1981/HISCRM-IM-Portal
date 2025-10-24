/**
 * 检查评论的 reply_count 字段
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');

console.log('📊 检查评论回复数据\n');

const db = new Database(DB_PATH);

// 检查评论表
console.log('═'.repeat(70));
console.log('📋 Comments 表数据:');
console.log('═'.repeat(70));

const comments = db.prepare(`
  SELECT
    platform_comment_id,
    author_name,
    content,
    reply_count,
    like_count,
    created_at
  FROM comments
  ORDER BY created_at DESC
`).all();

comments.forEach(c => {
  console.log(`评论ID: ${c.platform_comment_id}`);
  console.log(`  作者: ${c.author_name}`);
  console.log(`  内容: ${c.content ? c.content.substring(0, 50) : 'N/A'}${c.content && c.content.length > 50 ? '...' : ''}`);
  console.log(`  回复数: ${c.reply_count} 条`);
  console.log(`  点赞数: ${c.like_count}`);
  console.log(`  时间: ${new Date(c.created_at * 1000).toLocaleString('zh-CN')}`);
  console.log('');
});

// 检查讨论表
console.log('═'.repeat(70));
console.log('📋 Discussions 表数据:');
console.log('═'.repeat(70));

const discussionCount = db.prepare('SELECT COUNT(*) as count FROM discussions').get();
console.log(`讨论总数: ${discussionCount.count}\n`);

if (discussionCount.count > 0) {
  const discussions = db.prepare(`
    SELECT
      platform_discussion_id,
      parent_comment_id,
      author_name,
      content,
      created_at
    FROM discussions
    ORDER BY created_at DESC
  `).all();

  discussions.forEach(d => {
    console.log(`讨论ID: ${d.platform_discussion_id}`);
    console.log(`  父评论ID: ${d.parent_comment_id}`);
    console.log(`  作者: ${d.author_name}`);
    console.log(`  内容: ${d.content ? d.content.substring(0, 50) : 'N/A'}${d.content && d.content.length > 50 ? '...' : ''}`);
    console.log('');
  });
}

// 统计有回复的评论
console.log('═'.repeat(70));
console.log('📊 统计结果:');
console.log('═'.repeat(70));

const stats = db.prepare(`
  SELECT
    COUNT(*) as total_comments,
    SUM(CASE WHEN reply_count > 0 THEN 1 ELSE 0 END) as comments_with_replies,
    SUM(reply_count) as total_reply_count
  FROM comments
`).get();

console.log(`总评论数: ${stats.total_comments}`);
console.log(`有回复的评论: ${stats.comments_with_replies}`);
console.log(`回复总数（从 reply_count 字段）: ${stats.total_reply_count}`);
console.log(`实际讨论记录数: ${discussionCount.count}`);

if (stats.total_reply_count > discussionCount.count) {
  console.log(`\n⚠️  发现问题: reply_count 显示有 ${stats.total_reply_count} 条回复，但 discussions 表只有 ${discussionCount.count} 条记录`);
  console.log(`   这说明爬虫没有成功抓取讨论数据！`);
}

db.close();
