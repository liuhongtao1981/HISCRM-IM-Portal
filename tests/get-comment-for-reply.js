/**
 * 获取评论数据用于测试回复功能
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'packages/master/data/master.db');
const db = new Database(dbPath);

try {
  // 获取最新的评论
  const comments = db.prepare(`
    SELECT
      platform_comment_id,
      video_id,
      commenter_name,
      comment_text,
      account_id
    FROM comments
    WHERE video_id IS NOT NULL
    LIMIT 1
  `).all();

  if (comments.length > 0) {
    const comment = comments[0];
    console.log('📝 找到评论数据�?);
    console.log(JSON.stringify(comment, null, 2));
  } else {
    console.log('�?数据库中没有评论数据');
  }
} catch (error) {
  console.error('错误:', error.message);
} finally {
  db.close();
}
