/**
 * DEBUG API 路由
 *
 * 仅在 DEBUG 模式下启用，用于 Claude Code 实时调试浏览器和系统状态
 *
 * 可用端点:
 * - GET /api/debug/browser-status - 浏览器和账户状态
 * - GET /api/debug/accounts/:accountId - 账户详情
 * - GET /api/debug/messages/:accountId - 私信列表
 * - GET /api/debug/workers - 所有Worker状态
 * - GET /api/debug/workers/:workerId - 特定Worker的详细信息
 */

const express = require('express');
const router = express.Router();
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('debug-api', './logs');

let db = null;

/**
 * 初始化 DEBUG API
 */
function initDebugAPI(database) {
  db = database;
}

/**
 * GET /api/debug/browser-status
 * 获取浏览器和账户状态
 */
router.get('/browser-status', (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: '数据库未初始化' });
    }

    // 获取所有账户
    const stmt = db.prepare('SELECT id, platform, account_name, login_status, status FROM accounts');
    const accounts = stmt.all() || [];

    const browserStatus = {
      timestamp: Date.now(),
      totalAccounts: accounts.length,
      accounts: accounts.map(acc => ({
        id: acc.id,
        platform: acc.platform,
        accountName: acc.account_name,
        loginStatus: acc.login_status,
        status: acc.status,
      })),
    };

    logger.debug('获取浏览器状态', { count: accounts.length });
    res.json(browserStatus);
  } catch (error) {
    logger.error('获取浏览器状态失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/debug/accounts/:accountId
 * 获取账户详细信息
 */
router.get('/accounts/:accountId', (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: '数据库未初始化' });
    }

    const { accountId } = req.params;

    // 获取账户信息
    const stmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
    const account = stmt.get(accountId);
    if (!account) {
      return res.status(404).json({ error: '账户不存在' });
    }

    const accountDetail = {
      id: account.id,
      platform: account.platform,
      accountName: account.account_name,
      platformUserId: account.platform_user_id,
      loginStatus: account.login_status,
      status: account.status,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    };

    logger.debug('获取账户详情', { accountId });
    res.json(accountDetail);
  } catch (error) {
    logger.error('获取账户详情失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/debug/messages/:accountId
 * 获取账户的消息列表
 *
 * 查询参数:
 * - limit: 返回数量 (默认20)
 * - offset: 偏移量 (默认0)
 */
router.get('/messages/:accountId', (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: '数据库未初始化' });
    }

    const { accountId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    // 验证账户存在
    const stmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
    const account = stmt.get(accountId);
    if (!account) {
      return res.status(404).json({ error: '账户不存在' });
    }

    // 获取私信列表
    const msgStmt = db.prepare(`
      SELECT id, content, is_new, created_at
      FROM direct_messages
      WHERE account_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    const messages = msgStmt.all(accountId, parseInt(limit), parseInt(offset)) || [];

    logger.debug('获取消息列表', { accountId, count: messages.length });

    res.json({
      accountId,
      totalMessages: messages.length,
      messages: messages.map(msg => ({
        id: msg.id,
        content: msg.content,
        isNew: msg.is_new,
        createdAt: msg.created_at,
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    logger.error('获取消息列表失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/debug/workers
 * 获取所有Worker状态
 */
router.get('/workers', (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: '数据库未初始化' });
    }

    // 获取所有Workers
    const workersStmt = db.prepare(`
      SELECT id, host, port, status, version, last_heartbeat, started_at
      FROM workers
    `);
    const workers = workersStmt.all() || [];

    const result = {
      timestamp: Date.now(),
      totalWorkers: workers.length,
      workers: workers.map(worker => ({
        id: worker.id,
        host: worker.host,
        port: worker.port,
        status: worker.status,
        version: worker.version,
        lastHeartbeat: worker.last_heartbeat,
        startedAt: worker.started_at,
      })),
    };

    logger.debug('获取Worker列表', { count: workers.length });
    res.json(result);
  } catch (error) {
    logger.error('获取Worker列表失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/debug/workers/:workerId
 * 获取特定Worker的详细信息和分配的账户
 */
router.get('/workers/:workerId', (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: '数据库未初始化' });
    }

    const { workerId } = req.params;

    // 获取Worker信息
    const workerStmt = db.prepare('SELECT * FROM workers WHERE id = ?');
    const worker = workerStmt.get(workerId);
    if (!worker) {
      return res.status(404).json({ error: 'Worker不存在' });
    }

    // 获取分配给此Worker的账户
    const accountsStmt = db.prepare(`
      SELECT id, platform, account_name, login_status, status
      FROM accounts
      WHERE worker_id = ?
    `);
    const accounts = accountsStmt.all(workerId) || [];

    const workerDetail = {
      id: worker.id,
      host: worker.host,
      port: worker.port,
      status: worker.status,
      version: worker.version,
      lastHeartbeat: worker.last_heartbeat,
      startedAt: worker.started_at,
      assignedAccountsCount: accounts.length,
      accounts: accounts.map(acc => ({
        id: acc.id,
        platform: acc.platform,
        accountName: acc.account_name,
        loginStatus: acc.login_status,
        status: acc.status,
      })),
    };

    logger.debug('获取Worker详情', { workerId, accountCount: accounts.length });
    res.json(workerDetail);
  } catch (error) {
    logger.error('获取Worker详情失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = {
  router,
  initDebugAPI,
};
