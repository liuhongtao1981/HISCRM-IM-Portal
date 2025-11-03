/**
 * Worker 配置管理 API 路由
 * 处理 Worker 配置的 CRUD 操作
 */

const express = require('express');
const router = express.Router();
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('WorkerConfigsAPI');

module.exports = (workerConfigDAO) => {
  /**
   * 获取所有 Worker 配置
   * GET /api/v1/worker-configs
   */
  router.get('/', (req, res) => {
    try {
      const configs = workerConfigDAO.findAll();
      res.json({
        success: true,
        data: configs
      });
    } catch (error) {
      logger.error('Failed to get worker configs:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 获取单个 Worker 配置
   * GET /api/v1/worker-configs/:id
   */
  router.get('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const config = workerConfigDAO.findById(id);

      if (!config) {
        return res.status(404).json({
          error: 'Worker config not found',
          id
        });
      }

      res.json(config);
    } catch (error) {
      logger.error('Failed to get worker config:', error);
      res.status(500).json({
        error: 'Failed to get worker config',
        message: error.message
      });
    }
  });

  /**
   * 根据 worker_id 获取配置
   * GET /api/v1/worker-configs/by-worker-id/:worker_id
   */
  router.get('/by-worker-id/:worker_id', (req, res) => {
    try {
      const { worker_id } = req.params;
      const config = workerConfigDAO.findByWorkerId(worker_id);

      if (!config) {
        return res.status(404).json({
          error: 'Worker config not found',
          worker_id
        });
      }

      res.json(config);
    } catch (error) {
      logger.error('Failed to get worker config by worker_id:', error);
      res.status(500).json({
        error: 'Failed to get worker config',
        message: error.message
      });
    }
  });

  /**
   * 创建 Worker 配置
   * POST /api/v1/worker-configs
   */
  router.post('/', (req, res) => {
    try {
      const configData = req.body;

      // 验证必填字段
      if (!configData.worker_id) {
        return res.status(400).json({
          error: 'worker_id is required'
        });
      }

      if (!configData.name) {
        return res.status(400).json({
          error: 'name is required'
        });
      }

      if (!configData.host) {
        return res.status(400).json({
          error: 'host is required'
        });
      }

      // 检查 worker_id 是否已存在
      const existing = workerConfigDAO.findByWorkerId(configData.worker_id);
      if (existing) {
        return res.status(409).json({
          error: 'Worker ID already exists',
          worker_id: configData.worker_id
        });
      }

      // 创建配置
      const config = workerConfigDAO.create(configData);

      logger.info(`Created worker config: ${config.worker_id}`);
      res.status(201).json(config);

    } catch (error) {
      logger.error('Failed to create worker config:', error);
      res.status(500).json({
        error: 'Failed to create worker config',
        message: error.message
      });
    }
  });

  /**
   * 更新 Worker 配置
   * PATCH /api/v1/worker-configs/:id
   */
  router.patch('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // 检查配置是否存在
      const existing = workerConfigDAO.findById(id);
      if (!existing) {
        return res.status(404).json({
          error: 'Worker config not found',
          id
        });
      }

      // 如果要更新 worker_id，检查是否与其他配置冲突
      if (updates.worker_id && updates.worker_id !== existing.worker_id) {
        const conflict = workerConfigDAO.findByWorkerId(updates.worker_id);
        if (conflict) {
          return res.status(409).json({
            error: 'Worker ID already exists',
            worker_id: updates.worker_id
          });
        }
      }

      // 更新配置
      const config = workerConfigDAO.update(id, updates);

      logger.info(`Updated worker config: ${id}`);
      res.json(config);

    } catch (error) {
      logger.error('Failed to update worker config:', error);
      res.status(500).json({
        error: 'Failed to update worker config',
        message: error.message
      });
    }
  });

  /**
   * 删除 Worker 配置
   * DELETE /api/v1/worker-configs/:id
   */
  router.delete('/:id', (req, res) => {
    try {
      const { id } = req.params;

      // 检查配置是否存在
      const existing = workerConfigDAO.findById(id);
      if (!existing) {
        return res.status(404).json({
          error: 'Worker config not found',
          id
        });
      }

      // 删除配置
      const deleted = workerConfigDAO.delete(id);

      if (deleted) {
        logger.info(`Deleted worker config: ${id}`);
        res.json({
          success: true,
          message: 'Worker config deleted',
          id
        });
      } else {
        res.status(500).json({
          error: 'Failed to delete worker config'
        });
      }

    } catch (error) {
      logger.error('Failed to delete worker config:', error);
      res.status(500).json({
        error: 'Failed to delete worker config',
        message: error.message
      });
    }
  });

  /**
   * 获取统计信息
   * GET /api/v1/worker-configs/stats
   */
  router.get('/stats/summary', (req, res) => {
    try {
      const total = workerConfigDAO.count();
      const enabled = workerConfigDAO.countEnabled();
      const configs = workerConfigDAO.findAll();

      const totalCapacity = configs.reduce((sum, config) => sum + config.max_accounts, 0);

      const deploymentTypes = configs.reduce((acc, config) => {
        acc[config.deployment_type] = (acc[config.deployment_type] || 0) + 1;
        return acc;
      }, {});

      res.json({
        total,
        enabled,
        disabled: total - enabled,
        total_capacity: totalCapacity,
        deployment_types: deploymentTypes
      });

    } catch (error) {
      logger.error('Failed to get worker config stats:', error);
      res.status(500).json({
        error: 'Failed to get stats',
        message: error.message
      });
    }
  });

  return router;
};
