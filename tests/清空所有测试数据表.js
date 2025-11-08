/**
 * 清空所有测试数据表
 * 包括: 作品、私信、评论、会话、讨�?
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('🧹 清空所有测试数据表\n');

// 要清空的�?
const tables = [
  'contents',             // 作品
  'direct_messages',   // 私信
  'comments',          // 评论
  'conversations',     // 会话
  'discussions',       // 讨论
];

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 清空前统�?);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

tables.forEach(table => {
  try {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
    console.log(`${table}: ${count} 条记录`);
  } catch (e) {
    console.log(`${table}: �?表不存在或查询失败`);
  }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🗑�? 开始清�?);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 清空所有表
tables.forEach(table => {
  try {
    const result = db.prepare(`DELETE FROM ${table}`).run();
    console.log(`�?${table}: 删除�?${result.changes} 条记录`);
  } catch (e) {
    console.log(`�?${table}: 删除失败 - ${e.message}`);
  }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 清空后统�?);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

tables.forEach(table => {
  try {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
    console.log(`${table}: ${count} 条记录`);
  } catch (e) {
    console.log(`${table}: �?表不存在或查询失败`);
  }
});

db.close();
console.log('\n�?清空完成!');
