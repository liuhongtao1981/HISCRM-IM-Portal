/**
 * 清空测试数据脚本
 *
 * 清空以下表的数据用于验证数据抓取：
 * - works (作品表)
 * - comments (评论表)
 * - discussions (讨论/二级回复表)
 * - replies (回复任务表)
 * - direct_messages (私信表)
 * - conversations (会话表)
 *
 * 注意：不清空 accounts、workers 等系统配置表
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Master 数据库路径
const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');

console.log('='.repeat(60));
console.log('清空测试数据脚本');
console.log('='.repeat(60));

// 检查数据库文件是否存在
if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ 数据库文件不存在: ${DB_PATH}`);
  process.exit(1);
}

console.log(`📂 数据库路径: ${DB_PATH}`);

// 连接数据库
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 定义要清空的表（按照外键依赖顺序）
const TABLES_TO_CLEAR = [
  'discussions',        // 依赖 comments
  'comments',          // 依赖 works
  'replies',           // 回复任务
  'direct_messages',   // 私信
  'conversations',     // 会话
  'works'              // 作品（最后清空，因为其他表可能依赖它）
];

// 定义不清空的系统表
const SYSTEM_TABLES = [
  'accounts',
  'workers',
  'worker_configs',
  'worker_runtime',
  'login_sessions',
  'client_sessions',
  'proxies',
  'notifications',
  'notification_rules',
  'worker_logs'
];

console.log('\n📋 计划清空的表:');
TABLES_TO_CLEAR.forEach((table, idx) => {
  console.log(`  ${idx + 1}. ${table}`);
});

console.log('\n🔒 保留的系统表:');
SYSTEM_TABLES.forEach((table, idx) => {
  console.log(`  ${idx + 1}. ${table}`);
});

console.log('\n' + '='.repeat(60));
console.log('开始清空数据...');
console.log('='.repeat(60));

// 统计信息
const stats = {
  before: {},
  after: {},
  cleared: {}
};

try {
  // 开始事务
  db.exec('BEGIN TRANSACTION');

  // 1. 统计清空前的数据
  console.log('\n📊 清空前数据统计:');
  for (const table of TABLES_TO_CLEAR) {
    const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
    stats.before[table] = result.count;
    console.log(`  ${table.padEnd(20)} ${result.count.toString().padStart(8)} 条`);
  }

  // 2. 清空表数据
  console.log('\n🗑️  清空表数据:');
  for (const table of TABLES_TO_CLEAR) {
    const beforeCount = stats.before[table];

    if (beforeCount > 0) {
      db.prepare(`DELETE FROM ${table}`).run();
      console.log(`  ✅ ${table.padEnd(20)} 已清空 ${beforeCount} 条记录`);
      stats.cleared[table] = beforeCount;
    } else {
      console.log(`  ⏭️  ${table.padEnd(20)} 无数据，跳过`);
      stats.cleared[table] = 0;
    }
  }

  // 3. 统计清空后的数据（验证）
  console.log('\n📊 清空后数据统计:');
  for (const table of TABLES_TO_CLEAR) {
    const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
    stats.after[table] = result.count;

    if (result.count === 0) {
      console.log(`  ✅ ${table.padEnd(20)} ${result.count.toString().padStart(8)} 条`);
    } else {
      console.log(`  ❌ ${table.padEnd(20)} ${result.count.toString().padStart(8)} 条 (清空失败!)`);
    }
  }

  // 4. 验证系统表未受影响
  console.log('\n🔍 验证系统表完整性:');
  for (const table of SYSTEM_TABLES) {
    try {
      const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      console.log(`  ✅ ${table.padEnd(20)} ${result.count.toString().padStart(8)} 条 (保留)`);
    } catch (error) {
      console.log(`  ⚠️  ${table.padEnd(20)} 表不存在或查询失败`);
    }
  }

  // 提交事务
  db.exec('COMMIT');
  console.log('\n✅ 事务已提交');

} catch (error) {
  // 回滚事务
  db.exec('ROLLBACK');
  console.error('\n❌ 清空失败，已回滚事务:', error.message);
  process.exit(1);
} finally {
  db.close();
}

// 5. 输出总结
console.log('\n' + '='.repeat(60));
console.log('清空完成总结');
console.log('='.repeat(60));

const totalCleared = Object.values(stats.cleared).reduce((sum, count) => sum + count, 0);
console.log(`\n📊 总计清空记录: ${totalCleared} 条`);

console.log('\n📋 清空详情:');
for (const table of TABLES_TO_CLEAR) {
  if (stats.cleared[table] > 0) {
    console.log(`  ${table.padEnd(20)} -${stats.cleared[table]} 条`);
  }
}

// 6. 验证结果
const allCleared = TABLES_TO_CLEAR.every(table => stats.after[table] === 0);

if (allCleared) {
  console.log('\n✅ 所有测试数据已清空，可以开始验证数据抓取');
  console.log('\n📝 下一步操作:');
  console.log('  1. cd packages/master && npm start');
  console.log('  2. 观察 Master 日志输出');
  console.log('  3. 检查数据是否正确抓取并入库');
  console.log('  4. 验证字段映射是否正确');
  process.exit(0);
} else {
  console.error('\n❌ 部分表清空失败，请检查错误');
  process.exit(1);
}
