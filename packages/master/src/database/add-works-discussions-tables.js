/**
 * 数据库迁移脚本：添加 works 和 discussions 表
 *
 * 运行方式：
 *   node packages/master/src/database/add-works-discussions-tables.js
 *
 * 功能：
 *   1. 创建 works 表（统一的作品表）
 *   2. 创建 discussions 表（二级评论表）
 *   3. 迁移现有 douyin_videos 数据到 works 表
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/master.db');

function runMigration() {
  console.log('开始数据库迁移...');
  console.log(`数据库路径: ${DB_PATH}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ 数据库文件不存在:', DB_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  try {
    // 开始事务
    db.exec('BEGIN TRANSACTION');

    // ============================================
    // 1. 创建 works 表
    // ============================================
    console.log('\n1. 创建 works 表...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS works (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        platform_work_id TEXT NOT NULL,
        platform_user_id TEXT,

        -- 作品类型和信息
        work_type TEXT NOT NULL CHECK(work_type IN ('video', 'article', 'image', 'audio', 'text')),
        title TEXT,
        description TEXT,
        cover TEXT,
        url TEXT,
        publish_time INTEGER,

        -- 统计信息
        total_comment_count INTEGER DEFAULT 0,
        new_comment_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        share_count INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,

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
        UNIQUE(account_id, platform, platform_work_id),

        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_works_account ON works(account_id);
      CREATE INDEX IF NOT EXISTS idx_works_platform ON works(platform);
      CREATE INDEX IF NOT EXISTS idx_works_platform_work ON works(platform_work_id);
      CREATE INDEX IF NOT EXISTS idx_works_last_crawl ON works(last_crawl_time);
      CREATE INDEX IF NOT EXISTS idx_works_platform_user ON works(platform_user_id);
      CREATE INDEX IF NOT EXISTS idx_works_work_type ON works(work_type);
      CREATE INDEX IF NOT EXISTS idx_works_is_new ON works(is_new);
      CREATE INDEX IF NOT EXISTS idx_works_account_platform_work ON works(account_id, platform, platform_work_id);
    `);

    console.log('✅ works 表创建成功');

    // ============================================
    // 2. 迁移 douyin_videos 数据到 works 表
    // ============================================
    console.log('\n2. 迁移 douyin_videos 数据到 works 表...');

    const videoCount = db.prepare('SELECT COUNT(*) as count FROM douyin_videos').get().count;
    console.log(`   找到 ${videoCount} 个抖音视频`);

    if (videoCount > 0) {
      // 迁移数据
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO works (
          id, account_id, platform, platform_work_id, platform_user_id,
          work_type, title, cover, publish_time,
          total_comment_count, new_comment_count, like_count, share_count, view_count,
          last_crawl_time, crawl_status, crawl_error,
          is_new, push_count, created_at, updated_at
        )
        SELECT
          id,
          account_id,
          'douyin' as platform,
          platform_videos_id as platform_work_id,
          platform_user_id,
          'video' as work_type,
          title,
          cover,
          CAST(strftime('%s', publish_time) AS INTEGER) as publish_time,
          total_comment_count,
          new_comment_count,
          like_count,
          share_count,
          play_count as view_count,
          last_crawl_time,
          crawl_status,
          crawl_error,
          is_new,
          push_count,
          created_at,
          updated_at
        FROM douyin_videos
      `);

      const result = stmt.run();
      console.log(`✅ 成功迁移 ${result.changes} 个视频到 works 表`);
    } else {
      console.log('⚠️  没有需要迁移的数据');
    }

    // ============================================
    // 3. 创建 discussions 表
    // ============================================
    console.log('\n3. 创建 discussions 表...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS discussions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        platform_user_id TEXT,
        platform_discussion_id TEXT,

        -- 关联到父评论
        parent_comment_id TEXT NOT NULL,

        -- 讨论内容
        content TEXT NOT NULL,
        author_name TEXT,
        author_id TEXT,

        -- 关联作品信息
        work_id TEXT,
        post_id TEXT,
        post_title TEXT,

        -- 状态
        is_read BOOLEAN DEFAULT 0,
        is_new BOOLEAN DEFAULT 1,
        push_count INTEGER DEFAULT 0,

        -- 时间戳
        detected_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,

        -- 三字段组合唯一约束
        UNIQUE(account_id, platform_user_id, platform_discussion_id),

        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
        FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE SET NULL
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_discussions_account ON discussions(account_id);
      CREATE INDEX IF NOT EXISTS idx_discussions_platform ON discussions(platform);
      CREATE INDEX IF NOT EXISTS idx_discussions_parent_comment ON discussions(parent_comment_id);
      CREATE INDEX IF NOT EXISTS idx_discussions_work ON discussions(work_id);
      CREATE INDEX IF NOT EXISTS idx_discussions_read ON discussions(is_read);
      CREATE INDEX IF NOT EXISTS idx_discussions_is_new ON discussions(is_new);
      CREATE INDEX IF NOT EXISTS idx_discussions_detected ON discussions(detected_at);
      CREATE INDEX IF NOT EXISTS idx_discussions_platform_user ON discussions(platform_user_id);
      CREATE INDEX IF NOT EXISTS idx_discussions_account_platform_user_platform_discussion ON discussions(account_id, platform_user_id, platform_discussion_id);
    `);

    console.log('✅ discussions 表创建成功');

    // ============================================
    // 4. 验证表结构
    // ============================================
    console.log('\n4. 验证表结构...');

    const tables = db.prepare(`
      SELECT name, sql
      FROM sqlite_master
      WHERE type='table' AND name IN ('works', 'discussions')
      ORDER BY name
    `).all();

    tables.forEach(table => {
      console.log(`✅ 表 ${table.name} 已创建`);
    });

    // 提交事务
    db.exec('COMMIT');
    console.log('\n✅ 数据库迁移完成！');

    // 输出统计信息
    console.log('\n📊 统计信息:');
    const worksCount = db.prepare('SELECT COUNT(*) as count FROM works').get().count;
    const discussionsCount = db.prepare('SELECT COUNT(*) as count FROM discussions').get().count;
    console.log(`   works 表: ${worksCount} 条记录`);
    console.log(`   discussions 表: ${discussionsCount} 条记录`);

  } catch (error) {
    // 回滚事务
    db.exec('ROLLBACK');
    console.error('\n❌ 迁移失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 运行迁移
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
