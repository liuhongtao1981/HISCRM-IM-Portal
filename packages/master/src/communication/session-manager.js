/**
 * 客户端会话管理器
 * 管理客户端设备的连接状态和会话信息
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('session-manager');

class SessionManager {
  constructor(db) {
    this.db = db;

    // 内存中的会话映射 (device_id -> session)
    this.sessions = new Map();

    // 启动时从数据库加载会话
    this.loadSessions();
  }

  /**
   * 从数据库加载会话
   */
  loadSessions() {
    try {
      const rows = this.db.prepare('SELECT * FROM client_sessions').all();

      for (const row of rows) {
        this.sessions.set(row.device_id, {
          id: row.id,
          device_id: row.device_id,
          device_type: row.device_type,
          device_name: row.device_name,
          socket_id: row.socket_id,
          status: row.status,
          last_seen: row.last_seen,
          connected_at: row.connected_at,
        });
      }

      logger.info(`Loaded ${rows.length} client sessions from database`);
    } catch (error) {
      logger.error('Failed to load sessions:', error);
    }
  }

  /**
   * 创建或更新会话
   * @param {Object} sessionData - 会话数据
   * @param {string} sessionData.device_id - 设备ID
   * @param {string} sessionData.device_type - 设备类型 (desktop/mobile/web)
   * @param {string} sessionData.device_name - 设备名称
   * @param {string} sessionData.socket_id - Socket ID
   */
  createOrUpdateSession(sessionData) {
    try {
      const { device_id, device_type, device_name, socket_id } = sessionData;

      if (!device_id || !device_type || !socket_id) {
        throw new Error('Missing required session data');
      }

      const now = Math.floor(Date.now() / 1000);
      const existingSession = this.sessions.get(device_id);

      let session;

      if (existingSession) {
        // 更新现有会话
        session = {
          ...existingSession,
          socket_id,
          device_name: device_name || existingSession.device_name,
          status: 'online',
          last_seen: now,
        };

        const stmt = this.db.prepare(`
          UPDATE client_sessions
          SET socket_id = ?, device_name = ?, status = ?, last_seen = ?
          WHERE device_id = ?
        `);

        stmt.run(socket_id, session.device_name, 'online', now, device_id);

        logger.info(`Session updated: ${device_id} (socket: ${socket_id})`);
      } else {
        // 创建新会话
        const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        session = {
          id: sessionId,
          device_id,
          device_type,
          device_name: device_name || `${device_type}-device`,
          socket_id,
          status: 'online',
          last_seen: now,
          connected_at: now,
        };

        const stmt = this.db.prepare(`
          INSERT INTO client_sessions (
            id, device_id, device_type, device_name, socket_id, status, last_seen, connected_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          session.id,
          session.device_id,
          session.device_type,
          session.device_name,
          session.socket_id,
          session.status,
          session.last_seen,
          session.connected_at
        );

        logger.info(`New session created: ${device_id} (socket: ${socket_id})`);
      }

      // 更新内存映射
      this.sessions.set(device_id, session);

      return session;
    } catch (error) {
      logger.error('Failed to create/update session:', error);
      throw error;
    }
  }

  /**
   * 标记会话为离线
   */
  markSessionOffline(deviceId) {
    try {
      const session = this.sessions.get(deviceId);

      if (!session) {
        return false;
      }

      const now = Math.floor(Date.now() / 1000);

      // 更新数据库
      const stmt = this.db.prepare(`
        UPDATE client_sessions
        SET status = ?, last_seen = ?
        WHERE device_id = ?
      `);

      stmt.run('offline', now, deviceId);

      // 更新内存
      session.status = 'offline';
      session.last_seen = now;

      logger.info(`Session marked offline: ${deviceId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to mark session offline for ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * 删除会话
   */
  removeSession(deviceId) {
    try {
      // 从数据库删除
      const stmt = this.db.prepare('DELETE FROM client_sessions WHERE device_id = ?');
      stmt.run(deviceId);

      // 从内存删除
      this.sessions.delete(deviceId);

      logger.info(`Session removed: ${deviceId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to remove session ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * 获取会话
   */
  getSession(deviceId) {
    return this.sessions.get(deviceId) || null;
  }

  /**
   * 获取所有在线会话
   */
  getOnlineSessions() {
    return Array.from(this.sessions.values()).filter((session) => session.status === 'online');
  }

  /**
   * 获取所有会话
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * 根据 socket_id 查找会话
   */
  findSessionBySocketId(socketId) {
    for (const session of this.sessions.values()) {
      if (session.socket_id === socketId) {
        return session;
      }
    }
    return null;
  }

  /**
   * 更新会话心跳
   */
  updateHeartbeat(deviceId) {
    try {
      const session = this.sessions.get(deviceId);

      if (!session) {
        return false;
      }

      const now = Math.floor(Date.now() / 1000);

      // 更新数据库
      const stmt = this.db.prepare('UPDATE client_sessions SET last_seen = ? WHERE device_id = ?');
      stmt.run(now, deviceId);

      // 更新内存
      session.last_seen = now;

      return true;
    } catch (error) {
      logger.error(`Failed to update heartbeat for ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * 清理过期会话（超过指定时间未活跃）
   * @param {number} timeoutSeconds - 超时时间（秒）
   */
  cleanupStale(timeoutSeconds = 300) {
    try {
      const cutoff = Math.floor(Date.now() / 1000) - timeoutSeconds;

      // 查找过期会话
      const staleDeviceIds = [];
      for (const [deviceId, session] of this.sessions.entries()) {
        if (session.last_seen < cutoff) {
          staleDeviceIds.push(deviceId);
        }
      }

      if (staleDeviceIds.length === 0) {
        return 0;
      }

      // 标记为离线
      for (const deviceId of staleDeviceIds) {
        this.markSessionOffline(deviceId);
      }

      logger.info(`Cleaned up ${staleDeviceIds.length} stale sessions`);
      return staleDeviceIds.length;
    } catch (error) {
      logger.error('Failed to cleanup stale sessions:', error);
      return 0;
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const online = this.getOnlineSessions().length;
    const total = this.sessions.size;

    return {
      total,
      online,
      offline: total - online,
    };
  }
}

module.exports = SessionManager;
