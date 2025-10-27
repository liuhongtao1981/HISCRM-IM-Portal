/**
 * 数据库迁移脚本: contents → contents
 *
 * 功能：
 * 1. 重命名 contents 表为 contents
 * 2. 更新字段名: platform_content_id → platform_content_id
 * 3. 更新字段名: content_type → content_type
 * 4. 更新统计字段前缀: stats_comment_count → stats_comment_count
 * 5. 更新 discussions 表的外键: content_id → content_id
 * 6. 重建所有索引
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../data/master.db');

console.log('🔄 开始数据库迁移: contents → contents\n');
console.log(`📁 数据库路径: ${dbPath}\n`);

// 检查数据库文件是否存在
if (!fs.existsSync(dbPath)) {
  console.error('❌ 数据库文件不存在!');
  process.exit(1);
}

const db = new Database(dbPath);

// 开启外键约束
db.pragma('foreign_keys = OFF');

console.log('====================================');
console.log('📊 迁移前数据统计');
console.log('====================================\n');

try {
  // 检查 contents 表是否存在
  const worksTable = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='contents'
  `).get();

  if (!worksTable) {
    console.log('ℹ️  contents 表不存在，可能已经迁移过了');

    // 检查 contents 表
    const contentsTable = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='contents'
    `).get();

    if (contentsTable) {
      console.log('✅ contents 表已存在');
      const count = db.prepare('SELECT COUNT(*) as count FROM contents').get();
      console.log(`   记录数: ${count.count} 条\n`);
    } else {
      console.log('❌ contents 表也不存在，请检查数据库状态');
    }

    process.exit(0);
  }

  const worksCount = db.prepare('SELECT COUNT(*) as count FROM contents').get();
  console.log(`contents 表: ${worksCount.count} 条记录\n`);

  // 检查 discussions 表
  const discussionsCount = db.prepare('SELECT COUNT(*) as count FROM discussions').get();
  console.log(`discussions 表: ${discussionsCount.count} 条记录\n`);

} catch (error) {
  console.error('❌ 查询数据失败:', error.message);
  process.exit(1);
}

console.log('====================================');
console.log('🚀 开始迁移');
console.log('====================================\n');

// 开始事务
db.exec('BEGIN TRANSACTION');

try {
  // Step 1: 创建新的 contents 表（带新字段名）
  console.log('1. 创建新的 contents 表...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS contents (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      platform_content_id TEXT NOT NULL,
      platform_user_id TEXT,

      -- 内容类型和信息
      content_type TEXT NOT NULL CHECK(content_type IN ('video', 'article', 'image', 'audio', 'text')),
      title TEXT,
      description TEXT,
      cover TEXT,
      url TEXT,
      publish_time INTEGER,

      -- 统计信息
      stats_comment_count INTEGER DEFAULT 0,
      stats_new_comment_count INTEGER DEFAULT 0,
      stats_like_count INTEGER DEFAULT 0,
      stats_share_count INTEGER DEFAULT 0,
      stats_view_count INTEGER DEFAULT 0,

      -- 爬取状态
      last_crawl_time INTEGER,
      crawl_status TEXT DEFAULT 'pending',
      crawl_error TEXT,

      -- 标记
      is_new BOOLEAN DEFAULT 1,
      push_count INTEGER DEFAULT 0,

      -- 时间戳
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,

      -- 三字段组合唯一约束
      UNIQUE(account_id, platform, platform_content_id),

      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);
  console.log('   ✅ contents 表创建成功\n');

  // Step 2: 迁移数据（映射字段名）
  console.log('2. 迁移数据从 contents 到 contents...');
  const insertStmt = db.prepare(`
    INSERT INTO contents (
      id, account_id, platform, platform_content_id, platform_user_id,
      content_type, title, description, cover, url, publish_time,
      stats_comment_count, stats_new_comment_count, stats_like_count, stats_share_count, stats_view_count,
      last_crawl_time, crawl_status, crawl_error,
      is_new, push_count,
      created_at, updated_at
    )
    SELECT
      id, account_id, platform, platform_content_id, platform_user_id,
      content_type, title, description, cover, url, publish_time,
      stats_comment_count, stats_new_comment_count, stats_like_count, stats_share_count, stats_view_count,
      last_crawl_time, crawl_status, crawl_error,
      is_new, push_count,
      created_at, updated_at
    FROM contents
  `);

  const result = insertStmt.run();
  console.log(`   ✅ 数据迁移成功: ${result.changes} 条记录\n`);

  // Step 3: 更新 discussions 表的外键字段
  console.log('3. 更新 discussions 表...');

  // 检查 discussions 表是否有 content_id 列
  const discussionsSchema = db.pragma('table_info(discussions)');
  const hasWorkId = discussionsSchema.some(col => col.name === 'content_id');

  if (hasWorkId) {
    console.log('   发现 content_id 列，准备迁移...');

    // 创建临时表
    db.exec(`
      CREATE TABLE discussions_temp AS SELECT * FROM discussions
    `);

    // 删除旧表
    db.exec(`DROP TABLE discussions`);

    // 创建新表（使用 content_id）
    db.exec(`
      CREATE TABLE discussions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        platform_user_id TEXT,
        platform_discussion_id TEXT NOT NULL,
        parent_comment_id TEXT,

        -- 讨论内容
        content TEXT NOT NULL,
        author_name TEXT,
        author_id TEXT,
        author_avatar TEXT,

        -- 关联内容信息
        content_id TEXT,
        post_id TEXT,
        post_title TEXT,

        -- 状态
        is_read BOOLEAN DEFAULT 0,
        is_new BOOLEAN DEFAULT 1,
        push_count INTEGER DEFAULT 0,

        -- 回复目标
        reply_to_user_id TEXT,
        reply_to_user_name TEXT,

        -- 时间戳
        detected_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,

        -- 三字段组合唯一约束
        UNIQUE(account_id, platform_user_id, platform_discussion_id),

        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
        FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE SET NULL
      )
    `);

    // 迁移数据（content_id → content_id）
    db.exec(`
      INSERT INTO discussions (
        id, account_id, platform, platform_user_id, platform_discussion_id, parent_comment_id,
        content, author_name, author_id, author_avatar,
        content_id, post_id, post_title,
        is_read, is_new, push_count,
        reply_to_user_id, reply_to_user_name,
        detected_at, created_at
      )
      SELECT
        id, account_id, platform, platform_user_id, platform_discussion_id, parent_comment_id,
        content, author_name, author_id, author_avatar,
        content_id, post_id, post_title,
        is_read, is_new, push_count,
        reply_to_user_id, reply_to_user_name,
        detected_at, created_at
      FROM discussions_temp
    `);

    // 删除临时表
    db.exec(`DROP TABLE discussions_temp`);

    console.log('   ✅ discussions 表更新成功\n');
  } else {
    console.log('   ℹ️  discussions 表已经使用 content_id，无需迁移\n');
  }

  // Step 4: 重建索引
  console.log('4. 重建 contents 表索引...');
  db.exec(`
    CREATE INDEX idx_contents_account ON contents(account_id);
    CREATE INDEX idx_contents_platform ON contents(platform);
    CREATE INDEX idx_contents_platform_content ON contents(platform_content_id);
    CREATE INDEX idx_contents_last_crawl ON contents(last_crawl_time);
    CREATE INDEX idx_contents_platform_user ON contents(platform_user_id);
    CREATE INDEX idx_contents_content_type ON contents(content_type);
    CREATE INDEX idx_contents_is_new ON contents(is_new);
    CREATE INDEX idx_contents_account_platform_content ON contents(account_id, platform, platform_content_id);
  `);
  console.log('   ✅ 索引创建成功\n');

  console.log('5. 重建 discussions 表索引...');
  db.exec(`
    CREATE INDEX idx_discussions_account ON discussions(account_id);
    CREATE INDEX idx_discussions_platform ON discussions(platform);
    CREATE INDEX idx_discussions_parent_comment ON discussions(parent_comment_id);
    CREATE INDEX idx_discussions_content ON discussions(content_id);
    CREATE INDEX idx_discussions_read ON discussions(is_read);
    CREATE INDEX idx_discussions_is_new ON discussions(is_new);
    CREATE INDEX idx_discussions_detected ON discussions(detected_at);
    CREATE INDEX idx_discussions_platform_user ON discussions(platform_user_id);
    CREATE INDEX idx_discussions_account_platform_user_platform_discussion ON discussions(account_id, platform_user_id, platform_discussion_id);
  `);
  console.log('   ✅ 索引创建成功\n');

  // Step 5: 删除旧的 contents 表
  console.log('6. 删除旧的 contents 表...');
  db.exec('DROP TABLE IF EXISTS contents');
  console.log('   ✅ contents 表已删除\n');

  // 提交事务
  db.exec('COMMIT');

  console.log('====================================');
  console.log('📊 迁移后数据统计');
  console.log('====================================\n');

  const contentsCount = db.prepare('SELECT COUNT(*) as count FROM contents').get();
  console.log(`contents 表: ${contentsCount.count} 条记录\n`);

  const newDiscussionsCount = db.prepare('SELECT COUNT(*) as count FROM discussions').get();
  console.log(`discussions 表: ${newDiscussionsCount.count} 条记录\n`);

  console.log('====================================');
  console.log('✅ 迁移成功完成！');
  console.log('====================================\n');

  console.log('📝 字段映射关系:');
  console.log('   contents → contents');
  console.log('   platform_content_id → platform_content_id');
  console.log('   content_type → content_type');
  console.log('   stats_comment_count → stats_comment_count');
  console.log('   stats_new_comment_count → stats_new_comment_count');
  console.log('   stats_like_count → stats_like_count');
  console.log('   stats_share_count → stats_share_count');
  console.log('   stats_view_count → stats_view_count');
  console.log('');
  console.log('   discussions.content_id → discussions.content_id\n');

} catch (error) {
  // 回滚事务
  db.exec('ROLLBACK');
  console.error('\n====================================');
  console.error('❌ 迁移失败，已回滚所有变更');
  console.error('====================================\n');
  console.error('错误信息:', error.message);
  console.error('错误堆栈:', error.stack);
  process.exit(1);
} finally {
  // 恢复外键约束
  db.pragma('foreign_keys = ON');
  db.close();
}
