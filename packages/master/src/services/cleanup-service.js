/**
 * Data Cleanup Service
 * T088: 定期清理过期数据(30天保留策略)
 *
 * Purpose: 自动清理超过30天的历史消息和通知,防止数据库无限增长
 */

const cron = require('node-cron');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const CommentsDAO = require('../database/comments-dao');
const DirectMessagesDAO = require('../database/messages-dao');
const NotificationsDAO = require('../database/notifications-dao');

const logger = createLogger('cleanup-service');

class CleanupService {
  /**
   * 创建数据清理服务
   * @param {Database} db - SQLite数据库实例
   * @param {Object} options - 配置选项
   * @param {number} options.retentionDays - 数据保留天数(默认30天)
   * @param {string} options.schedule - Cron调度表达式(默认每天凌晨2点)
   */
  constructor(db, options = {}) {
    this.db = db;
    this.retentionDays = options.retentionDays || 30;
    this.schedule = options.schedule || '0 2 * * *'; // 每天凌晨2点
    this.isRunning = false;
    this.task = null;

    this.commentsDAO = new CommentsDAO(db);
    this.messagesDAO = new DirectMessagesDAO(db);
    this.notificationsDAO = new NotificationsDAO(db);

    logger.info(`Cleanup service initialized (retention: ${this.retentionDays} days, schedule: ${this.schedule})`);
  }

  /**
   * 启动定时清理任务
   */
  start() {
    if (this.isRunning) {
      logger.warn('Cleanup service is already running');
      return;
    }

    this.task = cron.schedule(this.schedule, async () => {
      await this.runCleanup();
    });

    this.isRunning = true;
    logger.info('Cleanup service started');
  }

  /**
   * 停止定时清理任务
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Cleanup service is not running');
      return;
    }

    if (this.task) {
      this.task.stop();
      this.task = null;
    }

    this.isRunning = false;
    logger.info('Cleanup service stopped');
  }

  /**
   * 执行数据清理
   * @returns {Object} 清理结果统计
   */
  async runCleanup() {
    const startTime = Date.now();
    logger.info('Starting data cleanup...');

    try {
      const cutoffTimestamp = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);

      // 清理评论
      const deletedComments = this.cleanupComments(cutoffTimestamp);

      // 清理私信
      const deletedMessages = this.cleanupDirectMessages(cutoffTimestamp);

      // 清理通知
      const deletedNotifications = this.cleanupNotifications(cutoffTimestamp);

      // 优化数据库
      this.vacuumDatabase();

      const duration = Date.now() - startTime;
      const result = {
        timestamp: Date.now(),
        duration,
        deletedComments,
        deletedMessages,
        deletedNotifications,
        totalDeleted: deletedComments + deletedMessages + deletedNotifications,
      };

      logger.info(`Data cleanup completed in ${duration}ms`, result);
      return result;
    } catch (error) {
      logger.error('Data cleanup failed:', error);
      throw error;
    }
  }

  /**
   * 清理过期评论
   * @param {number} cutoffTimestamp - 截止时间戳
   * @returns {number} 删除的记录数
   */
  cleanupComments(cutoffTimestamp) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM comments
        WHERE detected_at < ?
      `);

      const result = stmt.run(cutoffTimestamp);
      logger.info(`Deleted ${result.changes} expired comments (before ${new Date(cutoffTimestamp).toISOString()})`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup comments:', error);
      return 0;
    }
  }

  /**
   * 清理过期私信
   * @param {number} cutoffTimestamp - 截止时间戳
   * @returns {number} 删除的记录数
   */
  cleanupDirectMessages(cutoffTimestamp) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM direct_messages
        WHERE detected_at < ?
      `);

      const result = stmt.run(cutoffTimestamp);
      logger.info(`Deleted ${result.changes} expired direct messages (before ${new Date(cutoffTimestamp).toISOString()})`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup direct messages:', error);
      return 0;
    }
  }

  /**
   * 清理过期通知
   * @param {number} cutoffTimestamp - 截止时间戳
   * @returns {number} 删除的记录数
   */
  cleanupNotifications(cutoffTimestamp) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM notifications
        WHERE created_at < ?
      `);

      const result = stmt.run(cutoffTimestamp);
      logger.info(`Deleted ${result.changes} expired notifications (before ${new Date(cutoffTimestamp).toISOString()})`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup notifications:', error);
      return 0;
    }
  }

  /**
   * 优化数据库(回收已删除记录的空间)
   */
  vacuumDatabase() {
    try {
      logger.info('Running VACUUM to optimize database...');
      const startTime = Date.now();

      this.db.prepare('VACUUM').run();

      const duration = Date.now() - startTime;
      logger.info(`Database VACUUM completed in ${duration}ms`);
    } catch (error) {
      logger.error('Failed to vacuum database:', error);
    }
  }

  /**
   * 手动触发清理(用于测试或按需清理)
   * @returns {Object} 清理结果统计
   */
  async manualCleanup() {
    logger.info('Manual cleanup triggered');
    return await this.runCleanup();
  }

  /**
   * 获取数据库大小统计
   * @returns {Object} 数据库统计信息
   */
  getDatabaseStats() {
    try {
      const stats = {
        comments: this.db.prepare('SELECT COUNT(*) as count FROM comments').get().count,
        directMessages: this.db.prepare('SELECT COUNT(*) as count FROM direct_messages').get().count,
        notifications: this.db.prepare('SELECT COUNT(*) as count FROM notifications').get().count,
        accounts: this.db.prepare('SELECT COUNT(*) as count FROM accounts').get().count,
      };

      // 获取数据库文件大小(仅SQLite)
      const dbSizeQuery = this.db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()');
      const dbSize = dbSizeQuery.get();
      stats.databaseSizeBytes = dbSize.size;
      stats.databaseSizeMB = (dbSize.size / (1024 * 1024)).toFixed(2);

      // 获取最老的记录时间
      const oldestComment = this.db.prepare('SELECT MIN(detected_at) as oldest FROM comments').get();
      const oldestMessage = this.db.prepare('SELECT MIN(detected_at) as oldest FROM direct_messages').get();

      stats.oldestCommentTimestamp = oldestComment.oldest;
      stats.oldestMessageTimestamp = oldestMessage.oldest;

      if (oldestComment.oldest) {
        stats.oldestCommentDate = new Date(oldestComment.oldest).toISOString();
      }
      if (oldestMessage.oldest) {
        stats.oldestMessageDate = new Date(oldestMessage.oldest).toISOString();
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get database stats:', error);
      return null;
    }
  }

  /**
   * 获取清理服务状态
   * @returns {Object} 服务状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      retentionDays: this.retentionDays,
      schedule: this.schedule,
      nextRunTimestamp: this.task ? this.task.nextDate() : null,
      databaseStats: this.getDatabaseStats(),
    };
  }
}

module.exports = CleanupService;
