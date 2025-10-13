/**
 * Statistics Service
 * T083: 统计数据计算服务
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('statistics-service');

class StatisticsService {
  constructor(db) {
    this.db = db;
  }

  /**
   * 获取总体统计信息
   * @param {Object} filters - 过滤条件
   * @param {string} filters.account_id - 账户ID
   * @param {number} filters.start_time - 开始时间
   * @param {number} filters.end_time - 结束时间
   * @returns {Object} 统计信息
   */
  getOverallStatistics(filters = {}) {
    try {
      const { account_id, start_time, end_time } = filters;

      // 构建 WHERE 条件
      const conditions = [];
      const params = [];

      if (account_id) {
        conditions.push('account_id = ?');
        params.push(account_id);
      }

      if (start_time) {
        conditions.push('detected_at >= ?');
        params.push(start_time);
      }

      if (end_time) {
        conditions.push('detected_at <= ?');
        params.push(end_time);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // 统计评论数量
      const commentStats = this.db
        .prepare(
          `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
        FROM comments
        ${whereClause}
      `
        )
        .get(...params);

      // 统计私信数量
      const dmStats = this.db
        .prepare(
          `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
        FROM direct_messages
        ${whereClause}
      `
        )
        .get(...params);

      // 按账户统计
      const accountStats = this.getAccountStatistics(filters);

      return {
        total_comments: commentStats.total || 0,
        total_direct_messages: dmStats.total || 0,
        total_messages: (commentStats.total || 0) + (dmStats.total || 0),
        unread_count: (commentStats.unread || 0) + (dmStats.unread || 0),
        accounts: accountStats,
      };
    } catch (error) {
      logger.error('Failed to get overall statistics:', error);
      throw error;
    }
  }

  /**
   * 按账户统计
   * @param {Object} filters - 过滤条件
   * @returns {Array} 账户统计列表
   */
  getAccountStatistics(filters = {}) {
    try {
      const { account_id, start_time, end_time } = filters;

      const conditions = [];
      const params = [];

      if (account_id) {
        conditions.push('account_id = ?');
        params.push(account_id);
      }

      if (start_time) {
        conditions.push('detected_at >= ?');
        params.push(start_time);
      }

      if (end_time) {
        conditions.push('detected_at <= ?');
        params.push(end_time);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // 按账户统计评论
      const commentsByAccount = this.db
        .prepare(
          `
        SELECT
          account_id,
          COUNT(*) as comment_count,
          SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_comments
        FROM comments
        ${whereClause}
        GROUP BY account_id
      `
        )
        .all(...params);

      // 按账户统计私信
      const dmsByAccount = this.db
        .prepare(
          `
        SELECT
          account_id,
          COUNT(*) as dm_count,
          SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_dms
        FROM direct_messages
        ${whereClause}
        GROUP BY account_id
      `
        )
        .all(...params);

      // 合并统计结果
      const accountMap = new Map();

      for (const row of commentsByAccount) {
        accountMap.set(row.account_id, {
          account_id: row.account_id,
          comment_count: row.comment_count || 0,
          direct_message_count: 0,
          unread_comments: row.unread_comments || 0,
          unread_dms: 0,
        });
      }

      for (const row of dmsByAccount) {
        if (accountMap.has(row.account_id)) {
          const stats = accountMap.get(row.account_id);
          stats.direct_message_count = row.dm_count || 0;
          stats.unread_dms = row.unread_dms || 0;
        } else {
          accountMap.set(row.account_id, {
            account_id: row.account_id,
            comment_count: 0,
            direct_message_count: row.dm_count || 0,
            unread_comments: 0,
            unread_dms: row.unread_dms || 0,
          });
        }
      }

      return Array.from(accountMap.values());
    } catch (error) {
      logger.error('Failed to get account statistics:', error);
      throw error;
    }
  }

  /**
   * 获取每日统计趋势
   * @param {Object} filters - 过滤条件
   * @param {number} filters.days - 统计天数（默认7天）
   * @returns {Array} 每日统计数据
   */
  getDailyStatistics(filters = {}) {
    try {
      const { account_id, days = 7 } = filters;

      const now = Math.floor(Date.now() / 1000);
      const startTime = now - days * 86400;

      const conditions = ['detected_at >= ?'];
      const params = [startTime];

      if (account_id) {
        conditions.push('account_id = ?');
        params.push(account_id);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      // 按日统计评论
      const commentsByDay = this.db
        .prepare(
          `
        SELECT
          DATE(detected_at, 'unixepoch') as date,
          COUNT(*) as count
        FROM comments
        ${whereClause}
        GROUP BY DATE(detected_at, 'unixepoch')
        ORDER BY date DESC
      `
        )
        .all(...params);

      // 按日统计私信
      const dmsByDay = this.db
        .prepare(
          `
        SELECT
          DATE(detected_at, 'unixepoch') as date,
          COUNT(*) as count
        FROM direct_messages
        ${whereClause}
        GROUP BY DATE(detected_at, 'unixepoch')
        ORDER BY date DESC
      `
        )
        .all(...params);

      // 合并结果
      const dailyMap = new Map();

      for (const row of commentsByDay) {
        dailyMap.set(row.date, {
          date: row.date,
          comment_count: row.count,
          dm_count: 0,
        });
      }

      for (const row of dmsByDay) {
        if (dailyMap.has(row.date)) {
          dailyMap.get(row.date).dm_count = row.count;
        } else {
          dailyMap.set(row.date, {
            date: row.date,
            comment_count: 0,
            dm_count: row.count,
          });
        }
      }

      return Array.from(dailyMap.values()).map((stat) => ({
        ...stat,
        total: stat.comment_count + stat.dm_count,
      }));
    } catch (error) {
      logger.error('Failed to get daily statistics:', error);
      throw error;
    }
  }

  /**
   * 获取每小时统计（活跃时段分析）
   * @param {Object} filters - 过滤条件
   * @returns {Array} 每小时统计数据
   */
  getHourlyStatistics(filters = {}) {
    try {
      const { account_id, start_time, end_time } = filters;

      const conditions = [];
      const params = [];

      if (account_id) {
        conditions.push('account_id = ?');
        params.push(account_id);
      }

      if (start_time) {
        conditions.push('detected_at >= ?');
        params.push(start_time);
      }

      if (end_time) {
        conditions.push('detected_at <= ?');
        params.push(end_time);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // 按小时统计
      const hourlyStats = this.db
        .prepare(
          `
        SELECT
          CAST(strftime('%H', datetime(detected_at, 'unixepoch')) AS INTEGER) as hour,
          COUNT(*) as count
        FROM (
          SELECT detected_at FROM comments ${whereClause}
          UNION ALL
          SELECT detected_at FROM direct_messages ${whereClause}
        )
        GROUP BY hour
        ORDER BY hour
      `
        )
        .all(...params, ...params);

      return hourlyStats;
    } catch (error) {
      logger.error('Failed to get hourly statistics:', error);
      throw error;
    }
  }

  /**
   * 获取简要统计信息
   * @returns {Object} 简要统计
   */
  getSummary() {
    try {
      const now = Math.floor(Date.now() / 1000);
      const today = now - (now % 86400);

      // 总消息数
      const totalMessages =
        this.db.prepare('SELECT COUNT(*) as count FROM comments').get().count +
        this.db.prepare('SELECT COUNT(*) as count FROM direct_messages').get().count;

      // 未读数量
      const unreadCount =
        this.db.prepare('SELECT COUNT(*) as count FROM comments WHERE is_read = 0').get().count +
        this.db.prepare('SELECT COUNT(*) as count FROM direct_messages WHERE is_read = 0').get()
          .count;

      // 今天的消息数
      const todayCount =
        this.db
          .prepare('SELECT COUNT(*) as count FROM comments WHERE detected_at >= ?')
          .get(today).count +
        this.db
          .prepare('SELECT COUNT(*) as count FROM direct_messages WHERE detected_at >= ?')
          .get(today).count;

      return {
        total_messages: totalMessages,
        unread_count: unreadCount,
        today_count: todayCount,
      };
    } catch (error) {
      logger.error('Failed to get summary:', error);
      throw error;
    }
  }
}

module.exports = StatisticsService;
