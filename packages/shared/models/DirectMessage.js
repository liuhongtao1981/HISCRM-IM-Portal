/**
 * DirectMessage 模型
 * T056: 私信数据模型
 */

const { v4: uuidv4 } = require('uuid');

/**
 * DirectMessage 类
 */
class DirectMessage {
  constructor(data = {}) {
    this.id = data.id || `dm-${uuidv4()}`;
    this.account_id = data.account_id;
    this.platform_message_id = data.platform_message_id || null;
    this.content = data.content;
    this.sender_name = data.sender_name || null;
    this.sender_id = data.sender_id || null;
    this.direction = data.direction; // 'inbound' | 'outbound'
    this.is_read = data.is_read !== undefined ? data.is_read : false;
    this.detected_at = data.detected_at || Math.floor(Date.now() / 1000);
    this.created_at = data.created_at || Math.floor(Date.now() / 1000);
  }

  /**
   * 验证私信数据
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate() {
    const errors = [];

    if (!this.account_id) {
      errors.push('Account ID is required');
    }

    if (!this.content) {
      errors.push('Content is required');
    }

    if (this.content && this.content.length > 10000) {
      errors.push('Content must be less than 10000 characters');
    }

    if (!['inbound', 'outbound'].includes(this.direction)) {
      errors.push('Direction must be either "inbound" or "outbound"');
    }

    if (typeof this.is_read !== 'boolean') {
      errors.push('is_read must be a boolean');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 转换为数据库行格式
   * @returns {object}
   */
  toDbRow() {
    return {
      id: this.id,
      account_id: this.account_id,
      platform_message_id: this.platform_message_id,
      content: this.content,
      sender_name: this.sender_name,
      sender_id: this.sender_id,
      direction: this.direction,
      is_read: this.is_read ? 1 : 0, // SQLite boolean
      detected_at: this.detected_at,
      created_at: this.created_at,
    };
  }

  /**
   * 从数据库行创建 DirectMessage 实例
   * @param {object} row - 数据库行
   * @returns {DirectMessage}
   */
  static fromDbRow(row) {
    return new DirectMessage({
      ...row,
      is_read: Boolean(row.is_read), // SQLite boolean
    });
  }

  /**
   * 转换为 JSON 格式
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      account_id: this.account_id,
      platform_message_id: this.platform_message_id,
      content: this.content,
      sender_name: this.sender_name,
      sender_id: this.sender_id,
      direction: this.direction,
      is_read: this.is_read,
      detected_at: this.detected_at,
      created_at: this.created_at,
    };
  }

  /**
   * 从 Worker 检测消息创建 DirectMessage 实例
   * @param {string} accountId - 账户ID
   * @param {object} data - Worker 检测的数据
   * @returns {DirectMessage}
   */
  static fromWorkerMessage(accountId, data) {
    return new DirectMessage({
      account_id: accountId,
      platform_message_id: data.platform_message_id,
      content: data.content,
      sender_name: data.sender_name,
      sender_id: data.sender_id,
      direction: data.direction,
      detected_at: data.detected_at,
    });
  }
}

module.exports = { DirectMessage };
