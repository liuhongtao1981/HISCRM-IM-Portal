/**
 * Works DAO - 作品数据访问对象
 * 管理作品表（视频、文章等）
 */

const { v4: uuidv4 } = require('uuid');

class WorksDAO {
  constructor(db) {
    this.db = db;
  }

  /**
   * 创建作品
   */
  create(work) {
    const now = Math.floor(Date.now() / 1000);
    const id = work.id || uuidv4();

    const stmt = this.db.prepare(`
      INSERT INTO works (
        id, account_id, platform, platform_work_id, platform_user_id,
        work_type, title, description, cover, url, publish_time,
        total_comment_count, new_comment_count, like_count, share_count, view_count,
        last_crawl_time, crawl_status, crawl_error,
        is_new, push_count, created_at, updated_at
      ) VALUES (
        @id, @account_id, @platform, @platform_work_id, @platform_user_id,
        @work_type, @title, @description, @cover, @url, @publish_time,
        @total_comment_count, @new_comment_count, @like_count, @share_count, @view_count,
        @last_crawl_time, @crawl_status, @crawl_error,
        @is_new, @push_count, @created_at, @updated_at
      )
    `);

    stmt.run({
      id,
      account_id: work.account_id,
      platform: work.platform,
      platform_work_id: work.platform_work_id,
      platform_user_id: work.platform_user_id || null,
      work_type: work.work_type,
      title: work.title || null,
      description: work.description || null,
      cover: work.cover || null,
      url: work.url || null,
      publish_time: work.publish_time || null,
      total_comment_count: work.total_comment_count || 0,
      new_comment_count: work.new_comment_count || 0,
      like_count: work.like_count || 0,
      share_count: work.share_count || 0,
      view_count: work.view_count || 0,
      last_crawl_time: work.last_crawl_time || null,
      crawl_status: work.crawl_status || 'pending',
      crawl_error: work.crawl_error || null,
      is_new: work.is_new !== undefined ? work.is_new : 1,
      push_count: work.push_count || 0,
      created_at: work.created_at || now,
      updated_at: work.updated_at || now,
    });

    return this.findById(id);
  }

  /**
   * 根据 ID 查询作品
   */
  findById(id) {
    const stmt = this.db.prepare('SELECT * FROM works WHERE id = ?');
    return stmt.get(id);
  }

  /**
   * 根据平台作品 ID 查询
   */
  findByPlatformWorkId(accountId, platform, platformWorkId) {
    const stmt = this.db.prepare(`
      SELECT * FROM works
      WHERE account_id = ? AND platform = ? AND platform_work_id = ?
    `);
    return stmt.get(accountId, platform, platformWorkId);
  }

  /**
   * 查询账号的所有作品
   */
  findByAccountId(accountId, options = {}) {
    const { limit = 50, offset = 0, work_type, is_new } = options;

    let sql = 'SELECT * FROM works WHERE account_id = ?';
    const params = [accountId];

    if (work_type) {
      sql += ' AND work_type = ?';
      params.push(work_type);
    }

    if (is_new !== undefined) {
      sql += ' AND is_new = ?';
      params.push(is_new ? 1 : 0);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * 查询所有作品（分页）
   */
  findAll(options = {}) {
    const { limit = 50, offset = 0, platform, work_type, is_new } = options;

    let sql = 'SELECT * FROM works WHERE 1=1';
    const params = [];

    if (platform) {
      sql += ' AND platform = ?';
      params.push(platform);
    }

    if (work_type) {
      sql += ' AND work_type = ?';
      params.push(work_type);
    }

    if (is_new !== undefined) {
      sql += ' AND is_new = ?';
      params.push(is_new ? 1 : 0);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * 更新作品
   */
  update(id, updates) {
    const now = Math.floor(Date.now() / 1000);
    updates.updated_at = now;

    const fields = Object.keys(updates).map(key => `${key} = @${key}`).join(', ');
    const sql = `UPDATE works SET ${fields} WHERE id = @id`;

    const stmt = this.db.prepare(sql);
    stmt.run({ id, ...updates });

    return this.findById(id);
  }

  /**
   * 更新作品统计信息
   */
  updateStats(id, stats) {
    const updates = {
      total_comment_count: stats.total_comment_count,
      new_comment_count: stats.new_comment_count,
      like_count: stats.like_count,
      share_count: stats.share_count,
      view_count: stats.view_count,
      last_crawl_time: Math.floor(Date.now() / 1000),
    };

    return this.update(id, updates);
  }

  /**
   * 删除作品
   */
  delete(id) {
    const stmt = this.db.prepare('DELETE FROM works WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 统计作品数量
   */
  count(options = {}) {
    const { account_id, platform, work_type, is_new } = options;

    let sql = 'SELECT COUNT(*) as count FROM works WHERE 1=1';
    const params = [];

    if (account_id) {
      sql += ' AND account_id = ?';
      params.push(account_id);
    }

    if (platform) {
      sql += ' AND platform = ?';
      params.push(platform);
    }

    if (work_type) {
      sql += ' AND work_type = ?';
      params.push(work_type);
    }

    if (is_new !== undefined) {
      sql += ' AND is_new = ?';
      params.push(is_new ? 1 : 0);
    }

    const stmt = this.db.prepare(sql);
    return stmt.get(...params).count;
  }

  /**
   * 标记作品为已读
   */
  markAsRead(id) {
    return this.update(id, { is_new: 0 });
  }

  /**
   * 批量标记为已读
   */
  markManyAsRead(ids) {
    const placeholders = ids.map(() => '?').join(',');
    const sql = `UPDATE works SET is_new = 0 WHERE id IN (${placeholders})`;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...ids);
    return result.changes;
  }
}

module.exports = WorksDAO;
