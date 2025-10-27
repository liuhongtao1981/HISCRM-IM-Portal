/**
 * 数据库迁移：accounts 表字段重命名
 * total_works → total_contents
 * recent_works_count → recent_contents_count
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../data/master.db');

console.log('======================================');
console.log('📦 accounts 表字段迁移');
console.log('======================================\n');

if (!fs.existsSync(dbPath)) {
  console.error('❌ 数据库文件不存在!');
  console.error(`路径: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);

try {
  console.log('✅ 已打开数据库:', dbPath);

  // 开始事务
  db.exec('BEGIN TRANSACTION');

  try {
    // 检查当前表结构
    console.log('\n📊 当前 accounts 表结构:');
    const columns = db.pragma('table_info(accounts)');
    const hasOldFields = columns.some(c => c.name === 'total_works' || c.name === 'recent_works_count');

    if (!hasOldFields) {
      console.log('✅ 字段已经是新名称，无需迁移');
      db.exec('ROLLBACK');
      db.close();
      process.exit(0);
    }

    // Step 1: 创建临时表
    console.log('\n📝 Step 1: 创建临时表...');
    db.exec(`
      CREATE TABLE accounts_temp (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        account_name TEXT NOT NULL,
        account_id TEXT NOT NULL,
        credentials TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        login_status TEXT DEFAULT 'not_logged_in',
        monitor_interval INTEGER DEFAULT 30,
        last_check_time INTEGER,
        last_login_time INTEGER,
        cookies_valid_until INTEGER,
        assigned_worker_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,

        user_info TEXT,
        fingerprint TEXT,
        platform_user_id TEXT,
        platform_username TEXT,
        avatar TEXT,
        signature TEXT,
        verified BOOLEAN DEFAULT 0,

        total_comments INTEGER DEFAULT 0,
        total_contents INTEGER DEFAULT 0,
        total_followers INTEGER DEFAULT 0,
        total_following INTEGER DEFAULT 0,
        recent_comments_count INTEGER DEFAULT 0,
        recent_contents_count INTEGER DEFAULT 0,

        worker_status TEXT DEFAULT 'offline',
        last_crawl_time INTEGER,
        last_heartbeat_time INTEGER,
        error_count INTEGER DEFAULT 0,
        last_error_message TEXT,

        UNIQUE(platform, account_id)
      )
    `);
    console.log('✅ 临时表创建成功');

    // Step 2: 迁移数据
    console.log('\n📝 Step 2: 迁移数据...');
    const migrateStmt = db.prepare(`
      INSERT INTO accounts_temp (
        id, platform, account_name, account_id, credentials, status, login_status,
        monitor_interval, last_check_time, last_login_time, cookies_valid_until,
        assigned_worker_id, created_at, updated_at,
        user_info, fingerprint, platform_user_id, platform_username, avatar, signature, verified,
        total_comments, total_contents, total_followers, total_following,
        recent_comments_count, recent_contents_count,
        worker_status, last_crawl_time, last_heartbeat_time, error_count, last_error_message
      )
      SELECT
        id, platform, account_name, account_id, credentials, status, login_status,
        monitor_interval, last_check_time, last_login_time, cookies_valid_until,
        assigned_worker_id, created_at, updated_at,
        user_info, fingerprint, platform_user_id, platform_username, avatar, signature, verified,
        total_comments, total_works, total_followers, total_following,
        recent_comments_count, recent_works_count,
        worker_status, last_crawl_time, last_heartbeat_time, error_count, last_error_message
      FROM accounts
    `);

    const result = migrateStmt.run();
    console.log(`✅ 迁移了 ${result.changes} 条记录`);

    // Step 3: 删除旧表
    console.log('\n📝 Step 3: 删除旧表...');
    db.exec('DROP TABLE accounts');
    console.log('✅ 旧表已删除');

    // Step 4: 重命名临时表
    console.log('\n📝 Step 4: 重命名临时表...');
    db.exec('ALTER TABLE accounts_temp RENAME TO accounts');
    console.log('✅ 表重命名成功');

    // Step 5: 重建索引
    console.log('\n📝 Step 5: 重建索引...');
    db.exec(`
      CREATE INDEX idx_accounts_status ON accounts(status);
      CREATE INDEX idx_accounts_login_status ON accounts(login_status);
      CREATE INDEX idx_accounts_worker ON accounts(assigned_worker_id);
      CREATE INDEX idx_accounts_platform_account ON accounts(platform, account_id);
      CREATE INDEX idx_accounts_platform_user ON accounts(platform_user_id);
    `);
    console.log('✅ 索引重建成功');

    // 提交事务
    db.exec('COMMIT');
    console.log('\n✅ 迁移成功! 所有变更已提交。\n');

    // 验证结果
    console.log('📊 验证结果:');
    const newColumns = db.pragma('table_info(accounts)');
    const contentFields = newColumns.filter(c =>
      c.name === 'total_contents' || c.name === 'recent_contents_count'
    );
    console.log(`   找到新字段: ${contentFields.map(c => c.name).join(', ')}`);

    const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get();
    console.log(`   账户总数: ${accountCount.count}`);

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('\n❌ 迁移失败，已回滚:', error.message);
    throw error;
  }

} catch (error) {
  console.error('❌ 数据库操作失败:', error);
  process.exit(1);
} finally {
  db.close();
  console.log('\n🔒 数据库连接已关闭\n');
}
