/**
 * 删除旧的冗余数据库表
 * Phase 3: 数据库清理
 *
 * 删除的表（7个）：
 * - comments
 * - direct_messages
 * - conversations
 * - contents
 * - discussions
 * - notifications
 * - notification_rules
 *
 * 这些表已被 cache_* 表替代
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../../data/master.db');

console.log('\n🗑️  Starting old tables cleanup...');
console.log('='.repeat(80));
console.log(`Database: ${dbPath}\n`);

try {
  // 1. 检查数据库是否存在
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }

  // 2. 连接数据库
  const db = new Database(dbPath);
  console.log('✓ Database connected');

  // 3. 查询现有表
  const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log(`\n📊 Current tables (${allTables.length}):`);
  allTables.forEach(t => console.log(`  • ${t.name}`));

  // 4. 要删除的表列表
  const tablesToDrop = [
    'comments',
    'direct_messages',
    'conversations',
    'contents',
    'discussions',
    'notifications',
    'notification_rules'
  ];

  console.log(`\n🗑️  Tables to drop (${tablesToDrop.length}):`);
  tablesToDrop.forEach(t => console.log(`  • ${t}`));

  // 5. 逐个删除表
  let droppedCount = 0;
  let notFoundCount = 0;

  console.log('\n🔧 Dropping tables...\n');

  for (const tableName of tablesToDrop) {
    try {
      // 检查表是否存在
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName);

      if (exists) {
        // 删除表
        db.prepare(`DROP TABLE ${tableName}`).run();
        console.log(`  ✓ Dropped: ${tableName}`);
        droppedCount++;
      } else {
        console.log(`  ⊘ Not found: ${tableName}`);
        notFoundCount++;
      }
    } catch (error) {
      console.error(`  ✗ Failed to drop ${tableName}:`, error.message);
    }
  }

  // 6. 验证删除结果
  console.log('\n✅ Cleanup completed!\n');
  console.log(`📊 Summary:`);
  console.log(`  • Dropped: ${droppedCount} tables`);
  console.log(`  • Not found: ${notFoundCount} tables`);
  console.log(`  • Total: ${tablesToDrop.length} tables processed`);

  // 7. 列出剩余表
  const remainingTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log(`\n📊 Remaining tables (${remainingTables.length}):`);
  remainingTables.forEach(t => console.log(`  • ${t.name}`));

  // 8. 优化数据库
  console.log('\n🔧 Running VACUUM to reclaim space...');
  const startTime = Date.now();
  db.prepare('VACUUM').run();
  const duration = Date.now() - startTime;
  console.log(`✓ VACUUM completed in ${duration}ms`);

  db.close();
  console.log('\n✅ Database cleanup completed successfully!\n');
  console.log('='.repeat(80));
} catch (error) {
  console.error('\n❌ Cleanup failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
