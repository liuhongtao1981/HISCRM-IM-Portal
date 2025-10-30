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
const createIMWorksRouter = require('./contents');
const createIMDiscussionsRouter = require('./discussions');
const createIMUnifiedMessagesRouter = require('./unified-messages');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('im-api');

/**
 * 创建 IM 兼容层主路由
 * @param {Database} db - SQLite数据库实例
 * @param {DataStore} dataStore - 内存数据存储（可选，用于高性能查询）
 * @returns {Router}
 */
function createIMRouter(db, dataStore = null) {
  const router = express.Router();

  // 日志中间件
  router.use((req, res, next) => {
    logger.debug(`[IM API] ${req.method} ${req.path}`, {
      query: req.query,
      body: req.method !== 'GET' ? req.body : undefined,
    });
    next();
  });

  // 挂载子路由（传递 dataStore）
  router.use('/accounts', createIMAccountsRouter(db, dataStore));
  router.use('/conversations', createIMConversationsRouter(db, dataStore));
  router.use('/messages', createIMMessagesRouter(db, dataStore));
  router.use('/contents', createIMWorksRouter(db, dataStore));
  router.use('/discussions', createIMDiscussionsRouter(db, dataStore));
  router.use('/unified-messages', createIMUnifiedMessagesRouter(db, dataStore));

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
