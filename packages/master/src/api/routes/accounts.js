/**
 * 账户管理API路由
 * T035-T039: 实现账户CRUD端点
 */

const express = require('express');
const AccountsDAO = require('../../database/accounts-dao');
const { Account } = require('@hiscrm-im/shared/models/Account');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('accounts-api');

/**
 * 创建账户路由
 * @param {Database} db - SQLite数据库实例
 * @param {AccountAssigner} accountAssigner - 账户分配器实例
 * @returns {Router}
 */
function createAccountsRouter(db, accountAssigner) {
  const router = express.Router();
  const accountsDAO = new AccountsDAO(db);

  /**
   * T036: GET /api/v1/accounts - 获取账户列表
   */
  router.get('/', (req, res) => {
    try {
      const filters = {};

      if (req.query.status) {
        filters.status = req.query.status;
      }

      if (req.query.platform) {
        filters.platform = req.query.platform;
      }

      const accounts = accountsDAO.findAll(filters);

      res.json({
        success: true,
        data: accounts.map((acc) => acc.toSafeJSON()), // 不返回凭证
      });
    } catch (error) {
      logger.error('Failed to get accounts:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * T037: GET /api/v1/accounts/:id - 获取单个账户
   */
  router.get('/:id', (req, res) => {
    try {
      const account = accountsDAO.findById(req.params.id);

      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found',
        });
      }

      res.json({
        success: true,
        data: account.toSafeJSON(),
      });
    } catch (error) {
      logger.error(`Failed to get account ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * T035: POST /api/v1/accounts - 创建账户
   */
  router.post('/', async (req, res) => {
    try {
      const { platform, account_name, account_id, credentials, monitor_interval, assigned_worker_id } = req.body;

      // 验证必填字段（只需要 platform 和 account_name）
      if (!platform || !account_name) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: platform, account_name',
        });
      }

      // 如果指定了 Worker，验证 Worker 是否存在且在线
      if (assigned_worker_id) {
        const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(assigned_worker_id);
        if (!worker) {
          return res.status(400).json({
            success: false,
            error: `Worker not found: ${assigned_worker_id}`,
          });
        }
        if (worker.status !== 'online') {
          return res.status(400).json({
            success: false,
            error: `Worker is not online: ${assigned_worker_id} (status: ${worker.status})`,
          });
        }
      }

      // 如果没有提供 account_id，自动生成临时ID
      // 格式: temp_平台_时间戳_随机码
      const finalAccountId = account_id || `temp_${platform}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      // 创建账户对象（credentials 和 account_id 都可选）
      const account = new Account({
        platform,
        account_name,
        account_id: finalAccountId,
        credentials: credentials || {},  // 默认空对象，登录后更新
        monitor_interval: monitor_interval || 30,
        status: 'active',
        assigned_worker_id: assigned_worker_id || null,  // 手动指定 Worker 或 null（自动分配）
      });

      // 验证
      const validation = account.validate();
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.errors.join(', '),
        });
      }

      // 保存到数据库
      const createdAccount = accountsDAO.create(account);

      // T040: 触发账户分配逻辑
      if (accountAssigner) {
        // 如果手动指定了 Worker，直接分配并发送任务
        if (assigned_worker_id) {
          accountAssigner.assignToSpecificWorker(createdAccount, assigned_worker_id);
        } else {
          // 自动分配到负载最低的 Worker
          accountAssigner.assignNewAccount(createdAccount);
        }
      }

      res.status(201).json({
        success: true,
        data: createdAccount.toJSON(), // 包含加密的凭证
      });
    } catch (error) {
      logger.error('Failed to create account:', error);

      if (error.message.includes('already exists')) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * T038: PATCH /api/v1/accounts/:id - 更新账户
   */
  router.patch('/:id', (req, res) => {
    try {
      const allowedUpdates = [
        'account_name',
        'credentials',
        'status',
        'monitor_interval',
        'assigned_worker_id',  // 允许修改 Worker 分配
      ];

      const updates = {};
      for (const key of Object.keys(req.body)) {
        if (allowedUpdates.includes(key)) {
          updates[key] = req.body[key];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid fields to update',
        });
      }

      // 如果要修改 Worker 分配，验证 Worker
      if ('assigned_worker_id' in updates) {
        if (updates.assigned_worker_id !== null && updates.assigned_worker_id !== '') {
          const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(updates.assigned_worker_id);
          if (!worker) {
            return res.status(400).json({
              success: false,
              error: `Worker not found: ${updates.assigned_worker_id}`,
            });
          }
          if (worker.status !== 'online') {
            return res.status(400).json({
              success: false,
              error: `Worker is not online: ${updates.assigned_worker_id} (status: ${worker.status})`,
            });
          }
        } else {
          // 空字符串转为 null（切换到自动分配）
          updates.assigned_worker_id = null;
        }
      }

      // 获取原账户信息（用于比较 Worker 是否变化）
      const oldAccount = accountsDAO.findById(req.params.id);
      if (!oldAccount) {
        return res.status(404).json({
          success: false,
          error: 'Account not found',
        });
      }

      const updatedAccount = accountsDAO.update(req.params.id, updates);

      // T040: 处理 Worker 分配变更
      if (accountAssigner && 'assigned_worker_id' in updates) {
        const oldWorkerId = oldAccount.assigned_worker_id;
        const newWorkerId = updates.assigned_worker_id;

        // Worker 发生变化
        if (oldWorkerId !== newWorkerId) {
          // 1. 如果之前有分配 Worker，先撤销任务
          if (oldWorkerId) {
            accountAssigner.revokeFromWorker(req.params.id, oldWorkerId);
          }

          // 2. 分配到新 Worker
          if (newWorkerId) {
            // 手动指定 Worker
            accountAssigner.assignToSpecificWorker(updatedAccount, newWorkerId);
          } else {
            // 自动分配
            accountAssigner.assignNewAccount(updatedAccount);
          }
        }
      }

      // T040: 处理账户状态变更
      if (accountAssigner && updates.status) {
        accountAssigner.handleAccountStatusChange(req.params.id, updates.status);
      }

      res.json({
        success: true,
        data: updatedAccount.toSafeJSON(),
      });
    } catch (error) {
      logger.error(`Failed to update account ${req.params.id}:`, error);

      if (error.message.includes('Validation failed')) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * T039: DELETE /api/v1/accounts/:id - 删除账户
   */
  router.delete('/:id', (req, res) => {
    try {
      // T040: 在删除前触发任务撤销逻辑
      if (accountAssigner) {
        accountAssigner.revokeDeletedAccount(req.params.id);
      }

      const deleted = accountsDAO.delete(req.params.id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Account not found',
        });
      }

      res.json({
        success: true,
        message: 'Account deleted successfully',
      });
    } catch (error) {
      logger.error(`Failed to delete account ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * GET /api/v1/accounts/status - 获取账户运行状态
   * 返回账户状态 + Worker 信息 + 运行时统计
   *
   * 查询参数:
   * - worker_status: 过滤 Worker 状态 (online/offline/error)
   * - login_status: 过滤登录状态 (logged_in/not_logged_in/login_failed)
   * - platform: 过滤平台 (douyin/xiaohongshu)
   * - sort: 排序字段 (last_crawl_time/total_comments/total_works)
   * - order: 排序顺序 (asc/desc)
   */
  router.get('/status/all', (req, res) => {
    try {
      // 构建查询条件
      let whereConditions = [];
      let params = [];

      if (req.query.worker_status) {
        whereConditions.push('a.worker_status = ?');
        params.push(req.query.worker_status);
      }

      if (req.query.login_status) {
        whereConditions.push('a.login_status = ?');
        params.push(req.query.login_status);
      }

      if (req.query.platform) {
        whereConditions.push('a.platform = ?');
        params.push(req.query.platform);
      }

      const whereClause = whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      // 排序逻辑
      const validSortFields = ['last_crawl_time', 'total_comments', 'total_works', 'last_heartbeat_time'];
      const sortField = validSortFields.includes(req.query.sort) ? req.query.sort : 'last_heartbeat_time';
      const sortOrder = req.query.order === 'asc' ? 'ASC' : 'DESC';

      // 查询账户状态 + Worker 信息
      const query = `
        SELECT
          a.id,
          a.account_name,
          a.account_id,
          a.platform,
          a.status,
          a.login_status,
          a.assigned_worker_id,
          a.worker_status,
          a.total_comments,
          a.total_works,
          a.total_followers,
          a.total_following,
          a.recent_comments_count,
          a.recent_works_count,
          a.last_crawl_time,
          a.last_heartbeat_time,
          a.error_count,
          a.last_error_message,
          a.user_info,
          w.status as worker_online_status,
          w.host as worker_host,
          w.port as worker_port
        FROM accounts a
        LEFT JOIN workers w ON a.assigned_worker_id = w.id
        ${whereClause}
        ORDER BY a.${sortField} ${sortOrder}
      `;

      const accounts = db.prepare(query).all(...params);

      // 格式化返回数据
      const formattedAccounts = accounts.map(acc => {
        // 解析 user_info JSON
        let userInfo = null;
        if (acc.user_info) {
          try {
            userInfo = JSON.parse(acc.user_info);
          } catch (e) {
            logger.warn(`Failed to parse user_info for account ${acc.id}:`, e);
          }
        }

        return {
          id: acc.id,
          account_name: acc.account_name,
          account_id: acc.account_id,
          platform: acc.platform,
          status: acc.status,
          login_status: acc.login_status,
          user_info: userInfo,  // 添加用户信息
          worker: {
            id: acc.assigned_worker_id,
            status: acc.worker_online_status,
            host: acc.worker_host,
            port: acc.worker_port,
          },
          runtime_stats: {
            worker_status: acc.worker_status,
            total_comments: acc.total_comments || 0,
            total_works: acc.total_works || 0,
            total_followers: acc.total_followers || 0,
            total_following: acc.total_following || 0,
            recent_comments_count: acc.recent_comments_count || 0,
            recent_works_count: acc.recent_works_count || 0,
            last_crawl_time: acc.last_crawl_time,
            last_heartbeat_time: acc.last_heartbeat_time,
            error_count: acc.error_count || 0,
            last_error_message: acc.last_error_message,
          },
        };
      });

      res.json({
        success: true,
        data: formattedAccounts,
        count: formattedAccounts.length,
      });
    } catch (error) {
      logger.error('Failed to get account status:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  return router;
}

module.exports = createAccountsRouter;
