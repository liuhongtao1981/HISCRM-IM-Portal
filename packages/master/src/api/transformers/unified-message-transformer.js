/**
 * 统一消息转换器
 * 将不同业务类型（评论、讨论、私信）统一转换为 IM 消息格式
 */

const MessageTransformer = require('./message-transformer');
const WorkTransformer = require('./work-transformer');
const DiscussionTransformer = require('./discussion-transformer');

class UnifiedMessageTransformer {
  /**
   * 将评论转换为 IM 消息格式
   * @param {Object} comment - 评论对象
   * @returns {Object} IM 消息格式
   */
  static commentToIMMessage(comment) {
    if (!comment) return null;

    return {
      msg_id: comment.id,
      conversation_id: comment.post_id || `work_${comment.post_id}`,
      msg_type: 'comment', // 扩展消息类型
      business_type: 'comment', // 业务类型标识

      sender: {
        user_id: comment.author_id || '',
        user_name: comment.author_name || '未知用户',
        avatar: '', // 评论表没有头像，可能需要关联查询
      },

      // 评论特定字段
      content: comment.content,
      content_id: comment.post_id,
      work_title: comment.post_title,

      // 状态
      is_read: comment.is_read === 1,
      is_new: comment.is_new === 1,

      // 时间戳
      create_time: this.convertTimestamp(comment.created_at),
      detected_at: this.convertTimestamp(comment.detected_at),

      // 平台信息
      platform: comment.platform || 'douyin',
      platform_comment_id: comment.platform_comment_id,
    };
  }

  /**
   * 将讨论（二级评论）转换为 IM 消息格式
   * @param {Object} discussion - 讨论对象
   * @returns {Object} IM 消息格式
   */
  static discussionToIMMessage(discussion) {
    if (!discussion) return null;

    return {
      msg_id: discussion.id,
      conversation_id: `comment_${discussion.parent_comment_id}`,
      msg_type: 'discussion', // 扩展消息类型
      business_type: 'discussion', // 业务类型标识

      sender: {
        user_id: discussion.author_id || '',
        user_name: discussion.author_name || '未知用户',
        avatar: '',
      },

      // 讨论特定字段
      content: discussion.content,
      parent_comment_id: discussion.parent_comment_id,
      content_id: discussion.content_id,
      work_title: discussion.post_title,

      // 状态
      is_read: discussion.is_read === 1,
      is_new: discussion.is_new === 1,

      // 时间戳
      create_time: this.convertTimestamp(discussion.created_at),
      detected_at: this.convertTimestamp(discussion.detected_at),

      // 平台信息
      platform: discussion.platform || 'douyin',
      platform_discussion_id: discussion.platform_discussion_id,
    };
  }

  /**
   * 将私信转换为 IM 消息格式
   * @param {Object} directMessage - 私信对象
   * @returns {Object} IM 消息格式
   */
  static directMessageToIMMessage(directMessage) {
    if (!directMessage) return null;

    return {
      msg_id: directMessage.id,
      conversation_id: directMessage.conversation_id,
      msg_type: this.mapMessageType(directMessage.message_type),
      business_type: 'direct_message', // 业务类型标识

      sender: {
        user_id: directMessage.platform_sender_id || '',
        user_name: directMessage.platform_sender_name || directMessage.sender_name || '未知用户',
        avatar: '',
      },

      receiver: {
        user_id: directMessage.platform_receiver_id || '',
        user_name: directMessage.platform_receiver_name || '未知用户',
        avatar: '',
      },

      // 私信内容
      content: directMessage.content,
      direction: directMessage.direction, // 'inbound' | 'outbound'

      // 状态
      is_read: directMessage.is_read === 1,
      is_new: directMessage.is_new === 1,

      // 时间戳
      create_time: this.convertTimestamp(directMessage.created_at),
      detected_at: this.convertTimestamp(directMessage.detected_at),

      // 平台信息
      platform: directMessage.platform || 'douyin',
      platform_message_id: directMessage.platform_message_id,

      status: 'sent', // 私信默认已发送
    };
  }

  /**
   * 统一查询接口：根据类型获取消息列表
   * @param {Database} db - 数据库实例
   * @param {Object} options - 查询选项
   * @returns {Array} 统一的 IM 消息列表
   */
  static async getUnifiedMessages(db, options = {}) {
    const {
      account_id,
      types = ['comment', 'discussion', 'direct_message'], // 要包含的消息类型
      is_new,
      is_read,
      limit = 50,
      offset = 0,
    } = options;

    const messages = [];

    // 查询评论
    if (types.includes('comment')) {
      let sql = 'SELECT * FROM comments WHERE 1=1';
      const params = [];

      if (account_id) {
        sql += ' AND account_id = ?';
        params.push(account_id);
      }

      if (is_new !== undefined) {
        sql += ' AND is_new = ?';
        params.push(is_new ? 1 : 0);
      }

      if (is_read !== undefined) {
        sql += ' AND is_read = ?';
        params.push(is_read ? 1 : 0);
      }

      sql += ' ORDER BY detected_at DESC LIMIT ?';
      params.push(Math.ceil(limit / types.length));

      const stmt = db.prepare(sql);
      const comments = stmt.all(...params);
      messages.push(...comments.map(c => this.commentToIMMessage(c)));
    }

    // 查询讨论
    if (types.includes('discussion')) {
      let sql = 'SELECT * FROM discussions WHERE 1=1';
      const params = [];

      if (account_id) {
        sql += ' AND account_id = ?';
        params.push(account_id);
      }

      if (is_new !== undefined) {
        sql += ' AND is_new = ?';
        params.push(is_new ? 1 : 0);
      }

      if (is_read !== undefined) {
        sql += ' AND is_read = ?';
        params.push(is_read ? 1 : 0);
      }

      sql += ' ORDER BY detected_at DESC LIMIT ?';
      params.push(Math.ceil(limit / types.length));

      const stmt = db.prepare(sql);
      const discussions = stmt.all(...params);
      messages.push(...discussions.map(d => this.discussionToIMMessage(d)));
    }

    // 查询私信
    if (types.includes('direct_message')) {
      let sql = 'SELECT * FROM direct_messages WHERE 1=1';
      const params = [];

      if (account_id) {
        sql += ' AND account_id = ?';
        params.push(account_id);
      }

      if (is_new !== undefined) {
        sql += ' AND is_new = ?';
        params.push(is_new ? 1 : 0);
      }

      if (is_read !== undefined) {
        sql += ' AND is_read = ?';
        params.push(is_read ? 1 : 0);
      }

      sql += ' ORDER BY detected_at DESC LIMIT ?';
      params.push(Math.ceil(limit / types.length));

      const stmt = db.prepare(sql);
      const directMessages = stmt.all(...params);
      messages.push(...directMessages.map(dm => this.directMessageToIMMessage(dm)));
    }

    // 按时间排序
    messages.sort((a, b) => b.create_time - a.create_time);

    // 分页
    return messages.slice(offset, offset + limit);
  }

  /**
   * 消息类型映射
   */
  static mapMessageType(type) {
    const typeMap = {
      'text': 'text',
      'image': 'image',
      'file': 'file',
      'video': 'video',
      'audio': 'audio',
    };
    return typeMap[type] || 'text';
  }

  /**
   * 时间戳转换：秒 → 毫秒
   */
  static convertTimestamp(seconds) {
    if (!seconds) return 0;
    if (seconds > 10000000000) return seconds;
    return seconds * 1000;
  }

  /**
   * 时间戳转换：毫秒 → 秒
   */
  static convertTimestampToSeconds(milliseconds) {
    if (!milliseconds) return 0;
    if (milliseconds < 10000000000) return milliseconds;
    return Math.floor(milliseconds / 1000);
  }

  /**
   * 根据业务类型和 ID 标记为已读
   */
  static markAsRead(db, businessType, messageId) {
    const tableMap = {
      'comment': 'comments',
      'discussion': 'discussions',
      'direct_message': 'direct_messages',
    };

    const table = tableMap[businessType];
    if (!table) {
      throw new Error(`不支持的业务类型: ${businessType}`);
    }

    const stmt = db.prepare(`UPDATE ${table} SET is_read = 1, is_new = 0 WHERE id = ?`);
    const result = stmt.run(messageId);
    return result.changes > 0;
  }

  /**
   * 批量标记为已读
   */
  static markManyAsRead(db, businessType, messageIds) {
    const tableMap = {
      'comment': 'comments',
      'discussion': 'discussions',
      'direct_message': 'direct_messages',
    };

    const table = tableMap[businessType];
    if (!table) {
      throw new Error(`不支持的业务类型: ${businessType}`);
    }

    const placeholders = messageIds.map(() => '?').join(',');
    const stmt = db.prepare(`UPDATE ${table} SET is_read = 1, is_new = 0 WHERE id IN (${placeholders})`);
    const result = stmt.run(...messageIds);
    return result.changes;
  }

  /**
   * 获取未读消息统计
   */
  static getUnreadStats(db, accountId) {
    const stats = {
      total_unread: 0,
      comment_unread: 0,
      discussion_unread: 0,
      direct_message_unread: 0,
    };

    // 评论未读数
    const commentStmt = db.prepare(`
      SELECT COUNT(*) as count FROM comments
      WHERE account_id = ? AND is_read = 0
    `);
    stats.comment_unread = commentStmt.get(accountId)?.count || 0;

    // 讨论未读数
    const discussionStmt = db.prepare(`
      SELECT COUNT(*) as count FROM discussions
      WHERE account_id = ? AND is_read = 0
    `);
    stats.discussion_unread = discussionStmt.get(accountId)?.count || 0;

    // 私信未读数
    const dmStmt = db.prepare(`
      SELECT COUNT(*) as count FROM direct_messages
      WHERE account_id = ? AND is_read = 0
    `);
    stats.direct_message_unread = dmStmt.get(accountId)?.count || 0;

    stats.total_unread = stats.comment_unread + stats.discussion_unread + stats.direct_message_unread;

    return stats;
  }
}

module.exports = UnifiedMessageTransformer;
