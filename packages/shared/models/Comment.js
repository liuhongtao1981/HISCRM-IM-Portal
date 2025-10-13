/**
 * Comment 模型
 * T055: 评论数据模型
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Comment 类
 */
class Comment {
  constructor(data = {}) {
    this.id = data.id || `comment-${uuidv4()}`;
    this.account_id = data.account_id;
    this.platform_comment_id = data.platform_comment_id || null;
    this.content = data.content;
    this.author_name = data.author_name || null;
    this.author_id = data.author_id || null;
    this.post_id = data.post_id || null;
    this.post_title = data.post_title || null;
    this.is_read = data.is_read !== undefined ? data.is_read : false;
    this.detected_at = data.detected_at || Math.floor(Date.now() / 1000);
    this.created_at = data.created_at || Math.floor(Date.now() / 1000);
  }

  /**
   * 验证评论数据
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

    if (this.content && this.content.length > 5000) {
      errors.push('Content must be less than 5000 characters');
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
      platform_comment_id: this.platform_comment_id,
      content: this.content,
      author_name: this.author_name,
      author_id: this.author_id,
      post_id: this.post_id,
      post_title: this.post_title,
      is_read: this.is_read ? 1 : 0, // SQLite boolean
      detected_at: this.detected_at,
      created_at: this.created_at,
    };
  }

  /**
   * 从数据库行创建 Comment 实例
   * @param {object} row - 数据库行
   * @returns {Comment}
   */
  static fromDbRow(row) {
    return new Comment({
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
      platform_comment_id: this.platform_comment_id,
      content: this.content,
      author_name: this.author_name,
      author_id: this.author_id,
      post_id: this.post_id,
      post_title: this.post_title,
      is_read: this.is_read,
      detected_at: this.detected_at,
      created_at: this.created_at,
    };
  }

  /**
   * 从 Worker 检测消息创建 Comment 实例
   * @param {string} accountId - 账户ID
   * @param {object} data - Worker 检测的数据
   * @returns {Comment}
   */
  static fromWorkerMessage(accountId, data) {
    return new Comment({
      account_id: accountId,
      platform_comment_id: data.platform_comment_id,
      content: data.content,
      author_name: data.author_name,
      author_id: data.author_id,
      post_id: data.post_id,
      post_title: data.post_title,
      detected_at: data.detected_at,
    });
  }
}

module.exports = { Comment };
