/**
 * 清空测试数据脚本
 *
 * 功能：清空以下表的数据
 * - direct_messages (私信)
 * - conversations (会话)
 * - works (作品)
 * - comments (评论)
 * - discussions (讨论)
 */

const Database = require('better-sqlite3');
const path = require('path');

// 数据库路径
const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');

console.log('🗑️  开始清空测试数据...\n');
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

// 要清空的表
const tables = [
  { name: 'discussions', desc: '讨论（二级/三级回复）' },
  { name: 'comments', desc: '评论' },
  { name: 'direct_messages', desc: '私信' },
  { name: 'conversations', desc: '会话' },
  { name: 'works', desc: '作品' },
];

// 清空函数
function clearTable(tableName, description) {
  try {
    // 先查询当前记录数
    const beforeRow = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
    const beforeCount = beforeRow.count;

    console.log(`📊 ${description} (${tableName}): ${beforeCount} 条记录`);

    if (beforeCount === 0) {
      console.log(`   ⏭️  表已为空，跳过\n`);
      return { tableName, beforeCount, afterCount: 0 };
    }

    // 清空表
    const deleteStmt = db.prepare(`DELETE FROM ${tableName}`);
    const info = deleteStmt.run();

    console.log(`   🗑️  删除了 ${info.changes} 条记录`);

    // 验证是否清空成功
    const afterRow = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
    const afterCount = afterRow.count;

    if (afterCount === 0) {
      console.log(`   ✅ 成功清空 ${beforeCount} 条记录\n`);
    } else {
      console.log(`   ⚠️  清空不完全，剩余 ${afterCount} 条记录\n`);
    }

    return { tableName, beforeCount, afterCount };
  } catch (error) {
    console.error(`   ❌ 清空失败:`, error.message);
    throw error;
  }
}

// 执行清空操作
function main() {
  const results = [];

  for (const table of tables) {
    try {
      const result = clearTable(table.name, table.desc);
      results.push(result);
    } catch (error) {
      console.error(`\n❌ 处理 ${table.name} 时发生错误:`, error.message);
    }
  }

  // 打印总结
  console.log('═'.repeat(60));
  console.log('📋 清空操作总结\n');

  let totalBefore = 0;
  let totalAfter = 0;

  results.forEach(r => {
    totalBefore += r.beforeCount;
    totalAfter += r.afterCount;
    const status = r.afterCount === 0 ? '✅' : '⚠️';
    console.log(`${status} ${r.tableName.padEnd(20)} ${r.beforeCount} → ${r.afterCount}`);
  });

  console.log('\n' + '═'.repeat(60));
  console.log(`总计: ${totalBefore} → ${totalAfter} 条记录`);

  if (totalAfter === 0) {
    console.log('\n🎉 所有数据已成功清空！');
  } else {
    console.log(`\n⚠️  还有 ${totalAfter} 条记录未清空`);
  }

  // 关闭数据库连接
  try {
    db.close();
    console.log('\n✅ 数据库连接已关闭');
  } catch (err) {
    console.error('\n❌ 关闭数据库失败:', err.message);
  }
}

// 执行主函数
try {
  main();
} catch (error) {
  console.error('\n❌ 脚本执行失败:', error);
  if (db) {
    db.close();
  }
  process.exit(1);
}
