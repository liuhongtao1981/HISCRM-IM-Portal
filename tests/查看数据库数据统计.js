/**
 * 查看数据库数据统计脚本
 *
 * 功能: 统计数据库中各表的记录数
 */

const Database = require('better-sqlite3');
const path = require('path');

// 数据库路径
const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');

console.log('📊 数据库数据统计\n');
console.log(`数据库路径: ${DB_PATH}\n`);

// 连接数据库
let db;
try {
  db = new Database(DB_PATH);
  console.log('✅ 数据库连接成功\n');
} catch (err) {
  console.error('❌ 连接数据库失败:', err.message);
  process.exit(1);
}

// 要统计的表
const tables = [
  { name: 'contents', desc: '作品' },
  { name: 'comments', desc: '评论' },
  { name: 'discussions', desc: '讨论（二级/三级回复）' },
  { name: 'direct_messages', desc: '私信' },
  { name: 'conversations', desc: '会话' },
];

console.log('═'.repeat(80));
console.log('📋 数据统计\n');

let totalRecords = 0;

tables.forEach(table => {
  try {
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
    const count = row.count;
    totalRecords += count;

    const emoji = count > 0 ? '✅' : '⚪';
    console.log(`${emoji} ${table.desc.padEnd(30)} ${count.toString().padStart(6)} 条`);

    // 如果有数据,显示最新的几条记录
    if (count > 0) {
      // conversations 表使用 created_at, 其他表使用 detected_at
      const timeField = table.name === 'conversations' ? 'created_at' : 'detected_at';
      const recentRows = db.prepare(`
        SELECT * FROM ${table.name}
        ORDER BY ${timeField} DESC
        LIMIT 3
      `).all();

      console.log(`   最近 ${Math.min(count, 3)} 条记录:`);
      recentRows.forEach((row, index) => {
        const timeField = table.name === 'conversations' ? 'created_at' : 'detected_at';
        const timestamp = row[timeField];
        const timeStr = timestamp ? new Date(timestamp * 1000).toLocaleString() : '未知时间';

        // 根据不同表类型显示不同字段
        if (table.name === 'contents') {
          console.log(`   ${index + 1}. ${row.title || row.platform_content_id} (${timeStr})`);
        } else if (table.name === 'comments') {
          console.log(`   ${index + 1}. ${(row.content || '').substring(0, 50)} (${timeStr})`);
        } else if (table.name === 'discussions') {
          console.log(`   ${index + 1}. ${(row.content || '').substring(0, 50)} (${timeStr})`);
        } else if (table.name === 'direct_messages') {
          console.log(`   ${index + 1}. ${(row.content || '').substring(0, 50)} (${timeStr})`);
        } else if (table.name === 'conversations') {
          console.log(`   ${index + 1}. ${row.platform_user_name || row.platform_user_id} (${timeStr})`);
        }
      });
      console.log('');
    }
  } catch (error) {
    console.error(`❌ 统计 ${table.name} 失败:`, error.message);
  }
});

console.log('═'.repeat(80));
console.log(`\n📊 总计: ${totalRecords} 条记录\n`);

// 关闭数据库连接
try {
  db.close();
  console.log('✅ 数据库连接已关闭');
} catch (err) {
  console.error('❌ 关闭数据库失败:', err.message);
}
