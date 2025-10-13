/**
 * 数据库迁移工具
 * 用于从 v1 (Mock) 升级到 v2 (Real Implementation)
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('db-migration');

/**
 * 执行数据库迁移
 */
function migrate(dbPath = './data/master.db') {
  try {
    logger.info('Starting database migration to v2.0.0...');

    // 打开数据库
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // 检查当前版本
    const currentVersion = getCurrentVersion(db);
    logger.info(`Current database version: ${currentVersion}`);

    if (currentVersion >= 2.0) {
      logger.info('Database is already up to date');
      db.close();
      return true;
    }

    // 开始事务
    db.exec('BEGIN TRANSACTION');

    try {
      // Step 1: 执行迁移脚本
      logger.info('Step 1: Running migration script...');
      const migrationSQL = fs.readFileSync(
        path.join(__dirname, 'migrations', '001-add-real-implementation.sql'),
        'utf-8'
      );
      db.exec(migrationSQL);
      logger.info('✓ Migration script executed');

      // Step 2: 创建新表
      logger.info('Step 2: Creating new tables...');
      const schemaV2SQL = fs.readFileSync(
        path.join(__dirname, 'schema-v2.sql'),
        'utf-8'
      );
      db.exec(schemaV2SQL);
      logger.info('✓ New tables created');

      // Step 3: 更新版本号
      logger.info('Step 3: Updating version...');
      updateVersion(db, 2.0);
      logger.info('✓ Version updated to 2.0');

      // 提交事务
      db.exec('COMMIT');
      logger.info('✓ Migration completed successfully');

      // 验证迁移结果
      verifyMigration(db);

      db.close();
      return true;

    } catch (error) {
      // 回滚事务
      db.exec('ROLLBACK');
      throw error;
    }

  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
}

/**
 * 获取当前数据库版本
 */
function getCurrentVersion(db) {
  try {
    // 创建版本表（如果不存在）
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version REAL PRIMARY KEY,
        migrated_at INTEGER NOT NULL
      )
    `);

    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get();
    return row.version || 1.0;
  } catch (error) {
    logger.warn('Failed to get version, assuming 1.0:', error.message);
    return 1.0;
  }
}

/**
 * 更新版本号
 */
function updateVersion(db, version) {
  db.prepare(`
    INSERT INTO schema_version (version, migrated_at)
    VALUES (?, ?)
  `).run(version, Math.floor(Date.now() / 1000));
}

/**
 * 验证迁移结果
 */
function verifyMigration(db) {
  logger.info('Verifying migration...');

  // 检查新表是否存在
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name IN ('login_sessions', 'worker_contexts', 'proxies')
  `).all();

  if (tables.length !== 3) {
    throw new Error('Not all new tables were created');
  }
  logger.info('✓ New tables verified');

  // 检查 accounts 表新字段
  const accountsInfo = db.prepare("PRAGMA table_info('accounts')").all();
  const hasLoginStatus = accountsInfo.some(col => col.name === 'login_status');
  if (!hasLoginStatus) {
    throw new Error('accounts table not updated');
  }
  logger.info('✓ accounts table updated');

  // 检查 workers 表新字段
  const workersInfo = db.prepare("PRAGMA table_info('workers')").all();
  const hasProxyId = workersInfo.some(col => col.name === 'proxy_id');
  if (!hasProxyId) {
    throw new Error('workers table not updated');
  }
  logger.info('✓ workers table updated');

  logger.info('✓ Migration verification passed');
}

/**
 * 备份数据库
 */
function backupDatabase(dbPath) {
  const backupPath = `${dbPath}.backup.${Date.now()}`;
  fs.copyFileSync(dbPath, backupPath);
  logger.info(`Database backed up to: ${backupPath}`);
  return backupPath;
}

// CLI 执行
if (require.main === module) {
  const dbPath = process.argv[2] || './data/master.db';

  // 检查数据库是否存在
  if (!fs.existsSync(dbPath)) {
    logger.error(`Database not found: ${dbPath}`);
    process.exit(1);
  }

  // 备份数据库
  logger.info('Creating database backup...');
  const backupPath = backupDatabase(dbPath);

  // 执行迁移
  try {
    migrate(dbPath);
    logger.info('✓ Migration completed successfully');
    logger.info(`Backup saved to: ${backupPath}`);
    process.exit(0);
  } catch (error) {
    logger.error('✗ Migration failed:', error);
    logger.info(`Database backup available at: ${backupPath}`);
    process.exit(1);
  }
}

module.exports = { migrate, backupDatabase };
