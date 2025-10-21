const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { validateDatabaseSchema, generateFixSQL } = require('./schema-validator');

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

    // 执行schema.sql创建表
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);

    logger.info('Database schema initialized successfully');

    // 执行迁移脚本
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort(); // 按文件名排序执行

      for (const file of migrationFiles) {
        const migrationPath = path.join(migrationsDir, file);
        const migration = fs.readFileSync(migrationPath, 'utf8');
        try {
          db.exec(migration);
          logger.info(`Executed migration: ${file}`);
        } catch (error) {
          logger.warn(`Migration ${file} failed (may already be applied): ${error.message}`);
        }
      }
    }

    // 验证数据库结构
    if (validateSchema) {
      logger.info('Validating database schema...');
      const validationResult = validateDatabaseSchema(db);

      if (!validationResult.valid) {
        logger.error('Database schema validation failed!');

        // 生成修复SQL建议
        const fixSQL = generateFixSQL(validationResult);
        if (fixSQL !== '-- No fix needed') {
          logger.error('Suggested fix SQL:');
          logger.error(fixSQL);
        }

        if (strictValidation) {
          throw new Error(
            'Database schema validation failed. Please check schema.sql and ensure all tables/columns are defined correctly.'
          );
        } else {
          logger.warn('Schema validation failed but continuing due to non-strict mode');
        }
      } else {
        logger.info('Database schema validation passed ✓');
      }
    }

    return db;
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
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
};
