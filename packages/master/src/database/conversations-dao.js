/**
 * Conversations 数据访问对象(DAO)
 * 私信会话管理
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('conversations-dao');

class ConversationsDAO {
  constructor(db) {
    this.db = db;
  }

  /**
   * 创建会话
   * @param {Object} conversation - 会话对象
   * @returns {Object} 创建的会话
   */
  create(conversation) {
    try {
      // 验证必需字段
      const required = ['id', 'account_id', 'platform_user_id'];
      for (const field of required) {
        if (!conversation[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      const stmt = this.db.prepare(`
        INSERT INTO conversations (
          id, account_id, platform_user_id, platform_user_name,
          platform_user_avatar, is_group, unread_count,
          platform_message_id, last_message_time, last_message_content,
          is_pinned, is_muted, last_message_type, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const now = Math.floor(Date.now() / 1000);

      stmt.run(
        conversation.id,
        conversation.account_id,
        conversation.platform_user_id,
        conversation.platform_user_name || null,
        conversation.platform_user_avatar || null,
        conversation.is_group ? 1 : 0,
        conversation.unread_count || 0,
        conversation.platform_message_id || null,
        conversation.last_message_time || now,
        conversation.last_message_content || null,
        conversation.is_pinned ? 1 : 0,
        conversation.is_muted ? 1 : 0,
        conversation.last_message_type || 'text',
        conversation.status || 'active',
        conversation.created_at || now,
        conversation.updated_at || now
      );

      logger.info(`Conversation created: ${conversation.id}`, {
        accountId: conversation.account_id,
        platformUserId: conversation.platform_user_id
      });

      return conversation;
    } catch (error) {
      logger.error('Failed to create conversation:', error);
      throw error;
    }
  }

  /**
   * 根据ID查找会话
   * @param {string} id - 会话ID
   * @returns {Object|null} 会话对象或 null
   */
  findById(id) {
    try {
      const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);

      if (!row) {
        return null;
      }

      return this._formatRow(row);
    } catch (error) {
      logger.error(`Failed to find conversation by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * 根据账户和平台用户ID查找会话
   * @param {string} accountId - 账户ID
   * @param {string} platformUserId - 平台用户ID
   * @returns {Object|null} 会话对象或 null
   */
  findByAccountAndUser(accountId, platformUserId) {
    try {
      const row = this.db.prepare(
        'SELECT * FROM conversations WHERE account_id = ? AND platform_user_id = ?'
      ).get(accountId, platformUserId);

      if (!row) {
        return null;
      }

      return this._formatRow(row);
    } catch (error) {
      logger.error(
        `Failed to find conversation for account ${accountId}, user ${platformUserId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * 查找账户下的所有会话
   * @param {string} accountId - 账户ID
   * @param {Object} options - 查询选项
   *   - is_pinned: 是否只查询置顶会话
   *   - is_muted: 是否只查询免打扰会话
   *   - status: 会话状态过滤
   *   - orderBy: 排序字段（默认：updated_at）
   *   - order: 排序方向（默认：DESC）
   *   - limit: 分页限制
   *   - offset: 分页偏移
   * @returns {Object[]} 会话数组
   */
  findByAccount(accountId, options = {}) {
    try {
      let sql = 'SELECT * FROM conversations WHERE account_id = ?';
      const params = [accountId];

      // 支持置顶过滤
      if (options.is_pinned !== undefined) {
        sql += ' AND is_pinned = ?';
        params.push(options.is_pinned ? 1 : 0);
      }

      // 支持免打扰过滤
      if (options.is_muted !== undefined) {
        sql += ' AND is_muted = ?';
        params.push(options.is_muted ? 1 : 0);
      }

      // 支持状态过滤
      if (options.status) {
        sql += ' AND status = ?';
        params.push(options.status);
      }

      // 支持排序（置顶会话优先）
      const orderBy = options.orderBy || 'updated_at';
      const order = options.order || 'DESC';
      sql += ` ORDER BY is_pinned DESC, ${orderBy} ${order}`;

      // 支持分页
      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);

        if (options.offset) {
          sql += ' OFFSET ?';
          params.push(options.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params);

      return rows.map(row => this._formatRow(row));
    } catch (error) {
      logger.error(`Failed to find conversations for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 获取未读会话数
   * @param {string} accountId - 账户ID
   * @returns {number} 未读会话数
   */
  getUnreadCount(accountId) {
    try {
      const result = this.db.prepare(
        'SELECT COUNT(*) as count FROM conversations WHERE account_id = ? AND unread_count > 0'
      ).get(accountId);

      return result?.count || 0;
    } catch (error) {
      logger.error(`Failed to get unread count for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 更新会话
   * @param {string} id - 会话ID
   * @param {Object} updates - 更新的字段
   * @returns {Object} 更新后的会话
   */
  update(id, updates) {
    try {
      // 验证会话存在
      const existing = this.findById(id);
      if (!existing) {
        throw new Error(`Conversation not found: ${id}`);
      }

      // 构建更新语句
      const fields = [];
      const values = [];

      const allowedFields = [
        'platform_user_name', 'platform_user_avatar', 'is_group',
        'unread_count', 'platform_message_id', 'last_message_time',
        'last_message_content', 'is_pinned', 'is_muted', 'last_message_type',
        'status', 'updated_at'
      ];

      for (const field of allowedFields) {
        if (field in updates) {
          fields.push(`${field} = ?`);

          // Boolean 字段转换
          if (field === 'is_group' || field === 'is_pinned' || field === 'is_muted') {
            values.push(updates[field] ? 1 : 0);
          } else {
            values.push(updates[field]);
          }
        }
      }

      // 总是更新 updated_at
      if (!('updated_at' in updates)) {
        fields.push('updated_at = ?');
        values.push(Math.floor(Date.now() / 1000));
      }

      if (fields.length === 0) {
        return existing;
      }

      values.push(id);

      const sql = `UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`;
      this.db.prepare(sql).run(...values);

      logger.debug(`Conversation updated: ${id}`, { fields });

      return this.findById(id);
    } catch (error) {
      logger.error(`Failed to update conversation ${id}:`, error);
      throw error;
    }
  }

  /**
   * 更新最后消息信息
   * @param {string} conversationId - 会话ID
   * @param {string} messageId - 消息ID
   * @param {string} messageContent - 消息内容
   * @param {number} messageTime - 消息时间戳
   * @param {string} messageType - 消息类型（可选，默认 'text'）
   */
  updateLastMessage(conversationId, messageId, messageContent, messageTime, messageType = 'text') {
    try {
      const stmt = this.db.prepare(`
        UPDATE conversations
        SET platform_message_id = ?, last_message_content = ?,
            last_message_time = ?, last_message_type = ?, updated_at = ?
        WHERE id = ?
      `);

      const now = Math.floor(Date.now() / 1000);
      stmt.run(messageId, messageContent, messageTime || now, messageType, now, conversationId);

      logger.debug(`Conversation last message updated: ${conversationId}`);
    } catch (error) {
      logger.error(`Failed to update last message for conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * 更新未读计数
   * @param {string} conversationId - 会话ID
   * @param {number} count - 未读消息数
   */
  updateUnreadCount(conversationId, count) {
    try {
      const stmt = this.db.prepare(
        'UPDATE conversations SET unread_count = ?, updated_at = ? WHERE id = ?'
      );

      const now = Math.floor(Date.now() / 1000);
      stmt.run(count, now, conversationId);

      logger.debug(`Conversation unread count updated: ${conversationId} -> ${count}`);
    } catch (error) {
      logger.error(`Failed to update unread count for conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * 标记会话为已读
   * @param {string} conversationId - 会话ID
   */
  markAsRead(conversationId) {
    try {
      this.updateUnreadCount(conversationId, 0);
      logger.debug(`Conversation marked as read: ${conversationId}`);
    } catch (error) {
      logger.error(`Failed to mark conversation as read ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * 置顶会话
   * @param {string} conversationId - 会话ID
   */
  pinConversation(conversationId) {
    try {
      this.update(conversationId, { is_pinned: true });
      logger.debug(`Conversation pinned: ${conversationId}`);
    } catch (error) {
      logger.error(`Failed to pin conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * 取消置顶会话
   * @param {string} conversationId - 会话ID
   */
  unpinConversation(conversationId) {
    try {
      this.update(conversationId, { is_pinned: false });
      logger.debug(`Conversation unpinned: ${conversationId}`);
    } catch (error) {
      logger.error(`Failed to unpin conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * 免打扰会话
   * @param {string} conversationId - 会话ID
   */
  muteConversation(conversationId) {
    try {
      this.update(conversationId, { is_muted: true });
      logger.debug(`Conversation muted: ${conversationId}`);
    } catch (error) {
      logger.error(`Failed to mute conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * 取消免打扰会话
   * @param {string} conversationId - 会话ID
   */
  unmuteConversation(conversationId) {
    try {
      this.update(conversationId, { is_muted: false });
      logger.debug(`Conversation unmuted: ${conversationId}`);
    } catch (error) {
      logger.error(`Failed to unmute conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * 查找置顶会话
   * @param {string} accountId - 账户ID
   * @returns {Object[]} 置顶会话数组
   */
  findPinned(accountId) {
    try {
      const rows = this.db.prepare(
        'SELECT * FROM conversations WHERE account_id = ? AND is_pinned = 1 ORDER BY updated_at DESC'
      ).all(accountId);

      return rows.map(row => this._formatRow(row));
    } catch (error) {
      logger.error(`Failed to find pinned conversations for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 删除会话
   * @param {string} id - 会话ID
   */
  delete(id) {
    try {
      const stmt = this.db.prepare('DELETE FROM conversations WHERE id = ?');
      stmt.run(id);

      logger.info(`Conversation deleted: ${id}`);
    } catch (error) {
      logger.error(`Failed to delete conversation ${id}:`, error);
      throw error;
    }
  }

  /**
   * 删除账户下的所有会话
   * @param {string} accountId - 账户ID
   */
  deleteByAccount(accountId) {
    try {
      const stmt = this.db.prepare('DELETE FROM conversations WHERE account_id = ?');
      stmt.run(accountId);

      logger.info(`All conversations deleted for account: ${accountId}`);
    } catch (error) {
      logger.error(`Failed to delete conversations for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 批量创建或更新会话
   * @param {Object[]} conversations - 会话数组
   * @returns {number} 创建/更新的会话数
   */
  upsertMany(conversations) {
    try {
      let created = 0;
      let updated = 0;

      for (const conv of conversations) {
        try {
          const existing = this.findByAccountAndUser(conv.account_id, conv.platform_user_id);

          if (existing) {
            this.update(existing.id, {
              platform_user_name: conv.platform_user_name,
              platform_user_avatar: conv.platform_user_avatar,
              last_message_time: conv.last_message_time,
              last_message_content: conv.last_message_content,
              platform_message_id: conv.platform_message_id
            });
            updated++;
          } else {
            this.create(conv);
            created++;
          }
        } catch (error) {
          logger.error(`Failed to upsert conversation ${conv.id}:`, error);
        }
      }

      logger.info(`Conversations upserted: ${created} created, ${updated} updated`);
      return created + updated;
    } catch (error) {
      logger.error('Failed to upsert conversations:', error);
      throw error;
    }
  }

  /**
   * 获取会话统计信息
   * @param {string} accountId - 账户ID
   * @returns {Object} 统计信息
   */
  getStats(accountId) {
    try {
      const result = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN unread_count > 0 THEN 1 ELSE 0 END) as unread,
          SUM(is_group) as groups,
          SUM(is_pinned) as pinned,
          SUM(is_muted) as muted,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          MAX(updated_at) as lastUpdated
        FROM conversations
        WHERE account_id = ?
      `).get(accountId);

      return result || { total: 0, unread: 0, groups: 0, pinned: 0, muted: 0, active: 0, lastUpdated: null };
    } catch (error) {
      logger.error(`Failed to get conversation stats for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 格式化数据库行
   * @private
   */
  _formatRow(row) {
    if (!row) return null;

    return {
      id: row.id,
      account_id: row.account_id,
      platform_user_id: row.platform_user_id,
      platform_user_name: row.platform_user_name,
      platform_user_avatar: row.platform_user_avatar,
      is_group: !!row.is_group,
      unread_count: row.unread_count || 0,
      platform_message_id: row.platform_message_id,
      last_message_time: row.last_message_time,
      last_message_content: row.last_message_content,
      is_pinned: !!row.is_pinned,
      is_muted: !!row.is_muted,
      last_message_type: row.last_message_type || 'text',
      status: row.status || 'active',
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

module.exports = ConversationsDAO;
