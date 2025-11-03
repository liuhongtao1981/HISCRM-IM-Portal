/**
 * 数据库 Schema 验证器
 *
 * 验证数据库结构是否符合当前定义的schema
 * 基于最终的 schema.sql (v1.0)
 *
 * Updated: 2025-10-21
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('schema-validator');

/**
 * 必需的表列表
 * 所有表都在 schema.sql 中定义
 *
 * 更新 (2025-11-03): 移除已删除的旧表
 * 已删除: comments, direct_messages, conversations, contents, discussions, notifications, notification_rules
 * 使用 cache_* 表替代
 */
const REQUIRED_TABLES = [
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

/**
 * 验证数据库 schema 完整性
 *
 * @param {Database} db - SQLite 数据库实例
 * @returns {object} 验证结果
 */
function validateDatabaseSchema(db) {
  try {
    // 获取所有现有的表
    const existingTables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    ).all();

    const existingTableNames = new Set(existingTables.map(t => t.name));

    logger.info('Starting database schema validation...');
    console.log(`[schema-validator] info: Starting database schema validation...`);

    // 检查所有必需的表
    const missingTables = REQUIRED_TABLES.filter(t => !existingTableNames.has(t));

    if (missingTables.length > 0) {
      const message = `Missing required tables: ${missingTables.join(', ')}`;
      logger.error(message);
      console.log(`[schema-validator] error: ${message}`);
      return {
        valid: false,
        tables: REQUIRED_TABLES.length,
        existingTables: existingTableNames.size,
        missingTables,
        message
      };
    }

    // 检查是否有多余的表（除了系统表）
    const extraTables = Array.from(existingTableNames)
      .filter(t => !REQUIRED_TABLES.includes(t) && !t.startsWith('sqlite_'));

    if (extraTables.length > 0) {
      logger.warn(`Extra tables found: ${extraTables.join(', ')}`);
    }

    // 验证成功
    logger.info(`✓ Database schema validation PASSED`);
    logger.info(`  - Tables: ${REQUIRED_TABLES.length}/${existingTableNames.size}`);
    logger.info(`  - Status: All required tables exist`);

    console.log(`[schema-validator] info: ✓ Database schema validation PASSED`);
    console.log(`[schema-validator] info:   - Tables: ${REQUIRED_TABLES.length}/${existingTableNames.size}`);
    console.log(`[schema-validator] info:   - Status: All required tables exist`);

    return {
      valid: true,
      tables: REQUIRED_TABLES.length,
      existingTables: existingTableNames.size,
      message: 'Database schema is valid'
    };
  } catch (error) {
    logger.error('Schema validation error', error);
    console.log(`[schema-validator] error: Schema validation error: ${error.message}`);
    throw error;
  }
}

/**
 * 获取数据库统计信息
 *
 * @param {Database} db - SQLite 数据库实例
 * @returns {object} 统计信息
 */
function getDatabaseStats(db) {
  try {
    const stats = {
      timestamp: new Date().toISOString(),
      tables: {}
    };

    for (const tableName of REQUIRED_TABLES) {
      try {
        const result = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
        stats.tables[tableName] = {
          rows: result.count
        };
      } catch (error) {
        stats.tables[tableName] = {
          rows: 0,
          error: error.message
        };
      }
    }

    return stats;
  } catch (error) {
    logger.error('Failed to get database stats', error);
    return null;
  }
}

/**
 * 验证特定表的结构
 *
 * @param {Database} db - SQLite 数据库实例
 * @param {string} tableName - 表名
 * @returns {object} 表的结构信息
 */
function getTableStructure(db, tableName) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const indexes = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=?`
    ).all(tableName);

    return {
      tableName,
      columns: columns.map(col => ({
        name: col.name,
        type: col.type,
        notNull: col.notnull === 1,
        defaultValue: col.dflt_value,
        primaryKey: col.pk === 1
      })),
      indexes: indexes.map(idx => idx.name)
    };
  } catch (error) {
    logger.error(`Failed to get structure for table ${tableName}`, error);
    return null;
  }
}

module.exports = {
  validateDatabaseSchema,
  getDatabaseStats,
  getTableStructure,
  REQUIRED_TABLES
};
