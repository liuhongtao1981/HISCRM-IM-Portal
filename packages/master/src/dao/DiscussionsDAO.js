/**
 * Discussions DAO - 讨论数据访问对象
 * 管理讨论表（二级评论）
 */

const { v4: uuidv4 } = require('uuid');

class DiscussionsDAO {
  constructor(db) {
    this.db = db;
  }

  /**
   * 创建讨论
   */
  create(discussion) {
    const now = Math.floor(Date.now() / 1000);
    const id = discussion.id || uuidv4();

    const stmt = this.db.prepare(`
      INSERT INTO discussions (
        id, account_id, platform, platform_user_id, platform_discussion_id,
        parent_comment_id, content, author_name, author_id,
        work_id, post_id, post_title,
        is_read, is_new, push_count,
        detected_at, created_at
      ) VALUES (
        @id, @account_id, @platform, @platform_user_id, @platform_discussion_id,
        @parent_comment_id, @content, @author_name, @author_id,
        @work_id, @post_id, @post_title,
        @is_read, @is_new, @push_count,
        @detected_at, @created_at
      )
    `);

    stmt.run({
      id,
      account_id: discussion.account_id,
      platform: discussion.platform,
      platform_user_id: discussion.platform_user_id || null,
      platform_discussion_id: discussion.platform_discussion_id || null,
      parent_comment_id: discussion.parent_comment_id,
      content: discussion.content,
      author_name: discussion.author_name || null,
      author_id: discussion.author_id || null,
      work_id: discussion.work_id || null,
      post_id: discussion.post_id || null,
      post_title: discussion.post_title || null,
      is_read: discussion.is_read !== undefined ? discussion.is_read : 0,
      is_new: discussion.is_new !== undefined ? discussion.is_new : 1,
      push_count: discussion.push_count || 0,
      detected_at: discussion.detected_at || now,
      created_at: discussion.created_at || now,
    });

    return this.findById(id);
  }

  /**
   * 根据 ID 查询讨论
   */
  findById(id) {
    const stmt = this.db.prepare('SELECT * FROM discussions WHERE id = ?');
    return stmt.get(id);
  }

  /**
   * 根据父评论 ID 查询所有讨论
   */
  findByParentCommentId(parentCommentId, options = {}) {
    const { limit = 50, offset = 0, is_read, is_new } = options;

    let sql = 'SELECT * FROM discussions WHERE parent_comment_id = ?';
    const params = [parentCommentId];

    if (is_read !== undefined) {
      sql += ' AND is_read = ?';
      params.push(is_read ? 1 : 0);
    }

    if (is_new !== undefined) {
      sql += ' AND is_new = ?';
      params.push(is_new ? 1 : 0);
    }

    sql += ' ORDER BY detected_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * 根据账号 ID 查询所有讨论
   */
  findByAccountId(accountId, options = {}) {
    const { limit = 50, offset = 0, is_read, is_new } = options;

    let sql = 'SELECT * FROM discussions WHERE account_id = ?';
    const params = [accountId];

    if (is_read !== undefined) {
      sql += ' AND is_read = ?';
      params.push(is_read ? 1 : 0);
    }

    if (is_new !== undefined) {
      sql += ' AND is_new = ?';
      params.push(is_new ? 1 : 0);
    }

    sql += ' ORDER BY detected_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * 根据作品 ID 查询所有讨论
   */
  findByWorkId(workId, options = {}) {
    const { limit = 50, offset = 0, is_read, is_new } = options;

    let sql = 'SELECT * FROM discussions WHERE work_id = ?';
    const params = [workId];

    if (is_read !== undefined) {
      sql += ' AND is_read = ?';
      params.push(is_read ? 1 : 0);
    }

    if (is_new !== undefined) {
      sql += ' AND is_new = ?';
      params.push(is_new ? 1 : 0);
    }

    sql += ' ORDER BY detected_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * 查询所有讨论（分页）
   */
  findAll(options = {}) {
    const { limit = 50, offset = 0, platform, is_read, is_new } = options;

    let sql = 'SELECT * FROM discussions WHERE 1=1';
    const params = [];

    if (platform) {
      sql += ' AND platform = ?';
      params.push(platform);
    }

    if (is_read !== undefined) {
      sql += ' AND is_read = ?';
      params.push(is_read ? 1 : 0);
    }

    if (is_new !== undefined) {
      sql += ' AND is_new = ?';
      params.push(is_new ? 1 : 0);
    }

    sql += ' ORDER BY detected_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * 更新讨论
   */
  update(id, updates) {
    const fields = Object.keys(updates).map(key => `${key} = @${key}`).join(', ');
    const sql = `UPDATE discussions SET ${fields} WHERE id = @id`;

    const stmt = this.db.prepare(sql);
    stmt.run({ id, ...updates });

    return this.findById(id);
  }

  /**
   * 标记讨论为已读
   */
  markAsRead(id) {
    return this.update(id, { is_read: 1, is_new: 0 });
  }

  /**
   * 批量标记为已读
   */
  markManyAsRead(ids) {
    const placeholders = ids.map(() => '?').join(',');
    const sql = `UPDATE discussions SET is_read = 1, is_new = 0 WHERE id IN (${placeholders})`;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...ids);
    return result.changes;
  }

  /**
   * 删除讨论
   */
  delete(id) {
    const stmt = this.db.prepare('DELETE FROM discussions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 统计讨论数量
   */
  count(options = {}) {
    const { account_id, platform, parent_comment_id, work_id, is_read, is_new } = options;

    let sql = 'SELECT COUNT(*) as count FROM discussions WHERE 1=1';
    const params = [];

    if (account_id) {
      sql += ' AND account_id = ?';
      params.push(account_id);
    }

    if (platform) {
      sql += ' AND platform = ?';
      params.push(platform);
    }

    if (parent_comment_id) {
      sql += ' AND parent_comment_id = ?';
      params.push(parent_comment_id);
    }

    if (work_id) {
      sql += ' AND work_id = ?';
      params.push(work_id);
    }

    if (is_read !== undefined) {
      sql += ' AND is_read = ?';
      params.push(is_read ? 1 : 0);
    }

    if (is_new !== undefined) {
      sql += ' AND is_new = ?';
      params.push(is_new ? 1 : 0);
    }

    const stmt = this.db.prepare(sql);
    return stmt.get(...params).count;
  }

  /**
   * 获取评论的讨论统计
   */
  getCommentDiscussionStats(commentId) {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_new = 1 THEN 1 ELSE 0 END) as new_count,
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_count
      FROM discussions
      WHERE parent_comment_id = ?
    `);

    return stmt.get(commentId);
  }
}

module.exports = DiscussionsDAO;
