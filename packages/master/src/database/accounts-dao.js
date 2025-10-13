/**
 * Accounts数据访问对象(DAO)
 * T034: 账户数据库操作
 */

const { Account } = require('@hiscrm-im/shared/models/Account');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('accounts-dao');

class AccountsDAO {
  constructor(db) {
    this.db = db;
  }

  /**
   * 创建账户
   * @param {Account} account - 账户对象
   * @returns {Account} 创建的账户
   */
  create(account) {
    try {
      const validation = account.validate();
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // 检查是否已存在相同的platform+account_id
      const existing = this.db
        .prepare('SELECT id FROM accounts WHERE platform = ? AND account_id = ?')
        .get(account.platform, account.account_id);

      if (existing) {
        throw new Error(
          `Account with platform '${account.platform}' and account_id '${account.account_id}' already exists`
        );
      }

      const row = account.toDbRow();
      const stmt = this.db.prepare(
        `INSERT INTO accounts (
          id, platform, account_name, account_id, credentials,
          status, monitor_interval, last_check_time, assigned_worker_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      stmt.run(
        row.id,
        row.platform,
        row.account_name,
        row.account_id,
        row.credentials,
        row.status,
        row.monitor_interval,
        row.last_check_time,
        row.assigned_worker_id,
        row.created_at,
        row.updated_at
      );

      logger.info(`Account created: ${row.id} (${row.account_name})`);
      return account;
    } catch (error) {
      logger.error('Failed to create account:', error);
      throw error;
    }
  }

  /**
   * 根据ID查找账户
   * @param {string} id - 账户ID
   * @returns {Account|null}
   */
  findById(id) {
    try {
      const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);

      if (!row) {
        return null;
      }

      return Account.fromDbRow(row);
    } catch (error) {
      logger.error(`Failed to find account by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * 查找所有账户
   * @param {object} filters - 过滤条件
   * @returns {Account[]}
   */
  findAll(filters = {}) {
    try {
      let sql = 'SELECT * FROM accounts WHERE 1=1';
      const params = [];

      if (filters.status) {
        sql += ' AND status = ?';
        params.push(filters.status);
      }

      if (filters.platform) {
        sql += ' AND platform = ?';
        params.push(filters.platform);
      }

      if (filters.assigned_worker_id !== undefined) {
        if (filters.assigned_worker_id === null) {
          sql += ' AND assigned_worker_id IS NULL';
        } else {
          sql += ' AND assigned_worker_id = ?';
          params.push(filters.assigned_worker_id);
        }
      }

      sql += ' ORDER BY created_at DESC';

      const rows = this.db.prepare(sql).all(...params);
      return rows.map((row) => Account.fromDbRow(row));
    } catch (error) {
      logger.error('Failed to find accounts:', error);
      throw error;
    }
  }

  /**
   * 更新账户
   * @param {string} id - 账户ID
   * @param {object} updates - 更新的字段
   * @returns {Account|null}
   */
  update(id, updates) {
    try {
      const existing = this.findById(id);
      if (!existing) {
        return null;
      }

      // 合并更新
      Object.assign(existing, updates);
      existing.updated_at = Math.floor(Date.now() / 1000);

      // 重新验证
      const validation = existing.validate();
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      const row = existing.toDbRow();
      const stmt = this.db.prepare(
        `UPDATE accounts SET
          platform = ?, account_name = ?, account_id = ?, credentials = ?,
          status = ?, monitor_interval = ?, last_check_time = ?,
          assigned_worker_id = ?, updated_at = ?
        WHERE id = ?`
      );

      stmt.run(
        row.platform,
        row.account_name,
        row.account_id,
        row.credentials,
        row.status,
        row.monitor_interval,
        row.last_check_time,
        row.assigned_worker_id,
        row.updated_at,
        row.id
      );

      logger.info(`Account updated: ${id}`);
      return existing;
    } catch (error) {
      logger.error(`Failed to update account ${id}:`, error);
      throw error;
    }
  }

  /**
   * 删除账户
   * @param {string} id - 账户ID
   * @returns {boolean} 是否成功删除
   */
  delete(id) {
    try {
      const result = this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);

      if (result.changes === 0) {
        return false;
      }

      logger.info(`Account deleted: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete account ${id}:`, error);
      throw error;
    }
  }

  /**
   * 计数账户
   * @param {object} filters - 过滤条件
   * @returns {number}
   */
  count(filters = {}) {
    try {
      let sql = 'SELECT COUNT(*) as count FROM accounts WHERE 1=1';
      const params = [];

      if (filters.status) {
        sql += ' AND status = ?';
        params.push(filters.status);
      }

      if (filters.platform) {
        sql += ' AND platform = ?';
        params.push(filters.platform);
      }

      const result = this.db.prepare(sql).get(...params);
      return result.count;
    } catch (error) {
      logger.error('Failed to count accounts:', error);
      throw error;
    }
  }
}

module.exports = AccountsDAO;
