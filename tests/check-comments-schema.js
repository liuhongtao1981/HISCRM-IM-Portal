/**
 * 检查评论表的结构
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'packages/master/data/master.db');
const db = new Database(dbPath);

try {
  // 获取表结构
  const schema = db.prepare("PRAGMA table_info(comments)").all();
  console.log('📋 Comments 表结构：');
  schema.forEach(col => {
    console.log(`  - ${col.name}: ${col.type}`);
  });

  console.log('\n');

  // 获取一条评论数据
  const comments = db.prepare(`SELECT * FROM comments LIMIT 1`).all();

  if (comments.length > 0) {
    console.log('📝 示例评论数据：');
    const comment = comments[0];
    Object.keys(comment).forEach(key => {
      console.log(`  ${key}: ${comment[key]}`);
    });
  } else {
    console.log('❌ 数据库中没有评论数据');
  }
} catch (error) {
  console.error('错误:', error.message);
} finally {
  db.close();
}
