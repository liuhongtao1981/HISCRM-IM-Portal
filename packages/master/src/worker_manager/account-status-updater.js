/**
 * 账号状态更新器
 * 接收 Worker 上报的账号运行时状态并更新数据库
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('account-status-updater');

class AccountStatusUpdater {
  constructor(db, imWebSocketServer = null) {
    this.db = db;
    this.imWebSocketServer = imWebSocketServer;
  }

  /**
   * 设置 IM WebSocket Server（用于推送状态变更）
   */
  setIMWebSocketServer(imWebSocketServer) {
    this.imWebSocketServer = imWebSocketServer;
    logger.info('✅ IM WebSocket Server injected into AccountStatusUpdater');
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
        login_status,            // 登录状态: logged_in/not_logged_in
        total_comments,          // 总评论数
        total_contents,             // 总作品数
        total_followers,         // 总粉丝数
        total_following,         // 总关注数
        recent_comments_count,   // 最近一次爬取的评论数
        recent_contents_count,      // 最近一次爬取的作品数
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

      if (login_status !== undefined) {
        updateFields.push('login_status = ?');
        values.push(login_status);
      }

      if (total_comments !== undefined) {
        updateFields.push('total_comments = ?');
        values.push(total_comments);
      }

      if (total_contents !== undefined) {
        updateFields.push('total_contents = ?');
        values.push(total_contents);
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

      if (recent_contents_count !== undefined) {
        updateFields.push('recent_contents_count = ?');
        values.push(recent_contents_count);
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

        // ⭐ 推送账户状态变更到 IM 客户端
        this.pushAccountStatusToIM(accountId, status);

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
   * 推送账户状态变更到 IM 客户端
   * @param {string} accountId
   * @param {object} status - 更新的状态数据
   */
  pushAccountStatusToIM(accountId, status) {
    // 如果没有注入 IM WebSocket Server，跳过推送
    if (!this.imWebSocketServer) {
      return;
    }

    // 只有当登录状态或用户信息变更时才推送
    const shouldPush = status.login_status !== undefined ||
                       status.total_followers !== undefined ||
                       status.total_following !== undefined;

    if (!shouldPush) {
      return;
    }

    try {
      // 从数据库获取完整的账户信息（包括头像、昵称等）
      const account = this.db.prepare(`
        SELECT
          id, platform, account_name, login_status, worker_status,
          total_followers, total_following, total_comments, total_contents,
          platform_username, avatar, platform_user_id,
          last_crawl_time, updated_at
        FROM accounts
        WHERE id = ?
      `).get(accountId);

      if (!account) {
        logger.warn(`[Status Push] Account ${accountId} not found in database`);
        return;
      }

      // 构建推送数据（channel 更新格式）
      const channelUpdate = {
        id: account.id,
        platform: account.platform,
        accountName: account.account_name,
        loginStatus: account.login_status,
        workerStatus: account.worker_status,
        // ⭐ 用户信息（包括头像和昵称）
        platformUsername: account.platform_username,
        platformUserId: account.platform_user_id,
        avatar: account.avatar,
        stats: {
          followers: account.total_followers || 0,
          following: account.total_following || 0,
          comments: account.total_comments || 0,
          contents: account.total_contents || 0,
        },
        lastUpdate: account.updated_at,
      };

      // 广播账户状态更新
      this.imWebSocketServer.broadcastToMonitors('channel:status_update', {
        channel: channelUpdate
      });

      logger.info(`[Status Push] ✅ 推送账户状态更新: ${accountId}, login_status=${account.login_status}, worker_status=${account.worker_status}`);

    } catch (error) {
      logger.error(`[Status Push] Failed to push account status for ${accountId}:`, error);
    }
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
