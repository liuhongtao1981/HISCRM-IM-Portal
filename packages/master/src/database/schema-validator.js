/**
 * 数据库结构验证器
 * 验证数据库表和字段是否符合预期的schema定义
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('schema-validator');

/**
 * 必需的表和字段定义
 */
const REQUIRED_SCHEMA = {
  accounts: {
    columns: [
      'id',
      'platform',
      'account_name',
      'account_id',
      'credentials',
      'status',
      'login_status',
      'monitor_interval',
      'last_check_time',
      'last_login_time',
      'cookies_valid_until',
      'assigned_worker_id',
      'created_at',
      'updated_at',
    ],
    indexes: ['idx_accounts_status', 'idx_accounts_login_status', 'idx_accounts_worker'],
  },
  comments: {
    columns: [
      'id',
      'account_id',
      'platform_comment_id',
      'content',
      'author_name',
      'author_id',
      'post_id',
      'post_title',
      'is_read',
      'detected_at',
      'created_at',
      'is_new',
      'push_count',
    ],
    indexes: ['idx_comments_account', 'idx_comments_read', 'idx_comments_detected'],
  },
  direct_messages: {
    columns: [
      'id',
      'account_id',
      'conversation_id',
      'platform_message_id',
      'content',
      'platform_sender_id',
      'platform_sender_name',
      'platform_receiver_id',
      'platform_receiver_name',
      'message_type',
      'direction',
      'is_read',
      'detected_at',
      'created_at',
      'is_new',
      'push_count',
    ],
    indexes: ['idx_dm_account', 'idx_dm_conversation', 'idx_dm_read', 'idx_dm_detected', 'idx_dm_created', 'idx_dm_platform_id'],
  },
  notifications: {
    columns: ['id', 'type', 'account_id', 'related_id', 'title', 'content', 'data', 'is_sent', 'sent_at', 'created_at'],
    indexes: ['idx_notifications_sent', 'idx_notifications_created'],
  },
  workers: {
    columns: ['id', 'host', 'port', 'status', 'assigned_accounts', 'last_heartbeat', 'started_at', 'version', 'metadata'],
    indexes: ['idx_workers_status'],
  },
  client_sessions: {
    columns: ['id', 'device_id', 'device_type', 'device_name', 'socket_id', 'status', 'last_seen', 'connected_at'],
    indexes: ['idx_sessions_status'],
  },
  notification_rules: {
    columns: ['id', 'account_id', 'rule_type', 'config', 'enabled', 'created_at'],
    indexes: ['idx_rules_enabled'],
  },
  login_sessions: {
    columns: [
      'id',
      'account_id',
      'worker_id',
      'status',
      'login_method',
      'qr_code_data',
      'qr_code_url',
      'error_message',
      'expires_at',
      'logged_in_at',
      'created_at',
    ],
    indexes: ['idx_login_sessions_status', 'idx_login_sessions_account', 'idx_login_sessions_created'],
  },
  proxies: {
    columns: [
      'id',
      'name',
      'server',
      'protocol',
      'username',
      'password',
      'country',
      'city',
      'status',
      'success_rate',
      'last_check_time',
      'response_time',
      'created_at',
      'updated_at',
    ],
    indexes: ['idx_proxies_status', 'idx_proxies_country', 'idx_proxies_protocol'],
  },
};

/**
 * 验证单个表的结构
 * @param {Database} db - SQLite数据库实例
 * @param {string} tableName - 表名
 * @param {Object} schema - 预期的表结构定义
 * @returns {Object} 验证结果 {valid, missingColumns, missingIndexes}
 */
function validateTable(db, tableName, schema) {
  const result = {
    valid: true,
    missingColumns: [],
    missingIndexes: [],
    extraColumns: [],
  };

  try {
    // 检查表是否存在
    const tableExists = db
      .prepare(
        `
      SELECT name FROM sqlite_master
      WHERE type='table' AND name=?
    `
      )
      .get(tableName);

    if (!tableExists) {
      logger.error(`Table '${tableName}' does not exist`);
      result.valid = false;
      result.missingColumns = schema.columns;
      result.missingIndexes = schema.indexes;
      return result;
    }

    // 获取表的列信息
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const existingColumns = columns.map((col) => col.name);

    // 检查缺失的列
    for (const requiredColumn of schema.columns) {
      if (!existingColumns.includes(requiredColumn)) {
        result.missingColumns.push(requiredColumn);
        result.valid = false;
      }
    }

    // 检查额外的列（信息性警告，不算验证失败）
    for (const existingColumn of existingColumns) {
      if (!schema.columns.includes(existingColumn)) {
        result.extraColumns.push(existingColumn);
      }
    }

    // 获取表的索引信息
    const indexes = db
      .prepare(
        `
      SELECT name FROM sqlite_master
      WHERE type='index' AND tbl_name=? AND name NOT LIKE 'sqlite_autoindex_%'
    `
      )
      .all(tableName);
    const existingIndexes = indexes.map((idx) => idx.name);

    // 检查缺失的索引
    for (const requiredIndex of schema.indexes) {
      if (!existingIndexes.includes(requiredIndex)) {
        result.missingIndexes.push(requiredIndex);
        result.valid = false;
      }
    }
  } catch (error) {
    logger.error(`Failed to validate table '${tableName}':`, error);
    result.valid = false;
  }

  return result;
}

/**
 * 验证整个数据库结构
 * @param {Database} db - SQLite数据库实例
 * @returns {Object} 验证结果 {valid, tables}
 */
function validateDatabaseSchema(db) {
  logger.info('Starting database schema validation...');

  const validationResults = {
    valid: true,
    tables: {},
    summary: {
      totalTables: Object.keys(REQUIRED_SCHEMA).length,
      validTables: 0,
      invalidTables: 0,
      missingTables: [],
    },
  };

  // 验证每个表
  for (const [tableName, schema] of Object.entries(REQUIRED_SCHEMA)) {
    const tableResult = validateTable(db, tableName, schema);
    validationResults.tables[tableName] = tableResult;

    if (tableResult.valid) {
      validationResults.summary.validTables++;
      logger.info(`✓ Table '${tableName}' validation passed`);
    } else {
      validationResults.valid = false;
      validationResults.summary.invalidTables++;

      if (tableResult.missingColumns.length === schema.columns.length) {
        validationResults.summary.missingTables.push(tableName);
        logger.error(`✗ Table '${tableName}' is missing`);
      } else {
        logger.error(`✗ Table '${tableName}' validation failed:`);
        if (tableResult.missingColumns.length > 0) {
          logger.error(`  - Missing columns: ${tableResult.missingColumns.join(', ')}`);
        }
        if (tableResult.missingIndexes.length > 0) {
          logger.error(`  - Missing indexes: ${tableResult.missingIndexes.join(', ')}`);
        }
      }

      if (tableResult.extraColumns.length > 0) {
        logger.warn(`  - Extra columns (not in schema): ${tableResult.extraColumns.join(', ')}`);
      }
    }
  }

  // 打印验证总结
  logger.info('');
  logger.info('Database Schema Validation Summary:');
  logger.info(`  Total tables: ${validationResults.summary.totalTables}`);
  logger.info(`  Valid tables: ${validationResults.summary.validTables}`);
  logger.info(`  Invalid tables: ${validationResults.summary.invalidTables}`);

  if (validationResults.summary.missingTables.length > 0) {
    logger.error(`  Missing tables: ${validationResults.summary.missingTables.join(', ')}`);
  }

  if (validationResults.valid) {
    logger.info('✓ Database schema validation PASSED');
  } else {
    logger.error('✗ Database schema validation FAILED');
    logger.error('  Please run database initialization or migration to fix schema issues');
  }

  return validationResults;
}

/**
 * 生成修复SQL语句（用于辅助调试）
 * @param {Object} validationResults - 验证结果
 * @returns {string} SQL语句
 */
function generateFixSQL(validationResults) {
  const sqlStatements = [];

  for (const [tableName, result] of Object.entries(validationResults.tables)) {
    if (!result.valid) {
      if (result.missingColumns.length === REQUIRED_SCHEMA[tableName].columns.length) {
        sqlStatements.push(`-- Table '${tableName}' is missing, please run schema.sql`);
      } else {
        // 生成ALTER TABLE语句添加缺失的列
        for (const column of result.missingColumns) {
          sqlStatements.push(`ALTER TABLE ${tableName} ADD COLUMN ${column} TEXT;`);
        }
      }

      // 生成CREATE INDEX语句
      for (const index of result.missingIndexes) {
        sqlStatements.push(`-- Missing index: ${index} for table ${tableName}`);
      }
    }
  }

  return sqlStatements.length > 0 ? sqlStatements.join('\n') : '-- No fix needed';
}

module.exports = {
  validateDatabaseSchema,
  validateTable,
  generateFixSQL,
  REQUIRED_SCHEMA,
};
