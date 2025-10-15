/**
 * Worker 生命周期控制 API 路由
 * 处理 Worker 的启动、停止、重启等操作
 */

const express = require('express');
const router = express.Router();
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('WorkerLifecycleAPI');

module.exports = (lifecycleManager) => {
  /**
   * 启动 Worker
   * POST /api/v1/workers/:id/start
   */
  router.post('/:id/start', async (req, res) => {
    try {
      const { id: worker_id } = req.params;

      logger.info(`API: Starting worker ${worker_id}`);
      const result = await lifecycleManager.startWorker(worker_id);

      res.json(result);

    } catch (error) {
      logger.error(`API: Failed to start worker ${req.params.id}:`, error);
      res.status(500).json({
        error: 'Failed to start worker',
        message: error.message,
        worker_id: req.params.id
      });
    }
  });

  /**
   * 停止 Worker
   * POST /api/v1/workers/:id/stop
   */
  router.post('/:id/stop', async (req, res) => {
    try {
      const { id: worker_id } = req.params;
      const { graceful = true, timeout = 30000 } = req.body;

      logger.info(`API: Stopping worker ${worker_id}, graceful: ${graceful}`);
      const result = await lifecycleManager.stopWorker(worker_id, { graceful, timeout });

      res.json(result);

    } catch (error) {
      logger.error(`API: Failed to stop worker ${req.params.id}:`, error);
      res.status(500).json({
        error: 'Failed to stop worker',
        message: error.message,
        worker_id: req.params.id
      });
    }
  });

  /**
   * 重启 Worker
   * POST /api/v1/workers/:id/restart
   */
  router.post('/:id/restart', async (req, res) => {
    try {
      const { id: worker_id } = req.params;
      const { graceful = true } = req.body;

      logger.info(`API: Restarting worker ${worker_id}, graceful: ${graceful}`);
      const result = await lifecycleManager.restartWorker(worker_id, { graceful });

      res.json(result);

    } catch (error) {
      logger.error(`API: Failed to restart worker ${req.params.id}:`, error);
      res.status(500).json({
        error: 'Failed to restart worker',
        message: error.message,
        worker_id: req.params.id
      });
    }
  });

  /**
   * 获取 Worker 状态
   * GET /api/v1/workers/:id/status
   */
  router.get('/:id/status', async (req, res) => {
    try {
      const { id: worker_id } = req.params;

      const status = await lifecycleManager.getWorkerStatus(worker_id);
      res.json(status);

    } catch (error) {
      logger.error(`API: Failed to get worker status ${req.params.id}:`, error);
      res.status(500).json({
        error: 'Failed to get worker status',
        message: error.message,
        worker_id: req.params.id
      });
    }
  });

  /**
   * 获取所有 Worker 状态
   * GET /api/v1/workers/status/all
   */
  router.get('/status/all', async (req, res) => {
    try {
      const statuses = await lifecycleManager.getAllWorkerStatus();
      res.json(statuses);

    } catch (error) {
      logger.error('API: Failed to get all worker statuses:', error);
      res.status(500).json({
        error: 'Failed to get worker statuses',
        message: error.message
      });
    }
  });

  /**
   * 获取 Worker 日志
   * GET /api/v1/workers/:id/logs
   */
  router.get('/:id/logs', async (req, res) => {
    try {
      const { id: worker_id } = req.params;
      const { tail = 100, stream = 'stdout' } = req.query;

      const logs = await lifecycleManager.getWorkerLogs(worker_id, {
        tail: parseInt(tail),
        stream
      });

      res.json({
        worker_id,
        stream,
        logs
      });

    } catch (error) {
      logger.error(`API: Failed to get worker logs ${req.params.id}:`, error);
      res.status(500).json({
        error: 'Failed to get worker logs',
        message: error.message,
        worker_id: req.params.id
      });
    }
  });

  /**
   * 批量操作
   * POST /api/v1/workers/batch
   */
  router.post('/batch', async (req, res) => {
    try {
      const { action, worker_ids, options = {} } = req.body;

      // 验证参数
      if (!action) {
        return res.status(400).json({
          error: 'action is required',
          valid_actions: ['start', 'stop', 'restart']
        });
      }

      if (!worker_ids || !Array.isArray(worker_ids) || worker_ids.length === 0) {
        return res.status(400).json({
          error: 'worker_ids must be a non-empty array'
        });
      }

      if (!['start', 'stop', 'restart'].includes(action)) {
        return res.status(400).json({
          error: 'Invalid action',
          action,
          valid_actions: ['start', 'stop', 'restart']
        });
      }

      logger.info(`API: Batch ${action} for ${worker_ids.length} workers`);
      const results = await lifecycleManager.batchOperation(action, worker_ids, options);

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      res.json({
        action,
        total: results.length,
        success: successCount,
        failure: failureCount,
        results
      });

    } catch (error) {
      logger.error('API: Failed to perform batch operation:', error);
      res.status(500).json({
        error: 'Failed to perform batch operation',
        message: error.message
      });
    }
  });

  /**
   * 获取统计信息
   * GET /api/v1/workers/stats/overview
   */
  router.get('/stats/overview', (req, res) => {
    try {
      const stats = lifecycleManager.getStats();
      res.json(stats);

    } catch (error) {
      logger.error('API: Failed to get worker stats:', error);
      res.status(500).json({
        error: 'Failed to get worker stats',
        message: error.message
      });
    }
  });

  /**
   * 健康检查
   * GET /api/v1/workers/:id/health
   */
  router.get('/:id/health', async (req, res) => {
    try {
      const { id: worker_id } = req.params;

      const status = await lifecycleManager.getWorkerStatus(worker_id);

      // 定义健康检查规则
      const checks = {
        running: status.status === 'running',
        heartbeat: status.last_heartbeat && (Date.now() - status.last_heartbeat) < 60000, // 1分钟内有心跳
        memory: !status.memory_usage_mb || status.memory_usage_mb < (status.max_memory_mb || 2048) * 0.9, // 内存使用 < 90%
        errors: status.error_count < 10 // 错误次数 < 10
      };

      const healthy = Object.values(checks).every(check => check);

      res.json({
        worker_id,
        healthy,
        checks,
        status: status.status
      });

    } catch (error) {
      logger.error(`API: Failed to check worker health ${req.params.id}:`, error);
      res.status(500).json({
        error: 'Failed to check worker health',
        message: error.message,
        worker_id: req.params.id
      });
    }
  });

  return router;
};
