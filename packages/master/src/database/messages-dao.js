/**
 * Direct Messages 数据访问对象(DAO)
 * T058: 私信数据库操作
 */

const { DirectMessage } = require('@hiscrm-im/shared/models/DirectMessage');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('messages-dao');

class DirectMessagesDAO {
  constructor(db) {
    this.db = db;
  }

  /**
   * 创建私信
   * @param {DirectMessage} message - 私信对象
   * @returns {DirectMessage}
   */
  create(message) {
    try {
      const validation = message.validate();
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      const row = message.toDbRow();
      const stmt = this.db.prepare(
        `INSERT INTO direct_messages (
          id, account_id, conversation_id, platform_message_id, content,
          platform_sender_id, platform_sender_name, platform_receiver_id, platform_receiver_name,
          message_type, direction, is_read, detected_at, created_at, platform_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      stmt.run(
        row.id,
        row.account_id,
        row.conversation_id || null,
        row.platform_message_id,
        row.content,
        row.platform_sender_id || row.sender_id,
        row.platform_sender_name || row.sender_name,
        row.platform_receiver_id || null,
        row.platform_receiver_name || null,
        row.message_type || 'text',
        row.direction,
        row.is_read,
        row.detected_at,
        row.created_at,
        row.platform_user_id || null
      );

      logger.info(`Direct message created: ${row.id}`);
      return message;
    } catch (error) {
      logger.error('Failed to create direct message:', error);
      throw error;
    }
  }

  /**
   * 根据ID查找私信
   * @param {string} id - 私信ID
   * @returns {DirectMessage|null}
   */
  findById(id) {
    try {
      const row = this.db.prepare('SELECT * FROM direct_messages WHERE id = ?').get(id);

      if (!row) {
        return null;
      }

      return DirectMessage.fromDbRow(row);
    } catch (error) {
      logger.error(`Failed to find direct message by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * 查找所有私信
   * @param {object} filters - 过滤条件
   * @returns {DirectMessage[]}
   */
  findAll(filters = {}) {
    try {
      let sql = 'SELECT * FROM direct_messages WHERE 1=1';
      const params = [];

      if (filters.account_id) {
        sql += ' AND account_id = ?';
        params.push(filters.account_id);
      }

      // 添加平台用户ID过滤
      if (filters.platform_user_id) {
        sql += ' AND platform_user_id = ?';
        params.push(filters.platform_user_id);
      }

      // 添加会话ID过滤
      if (filters.conversation_id) {
        sql += ' AND conversation_id = ?';
        params.push(filters.conversation_id);
      }

      if (filters.direction) {
        sql += ' AND direction = ?';
        params.push(filters.direction);
      }

      if (filters.is_read !== undefined) {
        sql += ' AND is_read = ?';
        params.push(filters.is_read ? 1 : 0);
      }

      if (filters.since_timestamp) {
        sql += ' AND detected_at >= ?';
        params.push(filters.since_timestamp);
      }

      if (filters.start_time) {
        sql += ' AND detected_at >= ?';
        params.push(filters.start_time);
      }

      if (filters.end_time) {
        sql += ' AND detected_at <= ?';
        params.push(filters.end_time);
      }

      // 添加 created_at 时间范围过滤
      if (filters.created_at_start) {
        sql += ' AND created_at >= ?';
        params.push(filters.created_at_start);
      }

      if (filters.created_at_end) {
        sql += ' AND created_at <= ?';
        params.push(filters.created_at_end);
      }

      sql += ' ORDER BY created_at DESC';

      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }

      if (filters.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }

      const rows = this.db.prepare(sql).all(...params);
      return rows.map((row) => DirectMessage.fromDbRow(row));
    } catch (error) {
      logger.error('Failed to find direct messages:', error);
      throw error;
    }
  }

  /**
   * 标记私信为已读
   * @param {string} id - 私信ID
   * @returns {boolean}
   */
  markAsRead(id) {
    try {
      const result = this.db
        .prepare('UPDATE direct_messages SET is_read = 1 WHERE id = ?')
        .run(id);

      if (result.changes === 0) {
        return false;
      }

      logger.info(`Direct message marked as read: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Failed to mark direct message as read ${id}:`, error);
      throw error;
    }
  }

  /**
   * 标记私信为已查看 (is_new=false)
   * 用于防止消息被重复推送
   * @param {Array<string>} messageIds - 私信ID列表
   * @returns {number} 更新的行数
   */
  markNewAsViewed(messageIds) {
    try {
      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return 0;
      }

      const placeholders = messageIds.map(() => '?').join(',');
      const result = this.db.prepare(
        `UPDATE direct_messages SET is_new = 0 WHERE id IN (${placeholders})`
      ).run(...messageIds);

      if (result.changes > 0) {
        logger.info(`Marked ${result.changes} direct messages as viewed (is_new=false)`);
      }
      return result.changes;
    } catch (error) {
      logger.error(`Failed to mark direct messages as viewed:`, error);
      throw error;
    }
  }

  /**
   * 删除私信
   * @param {string} id - 私信ID
   * @returns {boolean}
   */
  delete(id) {
    try {
      const result = this.db.prepare('DELETE FROM direct_messages WHERE id = ?').run(id);

      if (result.changes === 0) {
        return false;
      }

      logger.info(`Direct message deleted: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete direct message ${id}:`, error);
      throw error;
    }
  }

  /**
   * 计数私信
   * @param {object} filters - 过滤条件
   * @returns {number}
   */
  count(filters = {}) {
    try {
      let sql = 'SELECT COUNT(*) as count FROM direct_messages WHERE 1=1';
      const params = [];

      if (filters.account_id) {
        sql += ' AND account_id = ?';
        params.push(filters.account_id);
      }

      // 添加平台用户ID过滤
      if (filters.platform_user_id) {
        sql += ' AND platform_user_id = ?';
        params.push(filters.platform_user_id);
      }

      // 添加会话ID过滤
      if (filters.conversation_id) {
        sql += ' AND conversation_id = ?';
        params.push(filters.conversation_id);
      }

      if (filters.direction) {
        sql += ' AND direction = ?';
        params.push(filters.direction);
      }

      if (filters.is_read !== undefined) {
        sql += ' AND is_read = ?';
        params.push(filters.is_read ? 1 : 0);
      }

      const result = this.db.prepare(sql).get(...params);
      return result.count;
    } catch (error) {
      logger.error('Failed to count direct messages:', error);
      throw error;
    }
  }

  /**
   * 检查私信是否已存在（根据 platform_message_id）
   * @param {string} accountId - 账户ID
   * @param {string} platformMessageId - 平台私信ID
   * @returns {boolean}
   */
  exists(accountId, platformMessageId) {
    try {
      if (!platformMessageId) {
        return false;
      }

      const result = this.db
        .prepare(
          'SELECT COUNT(*) as count FROM direct_messages WHERE account_id = ? AND platform_message_id = ?'
        )
        .get(accountId, platformMessageId);

      return result.count > 0;
    } catch (error) {
      logger.error('Failed to check direct message existence:', error);
      throw error;
    }
  }

  /**
   * 批量插入私信 - 新版本支持 platform_ 前缀字段
   * 用于 Phase 8 改进的私信爬虫 (v2)
   * @param {Array} messages - 私信数组
   * @returns {Object} 插入结果 { inserted: number, skipped: number }
   */
  bulkInsertV2(messages) {
    let inserted = 0;
    let skipped = 0;

    try {
      const insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO direct_messages (
          id, account_id, conversation_id, platform_message_id,
          content, platform_sender_id, platform_sender_name,
          platform_receiver_id, platform_receiver_name, message_type,
          direction, is_read, detected_at, created_at, is_new, push_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = this.db.transaction((messageList) => {
        for (const message of messageList) {
          try {
            // 生成消息ID (如果不存在)
            const msgId = message.id || `msg_${message.account_id}_${message.platform_message_id}`;

            // 数据清理和验证
            const cleanMessage = {
              id: String(msgId),
              account_id: String(message.account_id || ''),
              conversation_id: message.conversation_id ? String(message.conversation_id) : null,
              platform_message_id: String(message.platform_message_id || ''),
              content: String(message.content || ''),
              platform_sender_id: String(message.platform_sender_id || message.sender_id || ''),
              platform_sender_name: String(message.platform_sender_name || message.sender_name || ''),
              platform_receiver_id: message.platform_receiver_id ? String(message.platform_receiver_id) : null,
              platform_receiver_name: message.platform_receiver_name ? String(message.platform_receiver_name) : null,
              message_type: String(message.message_type || 'text'),
              direction: String(message.direction || 'inbound'),
              is_read: message.is_read !== undefined ? (message.is_read ? 1 : 0) : 0,
              detected_at: Number(message.detected_at) || Math.floor(Date.now() / 1000),
              created_at: Number(message.created_at) || Math.floor(Date.now() / 1000),
              is_new: message.is_new !== undefined ? (message.is_new ? 1 : 0) : 1,
              push_count: Number(message.push_count) || 0
            };

            // 检查必需字段
            if (!cleanMessage.id || !cleanMessage.account_id || !cleanMessage.content) {
              logger.warn('Skipping invalid message (missing required fields):', cleanMessage);
              skipped++;
              continue;
            }

            const result = insertStmt.run(
              cleanMessage.id,
              cleanMessage.account_id,
              cleanMessage.conversation_id,
              cleanMessage.platform_message_id,
              cleanMessage.content,
              cleanMessage.platform_sender_id,
              cleanMessage.platform_sender_name,
              cleanMessage.platform_receiver_id,
              cleanMessage.platform_receiver_name,
              cleanMessage.message_type,
              cleanMessage.direction,
              cleanMessage.is_read,
              cleanMessage.detected_at,
              cleanMessage.created_at,
              cleanMessage.is_new,
              cleanMessage.push_count
            );

            if (result.changes > 0) {
              inserted++;
            } else {
              skipped++;
            }
          } catch (itemError) {
            logger.warn(`Failed to insert single message, skipping:`, {
              error: itemError.message,
              message: JSON.stringify(message).substring(0, 100)
            });
            skipped++;
          }
        }
      });

      transaction(messages);

      logger.info(`Bulk insert V2 complete: ${inserted} inserted, ${skipped} skipped`);
      return { inserted, skipped };
    } catch (error) {
      logger.error('Failed to bulk insert direct messages (V2):', error);
      // 回退到逐条插入
      logger.info('Attempting to insert messages one by one...');
      let oneByOneInserted = 0;
      let oneByOneSkipped = 0;

      for (const message of messages) {
        try {
          const msgId = message.id || `msg_${message.account_id}_${message.platform_message_id}`;
          const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO direct_messages (
              id, account_id, conversation_id, platform_message_id,
              content, platform_sender_id, platform_sender_name,
              platform_receiver_id, platform_receiver_name, message_type,
              direction, is_read, detected_at, created_at, is_new, push_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          const now = Math.floor(Date.now() / 1000);
          stmt.run(
            msgId,
            message.account_id,
            message.conversation_id || null,
            message.platform_message_id || '',
            message.content || '',
            message.platform_sender_id || message.sender_id || '',
            message.platform_sender_name || message.sender_name || '',
            message.platform_receiver_id || null,
            message.platform_receiver_name || null,
            message.message_type || 'text',
            message.direction || 'inbound',
            message.is_read ? 1 : 0,
            message.detected_at || now,
            message.created_at || now,
            message.is_new ? 1 : 0,
            message.push_count || 0
          );

          oneByOneInserted++;
        } catch (e) {
          logger.warn(`Failed to insert message ${message.id}:`, e.message);
          oneByOneSkipped++;
        }
      }

      logger.info(`One-by-one insertion V2: ${oneByOneInserted} inserted, ${oneByOneSkipped} skipped`);
      return { inserted: oneByOneInserted, skipped: oneByOneSkipped };
    }
  }

  /**
   * 批量插入私信（用于爬虫）
   * @param {Array} messages - 私信数组
   * @returns {Object} 插入结果 { inserted: number, skipped: number }
   */
  bulkInsert(messages) {
    let inserted = 0;
    let skipped = 0;

    try {
      const insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO direct_messages (
          id, account_id, conversation_id, platform_message_id,
          content, platform_sender_id, platform_sender_name, direction,
          is_read, detected_at, created_at, message_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = this.db.transaction((messageList) => {
        for (const message of messageList) {
          try {
            // 数据清理和验证
            const cleanMessage = {
              id: String(message.id || ''),
              account_id: String(message.account_id || ''),
              conversation_id: message.conversation_id ? String(message.conversation_id) : null,
              platform_message_id: String(message.platform_message_id || ''),
              content: String(message.content || ''),
              platform_sender_id: String(message.platform_sender_id || message.sender_id || ''),
              platform_sender_name: String(message.platform_sender_name || message.sender_name || ''),
              direction: String(message.direction || 'inbound'),
              is_read: message.is_read !== undefined ? (message.is_read ? 1 : 0) : 0,
              detected_at: Number(message.detected_at) || Math.floor(Date.now() / 1000),
              created_at: Number(message.created_at) || Math.floor(Date.now() / 1000),
              message_type: String(message.message_type || 'text'),
            };

            // 检查必需字段
            if (!cleanMessage.id || !cleanMessage.account_id || !cleanMessage.content) {
              logger.warn('Skipping invalid message (missing required fields):', cleanMessage);
              skipped++;
              continue;
            }

            const result = insertStmt.run(
              cleanMessage.id,
              cleanMessage.account_id,
              cleanMessage.conversation_id,
              cleanMessage.platform_message_id,
              cleanMessage.content,
              cleanMessage.platform_sender_id,
              cleanMessage.platform_sender_name,
              cleanMessage.direction,
              cleanMessage.is_read,
              cleanMessage.detected_at,
              cleanMessage.created_at,
              cleanMessage.message_type
            );

            if (result.changes > 0) {
              inserted++;
            } else {
              skipped++;
            }
          } catch (itemError) {
            logger.warn(`Failed to insert single message, skipping:`, { error: itemError.message, message: JSON.stringify(message).substring(0, 100) });
            skipped++;
          }
        }
      });

      transaction(messages);

      logger.info(`Bulk insert complete: ${inserted} inserted, ${skipped} skipped`);
      return { inserted, skipped };
    } catch (error) {
      logger.error('Failed to bulk insert direct messages:', error);
      // 如果 transaction 失败，尝试逐条插入
      logger.info('Attempting to insert messages one by one...');
      let oneByOneInserted = 0;
      let oneByOneSkipped = 0;

      for (const message of messages) {
        try {
          this.create(new (require('@hiscrm-im/shared/models/DirectMessage'))(message));
          oneByOneInserted++;
        } catch (e) {
          logger.warn(`Failed to insert message ${message.id}:`, e.message);
          oneByOneSkipped++;
        }
      }

      logger.info(`One-by-one insertion: ${oneByOneInserted} inserted, ${oneByOneSkipped} skipped`);
      return { inserted: oneByOneInserted, skipped: oneByOneSkipped };
    }
  }

  /**
   * 获取会话列表（按平台用户ID分组）
   * @param {string} accountId - 账户ID
   * @param {string} platformUserId - 平台用户ID（可选）
   * @returns {Array} 会话列表
   */
  getConversations(accountId, platformUserId = null) {
    try {
      let sql = `
        SELECT
          conversation_id,
          platform_user_id,
          sender_name,
          MAX(detected_at) as last_message_time,
          COUNT(*) as message_count,
          SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_count
        FROM direct_messages
        WHERE account_id = ?
      `;
      const params = [accountId];

      if (platformUserId) {
        sql += ' AND platform_user_id = ?';
        params.push(platformUserId);
      }

      sql += ' GROUP BY conversation_id, platform_user_id ORDER BY last_message_time DESC';

      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      logger.error(`Failed to get conversations for account ${accountId}:`, error);
      return [];
    }
  }

  /**
   * 获取会话的消息
   * @param {string} conversationId - 会话ID
   * @param {Object} options - 查询选项
   * @returns {Array} 消息列表
   */
  getMessagesByConversation(conversationId, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;

      const sql = `
        SELECT * FROM direct_messages
        WHERE conversation_id = ?
        ORDER BY detected_at DESC
        LIMIT ? OFFSET ?
      `;

      const rows = this.db.prepare(sql).all(conversationId, limit, offset);
      return rows.map((row) => DirectMessage.fromDbRow(row));
    } catch (error) {
      logger.error(`Failed to get messages for conversation ${conversationId}:`, error);
      return [];
    }
  }
}

module.exports = DirectMessagesDAO;
