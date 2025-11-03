/**
 * HisCRM-IM Master Database Initialization
 *
 * Initializes SQLite database with final schema (v1.0)
 * No migrations - uses current database as baseline
 *
 * Schema Version: 1.0 (2025-10-21)
 * Total Tables: 16
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('database-init');

/**
 * 初始化主控数据库
 * @param {string} dbPath - 数据库文件路径
 * @param {Object} options - 配置选项
 * @param {boolean} options.validateSchema - 是否验证schema (默认: true)
 * @param {boolean} options.strictValidation - 严格验证模式,验证失败时抛出异常 (默认: true)
 * @returns {Database} SQLite数据库实例
 */
function initDatabase(dbPath = './data/master.db', options = {}) {
  const { validateSchema = true, strictValidation = true } = options;

  try {
    // 确保data目录存在
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      logger.info(`Created data directory: ${dataDir}`);
    }

    // 创建数据库连接
    const db = new Database(dbPath, { verbose: logger.debug });

    // 启用WAL模式 (提高并发性和稳定性)
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');

    // 明确设置编码为UTF-8 (防止字符编码问题)
    db.pragma('encoding = "UTF-8"');

    logger.info(`Database opened: ${dbPath}`);

    // 检查数据库是否已初始化（检查关键表是否存在）
    const tablesExist = db.prepare(
      `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='accounts'`
    ).get();

    if (tablesExist.count === 0) {
      // 数据库未初始化，执行 schema.sql
      logger.info('Database not initialized, creating schema...');
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      db.exec(schema);
      logger.info('Database schema initialized successfully');
    } else {
      logger.info('Database already initialized, skipping schema creation');
    }

    // 验证数据库结构完整性
    try {
      validateDatabaseSchema(db);
      logger.info('Database schema validation PASSED ✓');
    } catch (error) {
      logger.error('Database schema validation failed', error);
      throw error;
    }

    return db;
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * 验证数据库schema完整性
 * @param {Database} db - 数据库实例
 * @throws {Error} 如果验证失败
 *
 * 更新 (2025-11-03): 移除已删除的旧表
 * 已删除: comments, direct_messages, conversations, contents, discussions, notifications, notification_rules
 * 使用 cache_* 表替代
 */
function validateDatabaseSchema(db) {
  const requiredTables = [
    // 核心表
    'accounts',
    'workers',
    'worker_configs',
    'worker_runtime',
    'worker_logs',
    'login_sessions',
    'client_sessions',
    'replies',
    'proxies',

    // Cache 表
    'cache_comments',
    'cache_messages',
    'cache_conversations',
    'cache_contents',
    'cache_notifications',
    'cache_metadata'
  ];

  // 获取现有表
  const existingTables = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
  ).all();

  const existingTableNames = new Set(existingTables.map(t => t.name));

  // 检查所有必需的表
  const missingTables = requiredTables.filter(t => !existingTableNames.has(t));

  if (missingTables.length > 0) {
    throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
  }

  logger.info(`✓ Database schema validation PASSED - ${requiredTables.length} tables verified`);
}

/**
 * 关闭数据库连接
 * @param {Database} db - 数据库实例
 */
function closeDatabase(db) {
  if (db && db.open) {
    db.close();
    logger.info('Database closed');
  }
}

module.exports = {
  initDatabase,
  closeDatabase,
  validateDatabaseSchema
};
