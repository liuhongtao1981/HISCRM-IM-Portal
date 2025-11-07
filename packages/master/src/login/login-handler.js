/**
 * LoginHandler - 登录会话管理器
 * 负责处理账户登录流程:
 * 1. 创建登录会话
 * 2. 接收 Worker 发来的 QR 码
 * 3. 推送 QR 码给管理员
 * 4. 处理登录成功/失败
 * 5. 更新账户登录状态
 */

const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('login-handler');

class LoginHandler {
  /**
   * @param {Database} db - SQLite 数据库实例
   * @param {Object} adminNamespace - Admin Socket.IO namespace
   * @param {Object} workerNamespace - Worker Socket.IO namespace（可选）
   * @param {Object} workerRegistry - Worker 注册表（用于查找 Worker socket）
   */
  constructor(db, adminNamespace, workerNamespace = null, workerRegistry = null) {
    this.db = db;
    this.adminNamespace = adminNamespace;
    this.workerNamespace = workerNamespace;
    this.workerRegistry = workerRegistry;

    // 登录会话缓存 (sessionId -> session)
    this.sessions = new Map();
  }

  /**
   * 创建登录会话
   * @param {string} accountId - 账户ID
   * @param {string} workerId - Worker ID
   * @param {string} loginMethod - 登录方法 (qrcode | password | cookie)
   * @returns {Object} 登录会话对象
   */
  createLoginSession(accountId, workerId, loginMethod = 'qrcode') {
    try {
      const sessionId = uuidv4();
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + 300; // QR码有效期: 5分钟

      // 插入数据库
      const stmt = this.db.prepare(`
        INSERT INTO login_sessions (
          id, account_id, worker_id, status, login_method, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(sessionId, accountId, workerId, 'pending', loginMethod, expiresAt, now);

      const session = {
        id: sessionId,
        account_id: accountId,
        worker_id: workerId,
        status: 'pending',
        login_method: loginMethod,
        expires_at: expiresAt,
        created_at: now,
      };

      // 缓存会话
      this.sessions.set(sessionId, session);

      logger.info(`Login session created: ${sessionId} for account ${accountId}`);
      return session;

    } catch (error) {
      logger.error('Failed to create login session:', error);
      throw error;
    }
  }

  /**
   * 处理 Worker 发来的 QR 码
   * @param {string} sessionId - 会话ID
   * @param {string} qrCodeData - Base64 编码的 QR 码图片
   * @param {string} qrCodeUrl - 抖音 QR 码 URL (可选)
   */
  handleQRCodeReady(sessionId, qrCodeData, qrCodeUrl = null) {
    try {
      const session = this.getSession(sessionId);
      if (!session) {
        logger.warn(`Session not found: ${sessionId}`);
        return;
      }

      // 更新数据库
      const stmt = this.db.prepare(`
        UPDATE login_sessions
        SET qr_code_data = ?, qr_code_url = ?, status = 'scanning'
        WHERE id = ?
      `);

      stmt.run(qrCodeData, qrCodeUrl, sessionId);

      // 更新缓存
      session.qr_code_data = qrCodeData;
      session.qr_code_url = qrCodeUrl;
      session.status = 'scanning';

      logger.info(`QR code ready for session ${sessionId}`);

      // 推送给所有管理员客户端
      if (this.adminNamespace) {
        this.adminNamespace.emit('login:qrcode:ready', {
          session_id: sessionId,
          account_id: session.account_id,
          worker_id: session.worker_id,
          qr_code_data: qrCodeData,
          qr_code_url: qrCodeUrl,
          expires_at: session.expires_at,
          timestamp: Date.now(),
        });
        logger.info(`QR code broadcasted to admin clients for session ${sessionId}`);
      }

    } catch (error) {
      logger.error('Failed to handle QR code:', error);
    }
  }

  /**
   * 处理登录成功
   * @param {string} sessionId - 会话ID
   * @param {Object} cookies - 登录后的 cookies 数组 (可选)
   * @param {number} cookiesValidUntil - Cookies 有效期时间戳 (可选)
   * @param {string} realAccountId - 从平台获取的真实账户ID (可选)
   * @param {Object} userInfo - 用户信息 (昵称、头像、抖音号等) (可选)
   * @param {Object} fingerprint - 浏览器指纹配置 (可选)
   */
  handleLoginSuccess(sessionId, cookies = null, cookiesValidUntil = null, realAccountId = null, userInfo = null, fingerprint = null) {
    try {
      const session = this.getSession(sessionId);
      if (!session) {
        logger.warn(`Session not found: ${sessionId}`);
        return;
      }

      const now = Math.floor(Date.now() / 1000);

      // 更新登录会话状态
      const sessionStmt = this.db.prepare(`
        UPDATE login_sessions
        SET status = 'success', logged_in_at = ?
        WHERE id = ?
      `);
      sessionStmt.run(now, sessionId);

      // 检查当前账户ID是否为临时ID
      const account = this.db.prepare(`SELECT account_id FROM accounts WHERE id = ?`).get(session.account_id);
      const isTemporaryId = account && account.account_id.startsWith('temp_');

      // 构建更新 SQL
      let updateSql = `
        UPDATE accounts
        SET login_status = 'logged_in',
            last_login_time = ?,
            cookies_valid_until = ?,
            credentials = ?,
            user_info = ?,
            fingerprint = ?
      `;

      const params = [
        now,
        cookiesValidUntil || now + 86400 * 7,
        cookies ? JSON.stringify({ cookies }) : '{}',
        userInfo ? JSON.stringify(userInfo) : null,
        fingerprint ? JSON.stringify(fingerprint) : null,
      ];

      // 🔑 从 userInfo 中提取 platform_user_id (抖音号/uid)，仅在为空时更新
      if (userInfo && (userInfo.douyin_id || userInfo.uid)) {
        const currentAccount = this.db.prepare('SELECT platform_user_id FROM accounts WHERE id = ?').get(session.account_id);

        // 只在当前 platform_user_id 为空时才更新，避免重复登录时的冲突
        if (!currentAccount || !currentAccount.platform_user_id) {
          updateSql += ', platform_user_id = ?';
          const platformUserId = userInfo.douyin_id || userInfo.uid;
          params.push(platformUserId);
          logger.info(`Updated platform_user_id to: ${platformUserId}`);
        } else {
          logger.info(`platform_user_id already set to: ${currentAccount.platform_user_id}, skipping update`);
        }
      }

      // 如果提供了真实ID且当前是临时ID，则更新 account_id
      if (realAccountId && isTemporaryId) {
        updateSql += ', account_id = ?';
        params.push(realAccountId);
        logger.info(`Updating temporary account_id to real ID: ${account.account_id} -> ${realAccountId}`);
      }

      updateSql += ' WHERE id = ?';
      params.push(session.account_id);

      const accountStmt = this.db.prepare(updateSql);
      accountStmt.run(...params);

      // 更新缓存
      session.status = 'success';
      session.logged_in_at = now;

      logger.info(`Login success for session ${sessionId}, account ${session.account_id}`);
      logger.info(`Saved: ${cookies ? cookies.length : 0} cookies, user_info: ${userInfo ? userInfo.nickname || 'unknown' : 'null'}, fingerprint: ${fingerprint ? 'yes' : 'no'}`);

      // 推送给管理员
      if (this.adminNamespace) {
        this.adminNamespace.emit('login:success', {
          session_id: sessionId,
          account_id: session.account_id,
          worker_id: session.worker_id,
          logged_in_at: now,
          user_info: userInfo,  // 包含用户信息
          timestamp: Date.now(),
        });
      }

      // ⭐ 新增：通知Worker账户配置已更新
      // 这样Worker可以重新加载账户配置，获取最新的platform_user_id
      if (this.workerRegistry) {
        const { MASTER_ACCOUNT_CONFIG_UPDATE, createMessage } = require('@hiscrm-im/shared/protocol/messages');

        // 通过 WorkerRegistry 找到Worker的socket连接
        const workerSocket = this.workerRegistry.workerSockets.get(session.worker_id);
        if (workerSocket) {
          const configUpdateMessage = createMessage(MASTER_ACCOUNT_CONFIG_UPDATE, {
            account_id: session.account_id,
            reason: 'login_success',
            updated_fields: ['platform_user_id', 'login_status', 'user_info'],
          });

          workerSocket.emit('message', configUpdateMessage);
          logger.info(`✅ Sent config update notification to Worker ${session.worker_id} for account ${session.account_id}`);
        } else {
          logger.warn(`⚠️  Worker socket not found for worker_id ${session.worker_id}, cannot send config update`);
        }
      }

      // 清理会话缓存（登录成功后不再需要）
      this.sessions.delete(sessionId);

    } catch (error) {
      logger.error('Failed to handle login success:', error);
    }
  }

  /**
   * 处理登录失败
   * @param {string} sessionId - 会话ID
   * @param {string} errorMessage - 错误信息
   * @param {string} errorType - 错误类型 (可选)
   */
  handleLoginFailed(sessionId, errorMessage, errorType = 'unknown_error') {
    try {
      const session = this.getSession(sessionId);
      if (!session) {
        logger.warn(`Session not found: ${sessionId}`);
        return;
      }

      // 更新登录会话状态
      const sessionStmt = this.db.prepare(`
        UPDATE login_sessions
        SET status = 'failed', error_message = ?
        WHERE id = ?
      `);
      sessionStmt.run(errorMessage, sessionId);

      // 更新账户登录状态
      const accountStmt = this.db.prepare(`
        UPDATE accounts
        SET login_status = 'login_failed'
        WHERE id = ?
      `);
      accountStmt.run(session.account_id);

      // 更新缓存
      session.status = 'failed';
      session.error_message = errorMessage;

      logger.warn(`Login failed for session ${sessionId} [${errorType}]: ${errorMessage}`);

      // 推送给管理员
      if (this.adminNamespace) {
        this.adminNamespace.emit('login:failed', {
          session_id: sessionId,
          account_id: session.account_id,
          worker_id: session.worker_id,
          error_message: errorMessage,
          error_type: errorType,
          timestamp: Date.now(),
        });
      }

      // 清理会话缓存
      this.sessions.delete(sessionId);

    } catch (error) {
      logger.error('Failed to handle login failure:', error);
    }
  }

  /**
   * 处理二维码刷新
   * @param {string} sessionId - 会话ID
   * @param {string} qrCodeData - Base64 编码的新 QR 码图片
   * @param {number} refreshCount - 刷新次数
   */
  handleQRCodeRefreshed(sessionId, qrCodeData, refreshCount = 0) {
    try {
      const session = this.getSession(sessionId);
      if (!session) {
        logger.warn(`Session not found: ${sessionId}`);
        return;
      }

      // 更新数据库中的二维码数据
      const stmt = this.db.prepare(`
        UPDATE login_sessions
        SET qr_code_data = ?
        WHERE id = ?
      `);
      stmt.run(qrCodeData, sessionId);

      // 更新缓存
      session.qr_code_data = qrCodeData;

      logger.info(`QR code refreshed for session ${sessionId} (count: ${refreshCount})`);

      // 推送新二维码给所有管理员客户端
      if (this.adminNamespace) {
        this.adminNamespace.emit('login:qrcode:refreshed', {
          session_id: sessionId,
          account_id: session.account_id,
          worker_id: session.worker_id,
          qr_code_data: qrCodeData,
          refresh_count: refreshCount,
          timestamp: Date.now(),
        });
        logger.info(`Refreshed QR code broadcasted to admin clients for session ${sessionId}`);
      }

    } catch (error) {
      logger.error('Failed to handle QR code refresh:', error);
    }
  }

  /**
   * 处理 QR 码过期
   * @param {string} sessionId - 会话ID
   */
  handleQRCodeExpired(sessionId) {
    try {
      const session = this.getSession(sessionId);
      if (!session) {
        return;
      }

      // 更新登录会话状态
      const stmt = this.db.prepare(`
        UPDATE login_sessions
        SET status = 'expired', error_message = 'QR code expired'
        WHERE id = ?
      `);
      stmt.run(sessionId);

      // 更新缓存
      session.status = 'expired';
      session.error_message = 'QR code expired';

      logger.info(`QR code expired for session ${sessionId}`);

      // 推送给管理员
      if (this.adminNamespace) {
        this.adminNamespace.emit('login:qrcode:expired', {
          session_id: sessionId,
          account_id: session.account_id,
          worker_id: session.worker_id,
          timestamp: Date.now(),
        });
      }

      // 清理会话缓存
      this.sessions.delete(sessionId);

    } catch (error) {
      logger.error('Failed to handle QR code expiration:', error);
    }
  }

  /**
   * 获取会话信息
   * @param {string} sessionId - 会话ID
   * @returns {Object|null} 会话对象
   */
  getSession(sessionId) {
    // 先从缓存获取
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }

    // 从数据库获取
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM login_sessions WHERE id = ?
      `);
      const session = stmt.get(sessionId);

      if (session) {
        this.sessions.set(sessionId, session);
      }

      return session;
    } catch (error) {
      logger.error('Failed to get session:', error);
      return null;
    }
  }

  /**
   * 获取账户的最新登录会话
   * @param {string} accountId - 账户ID
   * @returns {Object|null} 会话对象
   */
  getAccountLatestSession(accountId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM login_sessions
        WHERE account_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `);
      return stmt.get(accountId);
    } catch (error) {
      logger.error('Failed to get account latest session:', error);
      return null;
    }
  }

  /**
   * 获取所有待处理的会话列表
   * @returns {Array} 会话列表
   */
  getPendingSessions() {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM login_sessions
        WHERE status IN ('pending', 'scanning')
        ORDER BY created_at DESC
      `);
      return stmt.all();
    } catch (error) {
      logger.error('Failed to get pending sessions:', error);
      return [];
    }
  }

  /**
   * 清理过期会话 (定期调用)
   */
  cleanupExpiredSessions() {
    try {
      const now = Math.floor(Date.now() / 1000);

      // 查找过期会话
      const findStmt = this.db.prepare(`
        SELECT id FROM login_sessions
        WHERE status IN ('pending', 'scanning') AND expires_at < ?
      `);
      const expiredSessions = findStmt.all(now);

      if (expiredSessions.length === 0) {
        return;
      }

      logger.info(`Found ${expiredSessions.length} expired sessions, cleaning up...`);

      // 更新过期会话状态
      const updateStmt = this.db.prepare(`
        UPDATE login_sessions
        SET status = 'expired', error_message = 'QR code expired'
        WHERE id = ?
      `);

      expiredSessions.forEach((session) => {
        updateStmt.run(session.id);
        this.sessions.delete(session.id);

        // 推送过期通知给管理员
        if (this.adminNamespace) {
          this.adminNamespace.emit('login:qrcode:expired', {
            session_id: session.id,
            timestamp: Date.now(),
          });
        }
      });

      logger.info(`Cleaned up ${expiredSessions.length} expired sessions`);

    } catch (error) {
      logger.error('Failed to cleanup expired sessions:', error);
    }
  }

  /**
   * 启动清理定时器（每分钟清理一次过期会话）
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // 60秒

    logger.info('Login session cleanup timer started');
  }

  /**
   * 停止清理定时器
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.info('Login session cleanup timer stopped');
    }
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    try {
      const stmt = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'scanning' THEN 1 ELSE 0 END) as scanning,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired
        FROM login_sessions
      `);

      return stmt.get();
    } catch (error) {
      logger.error('Failed to get login stats:', error);
      return {
        total: 0,
        pending: 0,
        scanning: 0,
        success: 0,
        failed: 0,
        expired: 0,
      };
    }
  }
}

module.exports = LoginHandler;
