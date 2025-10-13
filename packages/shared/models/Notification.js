/**
 * 通知数据模型
 * 用于推送给客户端的通知实体
 */

const { v4: uuidv4 } = require('uuid');

class Notification {
  constructor(data = {}) {
    this.id = data.id || `notif-${uuidv4()}`;
    this.type = data.type; // 'comment' 或 'direct_message'
    this.account_id = data.account_id;
    this.related_id = data.related_id; // comment_id 或 direct_message_id
    this.title = data.title;
    this.content = data.content;
    this.data = data.data || {}; // 额外的数据（JSON）
    this.is_sent = data.is_sent || false;
    this.sent_at = data.sent_at || null;
    this.created_at = data.created_at || Math.floor(Date.now() / 1000);
  }

  /**
   * 从评论创建通知
   */
  static fromComment(comment) {
    return new Notification({
      type: 'comment',
      account_id: comment.account_id,
      related_id: comment.id,
      title: '新评论',
      content: `${comment.author_name || '未知用户'}: ${comment.content}`,
      data: {
        comment_id: comment.id,
        platform_comment_id: comment.platform_comment_id,
        author_name: comment.author_name,
        post_title: comment.post_title,
      },
      created_at: comment.detected_at,
    });
  }

  /**
   * 从私信创建通知
   */
  static fromDirectMessage(directMessage) {
    return new Notification({
      type: 'direct_message',
      account_id: directMessage.account_id,
      related_id: directMessage.id,
      title: '新私信',
      content: `${directMessage.sender_name || '未知用户'}: ${directMessage.content}`,
      data: {
        message_id: directMessage.id,
        platform_message_id: directMessage.platform_message_id,
        sender_name: directMessage.sender_name,
        direction: directMessage.direction,
      },
      created_at: directMessage.detected_at,
    });
  }

  /**
   * 验证通知数据
   */
  validate() {
    const errors = [];

    if (!this.type) {
      errors.push('type is required');
    } else if (!['comment', 'direct_message'].includes(this.type)) {
      errors.push('type must be comment or direct_message');
    }

    if (!this.account_id) {
      errors.push('account_id is required');
    }

    if (!this.related_id) {
      errors.push('related_id is required');
    }

    if (!this.title) {
      errors.push('title is required');
    }

    if (!this.content) {
      errors.push('content is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 转换为数据库行格式
   */
  toDbRow() {
    return {
      id: this.id,
      type: this.type,
      account_id: this.account_id,
      related_id: this.related_id,
      title: this.title,
      content: this.content,
      data: JSON.stringify(this.data),
      is_sent: this.is_sent ? 1 : 0,
      sent_at: this.sent_at,
      created_at: this.created_at,
    };
  }

  /**
   * 从数据库行创建实例
   */
  static fromDbRow(row) {
    if (!row) return null;

    return new Notification({
      id: row.id,
      type: row.type,
      account_id: row.account_id,
      related_id: row.related_id,
      title: row.title,
      content: row.content,
      data: row.data ? JSON.parse(row.data) : {},
      is_sent: Boolean(row.is_sent),
      sent_at: row.sent_at,
      created_at: row.created_at,
    });
  }

  /**
   * 转换为客户端消息 payload
   */
  toClientPayload() {
    return {
      notification_id: this.id,
      type: this.type,
      account_id: this.account_id,
      title: this.title,
      content: this.content,
      data: this.data,
      created_at: this.created_at,
    };
  }

  /**
   * 标记为已发送
   */
  markAsSent() {
    this.is_sent = true;
    this.sent_at = Math.floor(Date.now() / 1000);
  }
}

module.exports = Notification;
