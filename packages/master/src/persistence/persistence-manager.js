/**
 * Persistence Manager - 数据持久化管理器
 * 负责内存数据和数据库之间的同步
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const CacheDAO = require('./cache-dao');
const retentionConfig = require('../config/data-retention');

const logger = createLogger('persistence-manager');

class PersistenceManager {
  constructor(db, dataStore, config = {}) {
    this.db = db;
    this.dataStore = dataStore;
    this.cacheDAO = new CacheDAO(db);

    // 获取环境配置
    const env = process.env.NODE_ENV || 'development';
    const defaultConfig = retentionConfig.getConfig(env);

    // 合并配置
    this.config = {
      persistInterval: config.persistInterval || defaultConfig.persistence.interval,
      changeThreshold: config.changeThreshold || defaultConfig.persistence.changeThreshold,
      batchSize: config.batchSize || defaultConfig.persistence.batchSize,
      loadOnStartup: config.loadOnStartup !== undefined ? config.loadOnStartup : defaultConfig.persistence.loadOnStartup,
      persistOnExit: config.persistOnExit !== undefined ? config.persistOnExit : defaultConfig.persistence.persistOnExit,
      autoCleanup: config.autoCleanup !== undefined ? config.autoCleanup : defaultConfig.advanced.autoCleanup,
      incrementalPersist: config.incrementalPersist !== undefined ? config.incrementalPersist : defaultConfig.advanced.incrementalPersist,
    };

    this.retention = {
      memory: defaultConfig.memory,
      database: defaultConfig.database,
      cleanupInterval: defaultConfig.cleanupInterval,
    };

    // 统计信息
    this.stats = {
      totalPersists: 0,
      lastPersistTime: null,
      lastPersistDuration: 0,
      totalItemsPersisted: 0,
      totalLoads: 0,
      lastLoadTime: null,
      lastLoadDuration: 0,
      totalItemsLoaded: 0,
    };

    // 定时器
    this.persistTimer = null;
    this.cleanupTimers = {};

    // 状态
    this.isStarted = false;
    this.isPersisting = false;
  }

  /**
   * 启动持久化管理器
   */
  async start() {
    if (this.isStarted) {
      logger.warn('PersistenceManager already started');
      return;
    }

    try {
      logger.info('🚀 Starting PersistenceManager...');
      logger.info('Configuration:', {
        persistInterval: `${this.config.persistInterval / 1000}s`,
        changeThreshold: this.config.changeThreshold,
        loadOnStartup: this.config.loadOnStartup,
        autoCleanup: this.config.autoCleanup,
        incrementalPersist: this.config.incrementalPersist,
      });

      // 1. 从数据库加载数据
      if (this.config.loadOnStartup) {
        await this.loadFromDatabase();
      }

      // 2. 启动定时持久化
      this.startPersistTimer();

      // 3. 启动定时清理
      if (this.config.autoCleanup) {
        this.startCleanupTimers();
      }

      // 4. 监听进程退出事件
      if (this.config.persistOnExit) {
        this.setupExitHandler();
      }

      this.isStarted = true;
      logger.info('✅ PersistenceManager started successfully');

    } catch (error) {
      logger.error('❌ Failed to start PersistenceManager:', error);
      throw error;
    }
  }

  /**
   * 停止持久化管理器
   */
  async stop() {
    if (!this.isStarted) {
      logger.warn('PersistenceManager not started');
      return;
    }

    try {
      logger.info('🛑 Stopping PersistenceManager...');

      // 停止定时器
      if (this.persistTimer) {
        clearInterval(this.persistTimer);
        this.persistTimer = null;
      }

      for (const timer of Object.values(this.cleanupTimers)) {
        clearInterval(timer);
      }
      this.cleanupTimers = {};

      // 最后一次持久化
      if (this.config.persistOnExit) {
        await this.persistToDatabase();
      }

      this.isStarted = false;
      logger.info('✅ PersistenceManager stopped');

    } catch (error) {
      logger.error('❌ Error stopping PersistenceManager:', error);
      throw error;
    }
  }

  /**
   * 从数据库加载数据到内存
   */
  async loadFromDatabase() {
    const startTime = Date.now();
    logger.info('📥 Loading data from database...');

    try {
      // 获取所有账户元数据
      const metadataList = this.cacheDAO.getAllMetadata();

      const totalLoaded = {
        accounts: 0,
        comments: 0,
        contents: 0,
        conversations: 0,
        messages: 0,
        notifications: 0,
      };

      for (const metadata of metadataList) {
        const { account_id, platform } = metadata;

        // 加载各类数据
        const comments = this.cacheDAO.getCommentsByAccount(account_id);
        const contents = this.cacheDAO.getContentsByAccount(account_id);
        const conversations = this.cacheDAO.getConversationsByAccount(account_id);
        const messages = this.cacheDAO.getMessagesByAccount(account_id);
        const notifications = this.cacheDAO.getNotificationsByAccount(account_id);

        // 构建快照
        const snapshot = {
          platform,
          data: {
            comments: comments.map(row => JSON.parse(row.data)),
            contents: contents.map(row => JSON.parse(row.data)),
            conversations: conversations.map(row => JSON.parse(row.data)),
            messages: messages.map(row => JSON.parse(row.data)),
            notifications: notifications.map(row => JSON.parse(row.data)),
          },
        };

        // 更新 DataStore
        this.dataStore.updateAccountData(account_id, snapshot);

        // 统计
        totalLoaded.accounts++;
        totalLoaded.comments += comments.length;
        totalLoaded.contents += contents.length;
        totalLoaded.conversations += conversations.length;
        totalLoaded.messages += messages.length;
        totalLoaded.notifications += notifications.length;

        logger.debug(`Loaded account ${account_id}:`, {
          comments: comments.length,
          contents: contents.length,
          conversations: conversations.length,
          messages: messages.length,
          notifications: notifications.length,
        });
      }

      const duration = Date.now() - startTime;

      // 更新统计
      this.stats.totalLoads++;
      this.stats.lastLoadTime = Date.now();
      this.stats.lastLoadDuration = duration;
      this.stats.totalItemsLoaded += Object.values(totalLoaded).reduce((a, b) => a + b, 0) - totalLoaded.accounts;

      logger.info(`✅ Data loaded from database in ${duration}ms:`, totalLoaded);

      // 清空脏标记 (刚加载的数据不需要立即持久化)
      if (this.dataStore.clearDirtyFlags) {
        this.dataStore.clearDirtyFlags();
      }

      return totalLoaded;

    } catch (error) {
      logger.error('❌ Failed to load data from database:', error);
      throw error;
    }
  }

  /**
   * 持久化数据到数据库
   */
  async persistToDatabase() {
    if (this.isPersisting) {
      logger.debug('Persist already in progress, skipping...');
      return { persisted: 0, duration: 0, skipped: true };
    }

    const startTime = Date.now();
    this.isPersisting = true;

    try {
      // 导出快照
      const snapshot = this.config.incrementalPersist && this.dataStore.exportDirtySnapshot
        ? this.dataStore.exportDirtySnapshot()
        : this.dataStore.exportSnapshot();

      const accountIds = Object.keys(snapshot.accounts || {});
      if (accountIds.length === 0) {
        logger.debug('No data to persist');
        return { persisted: 0, duration: 0, accounts: 0 };
      }

      logger.info(`💾 Persisting ${accountIds.length} accounts to database...`);

      const totalPersisted = {
        comments: 0,
        contents: 0,
        conversations: 0,
        messages: 0,
        notifications: 0,
      };

      // 开启事务
      const transaction = this.db.transaction(() => {
        for (const accountId of accountIds) {
          const accountData = snapshot.accounts[accountId];
          const { platform, lastUpdate, data } = accountData;

          // 持久化各类数据
          if (data.comments && data.comments.length > 0) {
            const count = this.cacheDAO.batchUpsertComments(accountId, data.comments);
            totalPersisted.comments += count;
          }

          if (data.contents && data.contents.length > 0) {
            const count = this.cacheDAO.batchUpsertContents(accountId, data.contents);
            totalPersisted.contents += count;
          }

          if (data.conversations && data.conversations.length > 0) {
            const count = this.cacheDAO.batchUpsertConversations(accountId, data.conversations);
            totalPersisted.conversations += count;
          }

          if (data.messages && data.messages.length > 0) {
            const count = this.cacheDAO.batchUpsertMessages(accountId, data.messages);
            totalPersisted.messages += count;
          }

          if (data.notifications && data.notifications.length > 0) {
            const count = this.cacheDAO.batchUpsertNotifications(accountId, data.notifications);
            totalPersisted.notifications += count;
          }

          // 更新元数据
          this.cacheDAO.upsertMetadata({
            account_id: accountId,
            platform,
            last_update: lastUpdate || Date.now(),
            last_persist: Date.now(),
            comments_count: data.comments?.length || 0,
            contents_count: data.contents?.length || 0,
            conversations_count: data.conversations?.length || 0,
            messages_count: data.messages?.length || 0,
            notifications_count: data.notifications?.length || 0,
          });
        }
      });

      // 执行事务
      transaction();

      // 清空脏标记
      if (this.config.incrementalPersist && this.dataStore.clearDirtyFlags) {
        this.dataStore.clearDirtyFlags();
      }

      const duration = Date.now() - startTime;

      // 更新统计
      this.stats.totalPersists++;
      this.stats.lastPersistTime = Date.now();
      this.stats.lastPersistDuration = duration;
      this.stats.totalItemsPersisted += Object.values(totalPersisted).reduce((a, b) => a + b, 0);

      logger.info(`✅ Persist completed in ${duration}ms:`, totalPersisted);

      return {
        success: true,
        persisted: Object.values(totalPersisted).reduce((a, b) => a + b, 0),
        duration,
        accounts: accountIds.length,
        details: totalPersisted,
      };

    } catch (error) {
      logger.error('❌ Failed to persist data:', error);
      return {
        success: false,
        error: error.message,
        persisted: 0,
        duration: Date.now() - startTime,
      };
    } finally {
      this.isPersisting = false;
    }
  }

  /**
   * 清理过期数据
   */
  async cleanExpiredData(dataType) {
    const startTime = Date.now();

    try {
      const memoryRetention = this.retention.memory[dataType];
      const dbRetention = this.retention.database[dataType];

      const now = Date.now();
      const memoryExpireTime = memoryRetention > 0 ? now - memoryRetention : 0;
      const dbExpireTime = dbRetention > 0 ? now - dbRetention : 0;

      logger.info(`🧹 Cleaning expired ${dataType}...`, {
        memoryRetention: retentionConfig.formatTime(memoryRetention),
        dbRetention: retentionConfig.formatTime(dbRetention),
      });

      // 清理内存
      let memoryDeleted = 0;
      if (memoryExpireTime > 0 && this.dataStore.cleanExpiredData) {
        memoryDeleted = this.dataStore.cleanExpiredData(dataType, memoryExpireTime);
      }

      // 清理数据库
      let dbDeleted = 0;
      if (dbExpireTime > 0) {
        const cleanMethod = `cleanExpired${dataType.charAt(0).toUpperCase() + dataType.slice(1)}`;
        if (this.cacheDAO[cleanMethod]) {
          dbDeleted = this.cacheDAO[cleanMethod](dbExpireTime);
        }
      }

      const duration = Date.now() - startTime;

      logger.info(`✅ Cleanup completed in ${duration}ms:`, {
        dataType,
        memoryDeleted,
        dbDeleted,
      });

      return { memoryDeleted, dbDeleted, duration };

    } catch (error) {
      logger.error(`❌ Failed to clean expired ${dataType}:`, error);
      throw error;
    }
  }

  /**
   * 启动定时持久化
   */
  startPersistTimer() {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
    }

    this.persistTimer = setInterval(async () => {
      try {
        await this.persistToDatabase();
      } catch (error) {
        logger.error('Persist timer error:', error);
      }
    }, this.config.persistInterval);

    logger.info(`⏰ Persist timer started (interval: ${this.config.persistInterval / 1000}s)`);
  }

  /**
   * 启动定时清理
   */
  startCleanupTimers() {
    const dataTypes = ['comments', 'contents', 'conversations', 'messages', 'notifications'];

    for (const dataType of dataTypes) {
      const interval = this.retention.cleanupInterval[dataType];

      if (this.cleanupTimers[dataType]) {
        clearInterval(this.cleanupTimers[dataType]);
      }

      this.cleanupTimers[dataType] = setInterval(async () => {
        try {
          await this.cleanExpiredData(dataType);
        } catch (error) {
          logger.error(`Cleanup timer error (${dataType}):`, error);
        }
      }, interval);

      logger.info(`⏰ Cleanup timer started for ${dataType} (interval: ${retentionConfig.formatTime(interval)})`);
    }
  }

  /**
   * 设置退出处理器
   */
  setupExitHandler() {
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, performing graceful shutdown...`);

      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    // 只在第一次设置时绑定事件
    if (!this.exitHandlerSet) {
      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
      this.exitHandlerSet = true;
      logger.info('📌 Exit handlers registered');
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const dbStats = this.cacheDAO.getStatistics();
    const dataStoreStats = this.dataStore.getStats();

    return {
      persistence: {
        ...this.stats,
        isStarted: this.isStarted,
        isPersisting: this.isPersisting,
      },
      database: dbStats,
      dataStore: dataStoreStats,
      config: {
        persistInterval: this.config.persistInterval,
        changeThreshold: this.config.changeThreshold,
        loadOnStartup: this.config.loadOnStartup,
        persistOnExit: this.config.persistOnExit,
        autoCleanup: this.config.autoCleanup,
        incrementalPersist: this.config.incrementalPersist,
      },
    };
  }
}

module.exports = PersistenceManager;
