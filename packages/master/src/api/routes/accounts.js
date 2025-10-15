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
      const { platform, account_name, account_id, credentials, monitor_interval } = req.body;

      // 验证必填字段（只需要 platform 和 account_name）
      if (!platform || !account_name) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: platform, account_name',
        });
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
        accountAssigner.assignNewAccount(createdAccount);
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

      const updatedAccount = accountsDAO.update(req.params.id, updates);

      if (!updatedAccount) {
        return res.status(404).json({
          success: false,
          error: 'Account not found',
        });
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

  return router;
}

module.exports = createAccountsRouter;
