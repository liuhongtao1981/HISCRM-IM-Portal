/**
 * 账号状态更新器
 * 接收 Worker 上报的账号运行时状态并更新数据库
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('account-status-updater');

class AccountStatusUpdater {
  constructor(db) {
    this.db = db;
  }

  /**
   * 更新账号运行时状态
   * @param {string} accountId - 账号 ID
   * @param {object} status - 状态数据
   * @returns {boolean} 是否更新成功
   */
  updateAccountStatus(accountId, status) {
    try {
      const {
        worker_status,           // Worker 状态: online/offline/error
        total_comments,          // 总评论数
        total_works,             // 总作品数
        total_followers,         // 总粉丝数
        total_following,         // 总关注数
        recent_comments_count,   // 最近一次爬取的评论数
        recent_works_count,      // 最近一次爬取的作品数
        last_crawl_time,         // 最后一次爬取时间（秒级时间戳）
        last_heartbeat_time,     // 最后一次心跳时间
        error_count,             // 错误计数
        last_error_message,      // 最后的错误信息
      } = status;

      const now = Math.floor(Date.now() / 1000);

      // 构建动态更新 SQL
      const updateFields = [];
      const values = [];

      if (worker_status !== undefined) {
        updateFields.push('worker_status = ?');
        values.push(worker_status);
      }

      if (total_comments !== undefined) {
        updateFields.push('total_comments = ?');
        values.push(total_comments);
      }

      if (total_works !== undefined) {
        updateFields.push('total_works = ?');
        values.push(total_works);
      }

      if (total_followers !== undefined) {
        updateFields.push('total_followers = ?');
        values.push(total_followers);
      }

      if (total_following !== undefined) {
        updateFields.push('total_following = ?');
        values.push(total_following);
      }

      if (recent_comments_count !== undefined) {
        updateFields.push('recent_comments_count = ?');
        values.push(recent_comments_count);
      }

      if (recent_works_count !== undefined) {
        updateFields.push('recent_works_count = ?');
        values.push(recent_works_count);
      }

      if (last_crawl_time !== undefined) {
        updateFields.push('last_crawl_time = ?');
        values.push(last_crawl_time);
      }

      if (last_heartbeat_time !== undefined) {
        updateFields.push('last_heartbeat_time = ?');
        values.push(last_heartbeat_time);
      }

      if (error_count !== undefined) {
        updateFields.push('error_count = ?');
        values.push(error_count);
      }

      if (last_error_message !== undefined) {
        updateFields.push('last_error_message = ?');
        values.push(last_error_message);
      }

      // 始终更新 updated_at
      updateFields.push('updated_at = ?');
      values.push(now);

      // 添加 WHERE 条件的 accountId
      values.push(accountId);

      if (updateFields.length === 0) {
        logger.warn(`No fields to update for account ${accountId}`);
        return false;
      }

      const sql = `UPDATE accounts SET ${updateFields.join(', ')} WHERE id = ?`;

      const result = this.db.prepare(sql).run(...values);

      if (result.changes > 0) {
        logger.debug(`Account ${accountId} status updated: ${JSON.stringify(status)}`);
        return true;
      } else {
        logger.warn(`Account ${accountId} not found or not updated`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to update account ${accountId} status:`, error);
      return false;
    }
  }

  /**
   * 批量更新多个账号状态
   * @param {Array<{account_id: string, status: object}>} accountStatuses
   * @returns {object} 更新结果统计
   */
  batchUpdateAccountStatuses(accountStatuses) {
    let successCount = 0;
    let failureCount = 0;

    for (const { account_id, status } of accountStatuses) {
      if (this.updateAccountStatus(account_id, status)) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    logger.info(`Batch update completed: ${successCount} succeeded, ${failureCount} failed`);

    return { successCount, failureCount, total: accountStatuses.length };
  }

  /**
   * 设置账号为在线状态
   * @param {string} accountId
   */
  setAccountOnline(accountId) {
    const now = Math.floor(Date.now() / 1000);
    this.updateAccountStatus(accountId, {
      worker_status: 'online',
      last_heartbeat_time: now,
    });
  }

  /**
   * 设置账号为离线状态
   * @param {string} accountId
   */
  setAccountOffline(accountId) {
    this.updateAccountStatus(accountId, {
      worker_status: 'offline',
    });
  }

  /**
   * 设置账号为错误状态
   * @param {string} accountId
   * @param {string} errorMessage
   */
  setAccountError(accountId, errorMessage) {
    const now = Math.floor(Date.now() / 1000);
    this.updateAccountStatus(accountId, {
      worker_status: 'error',
      error_count: this.db.prepare('SELECT error_count FROM accounts WHERE id = ?').get(accountId)?.error_count + 1 || 1,
      last_error_message: errorMessage,
      last_heartbeat_time: now,
    });
  }
}

module.exports = AccountStatusUpdater;
