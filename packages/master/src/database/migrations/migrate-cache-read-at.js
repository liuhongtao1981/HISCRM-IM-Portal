/**
 * 迁移脚本: 为 cache_ 表添加已读状态字段
 * 用途: 为 cache_comments 和 cache_messages 表添加 is_read 和 read_at
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../../data/master.db');
const migrationSql = path.join(__dirname, 'add-read-at-to-cache-tables.sql');

console.log('\n🔧 Starting cache tables read_at field migration...');
console.log('='.repeat(80));
console.log(`Database: ${dbPath}`);
console.log(`Migration SQL: ${migrationSql}\n`);

try {
  // 1. 检查数据库是否存在
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }

  // 2. 连接数据库
  const db = new Database(dbPath);
  console.log('✓ Database connected');

  // 3. 检查 cache_comments 表是否已有 read_at 字段
  const commentsSchema = db.prepare('PRAGMA table_info(cache_comments)').all();
  const hasCommentsReadAt = commentsSchema.some((col) => col.name === 'read_at');

  if (hasCommentsReadAt) {
    console.log('⚠ cache_comments table already has read_at field, skipping migration');
    db.close();
    process.exit(0);
  }

  // 4. 开始迁移
  console.log('\n📝 Reading migration SQL...');
  const sql = fs.readFileSync(migrationSql, 'utf8');

  console.log('🔄 Executing migration...\n');

  // 逐个执行 SQL 语句
  console.log('  • Adding is_read column to cache_comments...');
  db.exec('ALTER TABLE cache_comments ADD COLUMN is_read INTEGER DEFAULT 0');

  console.log('  • Adding read_at column to cache_comments...');
  db.exec('ALTER TABLE cache_comments ADD COLUMN read_at INTEGER DEFAULT NULL');

  console.log('  • Adding is_read column to cache_messages...');
  db.exec('ALTER TABLE cache_messages ADD COLUMN is_read INTEGER DEFAULT 0');

  console.log('  • Adding read_at column to cache_messages...');
  db.exec('ALTER TABLE cache_messages ADD COLUMN read_at INTEGER DEFAULT NULL');

  console.log('  • Creating index idx_cache_comments_unread...');
  db.exec('CREATE INDEX IF NOT EXISTS idx_cache_comments_unread ON cache_comments(account_id, is_read, created_at DESC)');

  console.log('  • Creating index idx_cache_messages_unread...');
  db.exec('CREATE INDEX IF NOT EXISTS idx_cache_messages_unread ON cache_messages(account_id, is_read, created_at DESC)');

  // 5. 验证迁移结果
  console.log('\n✅ Migration completed! Verifying...\n');

  const newCommentsSchema = db.prepare('PRAGMA table_info(cache_comments)').all();
  const newMessagesSchema = db.prepare('PRAGMA table_info(cache_messages)').all();

  console.log('📊 cache_comments fields:');
  newCommentsSchema.forEach((col) => {
    if (col.name === 'is_read' || col.name === 'read_at') {
      console.log(`  ✓ ${col.name} (${col.type}${col.dflt_value ? `, default: ${col.dflt_value}` : ''})`);
    }
  });

  console.log('\n📊 cache_messages fields:');
  newMessagesSchema.forEach((col) => {
    if (col.name === 'is_read' || col.name === 'read_at') {
      console.log(`  ✓ ${col.name} (${col.type}${col.dflt_value ? `, default: ${col.dflt_value}` : ''})`);
    }
  });

  // 6. 验证索引
  const commentsIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='cache_comments' AND name LIKE '%unread%'").all();
  const messagesIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='cache_messages' AND name LIKE '%unread%'").all();

  console.log('\n📊 Indexes:');
  console.log(`  ✓ cache_comments: ${commentsIndexes.length} unread index(es)`);
  console.log(`  ✓ cache_messages: ${messagesIndexes.length} unread index(es)`);

  // 7. 统计数据
  const commentsCount = db.prepare('SELECT COUNT(*) as count FROM cache_comments').get().count;
  const messagesCount = db.prepare('SELECT COUNT(*) as count FROM cache_messages').get().count;

  console.log('\n📊 Current data:');
  console.log(`  • cache_comments: ${commentsCount} rows`);
  console.log(`  • cache_messages: ${messagesCount} rows`);
  console.log(`  • All rows will have is_read=0, read_at=NULL by default`);

  db.close();
  console.log('\n✅ Migration completed successfully!\n');
  console.log('='.repeat(80));
} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
