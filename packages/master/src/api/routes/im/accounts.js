/**
 * IM 兼容层 - 账户API路由
 * 提供与原版 IM 100% 兼容的账户接口
 */

const express = require('express');
const AccountsDAO = require('../../../database/accounts-dao');
const { AccountTransformer, ResponseWrapper } = require('../../transformers');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('im-accounts-api');

/**
 * 创建 IM 账户路由
 * @param {Database} db - SQLite数据库实例
 * @returns {Router}
 */
function createIMAccountsRouter(db) {
  const router = express.Router();
  const accountsDAO = new AccountsDAO(db);

  /**
   * GET /api/im/accounts - 获取账户列表（IM 格式）
   * 兼容原版 IM 的用户列表接口
   */
  router.get('/', (req, res) => {
    try {
      const {
        cursor = 0,
        count = 20,
        status,
        platform,
      } = req.query;

      const filters = {};
      if (status) filters.status = status;
      if (platform) filters.platform = platform;

      // 查询 Master 账户
      const masterAccounts = accountsDAO.findAll(filters);

      // 转换为 IM 用户格式
      const imUsers = AccountTransformer.toIMUserList(masterAccounts);

      // 分页处理
      const start = parseInt(cursor) || 0;
      const limit = parseInt(count) || 20;
      const paginatedUsers = imUsers.slice(start, start + limit);
      const hasMore = start + limit < imUsers.length;

      // 返回 IM 格式响应
      res.json(ResponseWrapper.list(paginatedUsers, 'users', {
        cursor: start + paginatedUsers.length,
        has_more: hasMore,
      }));

    } catch (error) {
      logger.error('Failed to get accounts:', error);
      res.status(500).json(
        ResponseWrapper.error('Internal server error', 500)
      );
    }
  });

  /**
   * GET /api/im/accounts/:userId - 获取单个账户信息（IM 格式）
   */
  router.get('/:userId', (req, res) => {
    try {
      const { userId } = req.params;

      // 查询 Master 账户
      const masterAccount = accountsDAO.findByAccountId(userId);

      if (!masterAccount) {
        return res.status(404).json(
          ResponseWrapper.error('User not found', 404)
        );
      }

      // 转换为 IM 用户格式
      const imUser = AccountTransformer.toIMUser(masterAccount);

      res.json(ResponseWrapper.success(imUser));

    } catch (error) {
      logger.error('Failed to get account:', error);
      res.status(500).json(
        ResponseWrapper.error('Internal server error', 500)
      );
    }
  });

  /**
   * POST /api/im/accounts - 创建账户（IM 格式）
   */
  router.post('/', (req, res) => {
    try {
      const imUser = req.body;

      // 转换为 Master 账户格式
      const masterAccount = AccountTransformer.fromIMUser(imUser);

      // 创建账户
      const createdAccount = accountsDAO.create({
        ...masterAccount,
        created_at: Math.floor(Date.now() / 1000),
      });

      // 转换回 IM 格式
      const result = AccountTransformer.toIMUser(createdAccount);

      res.status(201).json(ResponseWrapper.success(result));

    } catch (error) {
      logger.error('Failed to create account:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to create account', 500)
      );
    }
  });

  /**
   * PUT /api/im/accounts/:userId - 更新账户（IM 格式）
   */
  router.put('/:userId', (req, res) => {
    try {
      const { userId } = req.params;
      const imUser = req.body;

      // 检查账户是否存在
      const existingAccount = accountsDAO.findByAccountId(userId);
      if (!existingAccount) {
        return res.status(404).json(
          ResponseWrapper.error('User not found', 404)
        );
      }

      // 转换为 Master 账户格式
      const masterAccount = AccountTransformer.fromIMUser(imUser);

      // 更新账户
      const updatedAccount = accountsDAO.update(userId, {
        ...masterAccount,
        updated_at: Math.floor(Date.now() / 1000),
      });

      // 转换回 IM 格式
      const result = AccountTransformer.toIMUser(updatedAccount);

      res.json(ResponseWrapper.success(result));

    } catch (error) {
      logger.error('Failed to update account:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to update account', 500)
      );
    }
  });

  /**
   * DELETE /api/im/accounts/:userId - 删除账户（IM 格式）
   */
  router.delete('/:userId', (req, res) => {
    try {
      const { userId } = req.params;

      // 检查账户是否存在
      const existingAccount = accountsDAO.findByAccountId(userId);
      if (!existingAccount) {
        return res.status(404).json(
          ResponseWrapper.error('User not found', 404)
        );
      }

      // 删除账户
      accountsDAO.delete(userId);

      res.json(ResponseWrapper.success({ deleted: true }));

    } catch (error) {
      logger.error('Failed to delete account:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to delete account', 500)
      );
    }
  });

  return router;
}

module.exports = createIMAccountsRouter;
