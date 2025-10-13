/**
 * Workers API 路由
 * 提供 Worker 节点信息查询
 */

const express = require('express');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('workers-api');

/**
 * 创建 Workers 路由
 * @param {Database} db - SQLite数据库实例
 * @returns {Router}
 */
function createWorkersRouter(db) {
  const router = express.Router();

  /**
   * GET /api/v1/workers - 获取 Worker 列表
   */
  router.get('/', (req, res) => {
    try {
      const filters = {};

      // 支持按状态筛选
      if (req.query.status) {
        filters.status = req.query.status;
      }

      // 构建查询
      let query = 'SELECT * FROM workers';
      const params = [];

      if (filters.status) {
        query += ' WHERE status = ?';
        params.push(filters.status);
      }

      query += ' ORDER BY started_at DESC';

      const workers = db.prepare(query).all(...params);

      // 解析 metadata JSON
      const workersData = workers.map((worker) => {
        let metadata = {};
        try {
          if (worker.metadata) {
            metadata = JSON.parse(worker.metadata);
          }
        } catch (err) {
          logger.warn(`Failed to parse metadata for worker ${worker.id}:`, err);
        }

        return {
          id: worker.id,
          host: worker.host,
          port: worker.port,
          status: worker.status,
          assigned_accounts: worker.assigned_accounts,
          last_heartbeat: worker.last_heartbeat,
          started_at: worker.started_at,
          version: worker.version,
          capabilities: metadata.capabilities || [],
          max_accounts: metadata.max_accounts || 10,
        };
      });

      res.json({
        success: true,
        data: workersData,
      });
    } catch (error) {
      logger.error('Failed to get workers:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * GET /api/v1/workers/:id - 获取单个 Worker 详情
   */
  router.get('/:id', (req, res) => {
    try {
      const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);

      if (!worker) {
        return res.status(404).json({
          success: false,
          error: 'Worker not found',
        });
      }

      // 解析 metadata
      let metadata = {};
      try {
        if (worker.metadata) {
          metadata = JSON.parse(worker.metadata);
        }
      } catch (err) {
        logger.warn(`Failed to parse metadata for worker ${worker.id}:`, err);
      }

      // 获取该 Worker 分配的账户列表
      const accounts = db
        .prepare('SELECT id, platform, account_name, account_id, status FROM accounts WHERE assigned_worker_id = ?')
        .all(req.params.id);

      const workerData = {
        id: worker.id,
        host: worker.host,
        port: worker.port,
        status: worker.status,
        assigned_accounts: worker.assigned_accounts,
        last_heartbeat: worker.last_heartbeat,
        started_at: worker.started_at,
        version: worker.version,
        capabilities: metadata.capabilities || [],
        max_accounts: metadata.max_accounts || 10,
        accounts: accounts,
      };

      res.json({
        success: true,
        data: workerData,
      });
    } catch (error) {
      logger.error(`Failed to get worker ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  return router;
}

module.exports = createWorkersRouter;
