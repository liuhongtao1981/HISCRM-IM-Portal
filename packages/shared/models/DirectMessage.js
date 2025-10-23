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
    this.conversation_id = data.conversation_id || null;
    this.platform_message_id = data.platform_message_id || null;
    this.content = data.content;

    // Sender/receiver info (old fields for compatibility)
    this.sender_name = data.sender_name || null;
    this.sender_id = data.sender_id || null;

    // Platform sender/receiver info (new fields)
    this.platform_sender_id = data.platform_sender_id || null;
    this.platform_sender_name = data.platform_sender_name || null;
    this.platform_receiver_id = data.platform_receiver_id || null;
    this.platform_receiver_name = data.platform_receiver_name || null;
    this.platform_user_id = data.platform_user_id || null;

    // Message metadata
    this.message_type = data.message_type || 'text';
    this.direction = data.direction; // 'inbound' | 'outbound'
    this.status = data.status || 'sent';

    // Read and delete flags
    this.is_read = data.is_read !== undefined ? data.is_read : false;
    this.is_deleted = data.is_deleted !== undefined ? data.is_deleted : false;
    this.is_recalled = data.is_recalled !== undefined ? data.is_recalled : false;

    // Media fields
    this.media_url = data.media_url || null;
    this.media_thumbnail = data.media_thumbnail || null;
    this.file_size = data.file_size || null;
    this.file_name = data.file_name || null;
    this.duration = data.duration || null;

    // Reply reference
    this.reply_to_message_id = data.reply_to_message_id || null;

    // Timestamps
    this.detected_at = data.detected_at || Math.floor(Date.now() / 1000);
    this.created_at = data.created_at || Math.floor(Date.now() / 1000);
    this.recalled_at = data.recalled_at || null;
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
      conversation_id: this.conversation_id,
      platform_message_id: this.platform_message_id,
      content: this.content,

      // Old fields (for compatibility)
      sender_name: this.sender_name,
      sender_id: this.sender_id,

      // Platform sender/receiver info
      platform_sender_id: this.platform_sender_id,
      platform_sender_name: this.platform_sender_name,
      platform_receiver_id: this.platform_receiver_id,
      platform_receiver_name: this.platform_receiver_name,
      platform_user_id: this.platform_user_id,

      // Message metadata
      message_type: this.message_type,
      direction: this.direction,
      status: this.status,

      // Boolean flags (SQLite stores as 0/1)
      is_read: this.is_read ? 1 : 0,
      is_deleted: this.is_deleted ? 1 : 0,
      is_recalled: this.is_recalled ? 1 : 0,

      // Media fields
      media_url: this.media_url,
      media_thumbnail: this.media_thumbnail,
      file_size: this.file_size,
      file_name: this.file_name,
      duration: this.duration,

      // Reply reference
      reply_to_message_id: this.reply_to_message_id,

      // Timestamps
      detected_at: this.detected_at,
      created_at: this.created_at,
      recalled_at: this.recalled_at,
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
      // Convert SQLite integers (0/1) to JavaScript booleans
      is_read: Boolean(row.is_read),
      is_deleted: Boolean(row.is_deleted),
      is_recalled: Boolean(row.is_recalled),
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
      conversation_id: this.conversation_id,
      platform_message_id: this.platform_message_id,
      content: this.content,

      // Old fields (for compatibility)
      sender_name: this.sender_name,
      sender_id: this.sender_id,

      // Platform sender/receiver info
      platform_sender_id: this.platform_sender_id,
      platform_sender_name: this.platform_sender_name,
      platform_receiver_id: this.platform_receiver_id,
      platform_receiver_name: this.platform_receiver_name,
      platform_user_id: this.platform_user_id,

      // Message metadata
      message_type: this.message_type,
      direction: this.direction,
      status: this.status,

      // Boolean flags
      is_read: this.is_read,
      is_deleted: this.is_deleted,
      is_recalled: this.is_recalled,

      // Media fields
      media_url: this.media_url,
      media_thumbnail: this.media_thumbnail,
      file_size: this.file_size,
      file_name: this.file_name,
      duration: this.duration,

      // Reply reference
      reply_to_message_id: this.reply_to_message_id,

      // Timestamps
      detected_at: this.detected_at,
      created_at: this.created_at,
      recalled_at: this.recalled_at,
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
