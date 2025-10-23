/**
 * IM 兼容层 - 路由入口
 * 提供与原版 IM 100% 兼容的 API 接口
 *
 * API 前缀: /api/im
 */

const express = require('express');
const createIMAccountsRouter = require('./accounts');
const createIMConversationsRouter = require('./conversations');
const createIMMessagesRouter = require('./messages');
const createIMWorksRouter = require('./works');
const createIMDiscussionsRouter = require('./discussions');
const createIMUnifiedMessagesRouter = require('./unified-messages');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('im-api');

/**
 * 创建 IM 兼容层主路由
 * @param {Database} db - SQLite数据库实例
 * @returns {Router}
 */
function createIMRouter(db) {
  const router = express.Router();

  // 日志中间件
  router.use((req, res, next) => {
    logger.debug(`[IM API] ${req.method} ${req.path}`, {
      query: req.query,
      body: req.method !== 'GET' ? req.body : undefined,
    });
    next();
  });

  // 挂载子路由
  router.use('/accounts', createIMAccountsRouter(db));
  router.use('/conversations', createIMConversationsRouter(db));
  router.use('/messages', createIMMessagesRouter(db));
  router.use('/works', createIMWorksRouter(db));
  router.use('/discussions', createIMDiscussionsRouter(db));
  router.use('/unified-messages', createIMUnifiedMessagesRouter(db));

  // 健康检查
  router.get('/health', (req, res) => {
    res.json({
      data: {
        status: 'ok',
        version: '1.0.0',
        timestamp: Date.now(),
      },
      status_code: 0,
    });
  });

  // 版本信息
  router.get('/version', (req, res) => {
    res.json({
      data: {
        api_version: '1.0.0',
        compatibility: 'IM v1.0',
        supported_platforms: ['douyin', 'xiaohongshu'],
      },
      status_code: 0,
    });
  });

  logger.info('IM 兼容层路由已初始化: /api/im');

  return router;
}

module.exports = createIMRouter;
