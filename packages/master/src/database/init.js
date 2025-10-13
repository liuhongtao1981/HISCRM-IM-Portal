const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const logger = require('@hiscrm-im/shared/utils/logger');

/**
 * 初始化主控数据库
 * @param {string} dbPath - 数据库文件路径
 * @returns {Database} SQLite数据库实例
 */
function initDatabase(dbPath = './data/master.db') {
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

    logger.info(`Database opened: ${dbPath}`);

    // 执行schema.sql创建表
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);

    logger.info('Database schema initialized successfully');

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
