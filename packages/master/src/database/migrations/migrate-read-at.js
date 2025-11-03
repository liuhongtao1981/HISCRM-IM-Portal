/**
 * 迁移脚本: 添加 read_at 字段
 * 用途: 为 comments 和 direct_messages 表添加已读时间戳
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../../data/master.db');
const migrationSql = path.join(__dirname, 'add-read-at-field.sql');

console.log('\n🔧 Starting read_at field migration...');
console.log('='.repeat(80));
console.log(`Database: ${dbPath}`);
console.log(`Migration SQL: ${migrationSql}\n`);

try {
  // 检查数据库文件
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }

  // 打开数据库
  const db = new Database(dbPath);

  // 启用外键约束
  db.pragma('foreign_keys = ON');

  console.log('📊 Pre-migration status:\n');

  // 检查 comments 表当前结构
  const commentsColumns = db.prepare('PRAGMA table_info(comments)').all();
  const hasCommentsReadAt = commentsColumns.some(col => col.name === 'read_at');
  console.log(`   comments.read_at exists: ${hasCommentsReadAt ? '✅ Yes' : '❌ No'}`);

  // 检查 direct_messages 表当前结构
  const messagesColumns = db.prepare('PRAGMA table_info(direct_messages)').all();
  const hasMessagesReadAt = messagesColumns.some(col => col.name === 'read_at');
  console.log(`   direct_messages.read_at exists: ${hasMessagesReadAt ? '✅ Yes' : '❌ No'}\n`);

  // 如果字段已存在，跳过迁移
  if (hasCommentsReadAt && hasMessagesReadAt) {
    console.log('✅ Migration already applied, skipping.\n');
    db.close();
    process.exit(0);
  }

  // 开始迁移
  console.log('🚀 Applying migration...\n');

  // Step 1: 添加 read_at 字段到 comments 表
  if (!hasCommentsReadAt) {
    console.log('   [1/6] Adding read_at to comments table...');
    db.exec('ALTER TABLE comments ADD COLUMN read_at INTEGER DEFAULT NULL');
    console.log('   ✅ comments.read_at added\n');
  } else {
    console.log('   [1/6] ⏭  Skipping comments.read_at (already exists)\n');
  }

  // Step 2: 添加 read_at 字段到 direct_messages 表
  if (!hasMessagesReadAt) {
    console.log('   [2/6] Adding read_at to direct_messages table...');
    db.exec('ALTER TABLE direct_messages ADD COLUMN read_at INTEGER DEFAULT NULL');
    console.log('   ✅ direct_messages.read_at added\n');
  } else {
    console.log('   [2/6] ⏭  Skipping direct_messages.read_at (already exists)\n');
  }

  // Step 3: 创建 comments 未读查询索引
  console.log('   [3/6] Creating index idx_comments_unread...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_comments_unread
    ON comments(account_id, is_read, detected_at DESC)
  `);
  console.log('   ✅ Index created\n');

  // Step 4: 创建 comments 已读状态索引
  console.log('   [4/6] Creating index idx_comments_read_status...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_comments_read_status
    ON comments(account_id, is_read, read_at)
  `);
  console.log('   ✅ Index created\n');

  // Step 5: 创建 direct_messages 未读查询索引
  console.log('   [5/6] Creating index idx_messages_unread...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_unread
    ON direct_messages(account_id, is_read, detected_at DESC)
  `);
  console.log('   ✅ Index created\n');

  // Step 6: 创建 direct_messages 已读状态索引
  console.log('   [6/6] Creating index idx_messages_read_status...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_read_status
    ON direct_messages(account_id, is_read, read_at)
  `);
  console.log('   ✅ Index created\n');

  // 验证迁移结果
  console.log('🔍 Post-migration validation:\n');

  // 验证 comments 表
  const newCommentsColumns = db.prepare('PRAGMA table_info(comments)').all();
  const commentsReadAtCol = newCommentsColumns.find(col => col.name === 'read_at');
  if (commentsReadAtCol) {
    console.log(`   ✅ comments.read_at: ${commentsReadAtCol.type} (nullable: ${commentsReadAtCol.notnull === 0})`);
  } else {
    console.log('   ❌ comments.read_at NOT FOUND');
  }

  // 验证 direct_messages 表
  const newMessagesColumns = db.prepare('PRAGMA table_info(direct_messages)').all();
  const messagesReadAtCol = newMessagesColumns.find(col => col.name === 'read_at');
  if (messagesReadAtCol) {
    console.log(`   ✅ direct_messages.read_at: ${messagesReadAtCol.type} (nullable: ${messagesReadAtCol.notnull === 0})`);
  } else {
    console.log('   ❌ direct_messages.read_at NOT FOUND');
  }

  // 验证索引
  const indexes = db.prepare(`
    SELECT name, tbl_name
    FROM sqlite_master
    WHERE type = 'index'
      AND (name LIKE '%unread%' OR name LIKE '%read_status%')
    ORDER BY tbl_name, name
  `).all();

  console.log(`\n   Created indexes (${indexes.length}):`);
  for (const idx of indexes) {
    console.log(`   ✅ ${idx.tbl_name}.${idx.name}`);
  }

  // 统计数据
  console.log('\n📊 Data statistics:\n');

  const commentsTotal = db.prepare('SELECT COUNT(*) as count FROM comments').get().count;
  const commentsRead = db.prepare('SELECT COUNT(*) as count FROM comments WHERE is_read = 1').get().count;
  const commentsUnread = db.prepare('SELECT COUNT(*) as count FROM comments WHERE is_read = 0').get().count;

  console.log(`   Comments:`);
  console.log(`     Total: ${commentsTotal}`);
  console.log(`     Read: ${commentsRead}`);
  console.log(`     Unread: ${commentsUnread}`);

  const messagesTotal = db.prepare('SELECT COUNT(*) as count FROM direct_messages').get().count;
  const messagesRead = db.prepare('SELECT COUNT(*) as count FROM direct_messages WHERE is_read = 1').get().count;
  const messagesUnread = db.prepare('SELECT COUNT(*) as count FROM direct_messages WHERE is_read = 0').get().count;

  console.log(`\n   Direct Messages:`);
  console.log(`     Total: ${messagesTotal}`);
  console.log(`     Read: ${messagesRead}`);
  console.log(`     Unread: ${messagesUnread}`);

  // 关闭数据库
  db.close();

  console.log('\n' + '='.repeat(80));
  console.log('✅ Migration completed successfully!\n');

  process.exit(0);

} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  console.error('\nStack trace:', error.stack);
  console.error('\n' + '='.repeat(80));
  process.exit(1);
}
