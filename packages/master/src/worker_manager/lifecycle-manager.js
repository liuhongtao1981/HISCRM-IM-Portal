/**
 * Worker 生命周期管理器
 * 统一管理 Worker 的创建、启动、停止、监控
 */

const EventEmitter = require('events');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('WorkerLifecycleManager');
const LocalProcessManager = require('./local-process-manager');

class WorkerLifecycleManager extends EventEmitter {
  constructor(workerConfigDAO, workerRuntimeDAO) {
    super();
    this.workerConfigDAO = workerConfigDAO;
    this.workerRuntimeDAO = workerRuntimeDAO;

    // 进程管理器（目前只支持本地，未来可扩展 SSH、Docker 等）
    this.localProcessManager = new LocalProcessManager();

    // 监听进程管理器事件
    this.setupProcessManagerListeners();

    // 自动重启控制
    this.restartAttempts = new Map(); // worker_id -> attempts count
  }

  /**
   * 初始化
   * 自动启动配置为 auto_start 的 Worker
   */
  async initialize() {
    logger.info('Initializing Worker Lifecycle Manager...');

    try {
      // 获取所有自动启动的配置
      const autoStartConfigs = this.workerConfigDAO.findAutoStart();

      logger.info(`Found ${autoStartConfigs.length} auto-start workers`);

      // 启动所有自动启动的 Worker
      for (const config of autoStartConfigs) {
        try {
          await this.startWorker(config.worker_id);
          logger.info(`Auto-started worker: ${config.worker_id}`);
        } catch (error) {
          logger.error(`Failed to auto-start worker ${config.worker_id}:`, error);
        }
      }

      logger.info('Worker Lifecycle Manager initialized');
    } catch (error) {
      logger.error('Failed to initialize Worker Lifecycle Manager:', error);
      throw error;
    }
  }

  /**
   * 启动 Worker
   * @param {string} worker_id - Worker ID
   * @returns {Promise<Object>} 启动结果
   */
  async startWorker(worker_id) {
    logger.info(`Starting worker: ${worker_id}`);

    try {
      // 1. 获取 Worker 配置
      const config = this.workerConfigDAO.findByWorkerId(worker_id);
      if (!config) {
        throw new Error(`Worker config not found: ${worker_id}`);
      }

      if (!config.enabled) {
        throw new Error(`Worker is disabled: ${worker_id}`);
      }

      // 2. 检查是否已经在运行
      const existing = this.workerRuntimeDAO.findByWorkerId(worker_id);
      if (existing && existing.status === 'running') {
        // 验证进程是否真的还在运行
        if (config.deployment_type === 'local') {
          const processStatus = this.localProcessManager.getWorkerStatus(worker_id);
          if (!processStatus || !processStatus.running) {
            // 进程已经不存在,清理过期状态
            logger.warn(`Worker ${worker_id} marked as running but process not found, cleaning up state`);
            this.workerRuntimeDAO.updateStatus(worker_id, 'stopped');
            this.workerRuntimeDAO.updateProcess(worker_id, {
              stopped_at: Date.now(),
              process_id: null
            });
          } else {
            // 进程确实在运行
            throw new Error(`Worker is already running: ${worker_id}`);
          }
        } else {
          // 非local部署类型,直接信任数据库状态
          throw new Error(`Worker is already running: ${worker_id}`);
        }
      }

      // 3. 创建或更新运行时记录为 starting
      const existingRuntime = this.workerRuntimeDAO.findByWorkerId(worker_id);
      if (existingRuntime) {
        // 更新状态
        this.workerRuntimeDAO.updateStatus(worker_id, 'starting');
      } else {
        // 创建新记录
        this.workerRuntimeDAO.create({
          worker_id,
          config_id: config.id,
          status: 'starting',
          process_id: null,
          started_at: null,
          stopped_at: null
        });
      }

      // 4. 根据部署类型启动进程
      let result;
      if (config.deployment_type === 'local') {
        result = await this.localProcessManager.startWorker(config);
      } else {
        throw new Error(`Deployment type not supported yet: ${config.deployment_type}`);
      }

      // 5. 更新运行时信息
      this.workerRuntimeDAO.updateProcess(worker_id, {
        process_id: result.pid,
        started_at: result.started_at
      });

      this.workerRuntimeDAO.updateStatus(worker_id, 'running');

      // 6. 重置重启计数
      this.restartAttempts.set(worker_id, 0);

      logger.info(`Worker started successfully: ${worker_id}, PID: ${result.pid}`);

      // 7. 触发事件
      this.emit('worker-started', {
        worker_id,
        pid: result.pid,
        timestamp: Date.now()
      });

      return {
        success: true,
        worker_id,
        status: 'running',
        pid: result.pid
      };

    } catch (error) {
      logger.error(`Failed to start worker ${worker_id}:`, error);

      // 更新状态为 error
      this.workerRuntimeDAO.updateStatus(worker_id, 'error');
      this.workerRuntimeDAO.updateError(worker_id, error.message);

      throw error;
    }
  }

  /**
   * 停止 Worker
   * @param {string} worker_id - Worker ID
   * @param {Object} options - 停止选项
   * @returns {Promise<Object>} 停止结果
   */
  async stopWorker(worker_id, options = {}) {
    logger.info(`Stopping worker: ${worker_id}`);

    try {
      // 1. 检查 Worker 配置
      const config = this.workerConfigDAO.findByWorkerId(worker_id);
      if (!config) {
        throw new Error(`Worker config not found: ${worker_id}`);
      }

      // 2. 检查运行状态
      const runtime = this.workerRuntimeDAO.findByWorkerId(worker_id);
      if (!runtime || runtime.status === 'stopped') {
        throw new Error(`Worker is not running: ${worker_id}`);
      }

      // 3. 更新状态为 stopping
      this.workerRuntimeDAO.updateStatus(worker_id, 'stopping');

      // 4. 根据部署类型停止进程
      let result;
      if (config.deployment_type === 'local') {
        result = await this.localProcessManager.stopWorker(worker_id, options);
      } else {
        throw new Error(`Deployment type not supported yet: ${config.deployment_type}`);
      }

      // 5. 更新运行时信息
      this.workerRuntimeDAO.updateStatus(worker_id, 'stopped');
      this.workerRuntimeDAO.upsert(worker_id, {
        stopped_at: result.stopped_at,
        process_id: null
      });

      logger.info(`Worker stopped successfully: ${worker_id}`);

      // 6. 触发事件
      this.emit('worker-stopped', {
        worker_id,
        timestamp: Date.now()
      });

      return {
        success: true,
        worker_id,
        status: 'stopped'
      };

    } catch (error) {
      logger.error(`Failed to stop worker ${worker_id}:`, error);

      // 更新错误状态
      this.workerRuntimeDAO.updateError(worker_id, error.message);

      throw error;
    }
  }

  /**
   * 重启 Worker
   * @param {string} worker_id - Worker ID
   * @param {Object} options - 重启选项
   * @returns {Promise<Object>} 重启结果
   */
  async restartWorker(worker_id, options = {}) {
    logger.info(`Restarting worker: ${worker_id}`);

    try {
      // 记录重启
      this.workerRuntimeDAO.recordRestart(worker_id);

      // 先停止
      await this.stopWorker(worker_id, options).catch(err => {
        logger.warn(`Error during stop phase of restart: ${err.message}`);
      });

      // 短暂延迟
      const config = this.workerConfigDAO.findByWorkerId(worker_id);
      await new Promise(resolve => setTimeout(resolve, config?.restart_delay_ms || 2000));

      // 再启动
      const result = await this.startWorker(worker_id);

      logger.info(`Worker restarted successfully: ${worker_id}`);

      this.emit('worker-restarted', {
        worker_id,
        timestamp: Date.now()
      });

      return result;

    } catch (error) {
      logger.error(`Failed to restart worker ${worker_id}:`, error);
      throw error;
    }
  }

  /**
   * 获取 Worker 状态
   * @param {string} worker_id - Worker ID
   * @returns {Object} 状态信息
   */
  async getWorkerStatus(worker_id) {
    try {
      // 从数据库获取配置和运行时信息
      const config = this.workerConfigDAO.findByWorkerId(worker_id);
      if (!config) {
        throw new Error(`Worker config not found: ${worker_id}`);
      }

      const runtime = this.workerRuntimeDAO.findByWorkerId(worker_id);

      // 获取实时进程状态
      let processStatus = null;
      if (config.deployment_type === 'local') {
        processStatus = this.localProcessManager.getWorkerStatus(worker_id);
      }

      // 合并状态信息
      return {
        worker_id,
        config_id: config.id,
        name: config.name,
        deployment_type: config.deployment_type,
        host: config.host,
        port: config.port,

        // 运行时状态
        status: runtime?.status || 'stopped',
        pid: processStatus?.pid || runtime?.process_id || null,
        uptime: processStatus?.uptime || null,

        // 性能指标
        cpu_usage: runtime?.cpu_usage || 0,
        memory_usage_mb: runtime?.memory_usage_mb || 0,
        assigned_accounts: runtime?.assigned_accounts || 0,
        active_tasks: runtime?.active_tasks || 0,

        // 时间信息
        started_at: runtime?.started_at || null,
        stopped_at: runtime?.stopped_at || null,
        last_heartbeat: runtime?.last_heartbeat || null,

        // 错误信息
        error_count: runtime?.error_count || 0,
        last_error: runtime?.last_error || null,
        restart_count: runtime?.restart_count || 0,
        last_restart_at: runtime?.last_restart_at || null,

        // 版本信息
        worker_version: runtime?.worker_version || null,
        node_version: runtime?.node_version || null
      };

    } catch (error) {
      logger.error(`Failed to get worker status: ${worker_id}`, error);
      throw error;
    }
  }

  /**
   * 获取所有 Worker 状态
   * @returns {Array} 状态列表
   */
  async getAllWorkerStatus() {
    try {
      const configs = this.workerConfigDAO.findAll();
      const statuses = [];

      for (const config of configs) {
        try {
          const status = await this.getWorkerStatus(config.worker_id);
          statuses.push(status);
        } catch (error) {
          logger.error(`Failed to get status for worker ${config.worker_id}:`, error);
        }
      }

      return statuses;
    } catch (error) {
      logger.error('Failed to get all worker statuses:', error);
      throw error;
    }
  }

  /**
   * 获取 Worker 日志
   * @param {string} worker_id - Worker ID
   * @param {Object} options - 选项
   * @returns {Promise<string>} 日志内容
   */
  async getWorkerLogs(worker_id, options = {}) {
    try {
      const config = this.workerConfigDAO.findByWorkerId(worker_id);
      if (!config) {
        throw new Error(`Worker config not found: ${worker_id}`);
      }

      if (config.deployment_type === 'local') {
        return await this.localProcessManager.getWorkerLogs(worker_id, options);
      } else {
        throw new Error(`Log retrieval not supported for deployment type: ${config.deployment_type}`);
      }
    } catch (error) {
      logger.error(`Failed to get worker logs: ${worker_id}`, error);
      throw error;
    }
  }

  /**
   * 批量操作
   * @param {string} action - 操作类型 ('start', 'stop', 'restart')
   * @param {Array<string>} worker_ids - Worker ID 列表
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 操作结果
   */
  async batchOperation(action, worker_ids, options = {}) {
    logger.info(`Batch ${action} operation for ${worker_ids.length} workers`);

    const results = [];

    for (const worker_id of worker_ids) {
      try {
        let result;
        switch (action) {
          case 'start':
            result = await this.startWorker(worker_id);
            break;
          case 'stop':
            result = await this.stopWorker(worker_id, options);
            break;
          case 'restart':
            result = await this.restartWorker(worker_id, options);
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }

        results.push({
          worker_id,
          success: true,
          ...result
        });
      } catch (error) {
        results.push({
          worker_id,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * 设置进程管理器监听器
   */
  setupProcessManagerListeners() {
    // Worker 退出事件
    this.localProcessManager.on('worker-exit', async ({ worker_id, code, signal }) => {
      logger.warn(`Worker ${worker_id} exited unexpectedly, code: ${code}, signal: ${signal}`);

      try {
        // 更新状态
        const crashed = code !== 0 && code !== null;
        this.workerRuntimeDAO.updateStatus(worker_id, crashed ? 'crashed' : 'stopped');

        // 获取配置检查是否需要自动重启
        const config = this.workerConfigDAO.findByWorkerId(worker_id);

        if (config && config.auto_restart && crashed) {
          // 检查重启次数
          const attempts = this.restartAttempts.get(worker_id) || 0;

          if (attempts < config.max_restart_attempts) {
            logger.info(`Auto-restarting worker ${worker_id}, attempt ${attempts + 1}/${config.max_restart_attempts}`);

            this.restartAttempts.set(worker_id, attempts + 1);

            // 延迟后重启
            setTimeout(async () => {
              try {
                await this.startWorker(worker_id);
                logger.info(`Worker ${worker_id} auto-restarted successfully`);
              } catch (error) {
                logger.error(`Failed to auto-restart worker ${worker_id}:`, error);
              }
            }, config.restart_delay_ms || 5000);
          } else {
            logger.error(`Worker ${worker_id} exceeded max restart attempts (${config.max_restart_attempts})`);
            this.workerRuntimeDAO.updateError(worker_id, `Exceeded max restart attempts: ${config.max_restart_attempts}`);
          }
        }

        // 触发事件
        this.emit('worker-crashed', {
          worker_id,
          code,
          signal,
          timestamp: Date.now()
        });

      } catch (error) {
        logger.error(`Error handling worker exit for ${worker_id}:`, error);
      }
    });

    // Worker 错误事件
    this.localProcessManager.on('worker-error', ({ worker_id, error }) => {
      logger.error(`Worker ${worker_id} error: ${error}`);
      this.workerRuntimeDAO.updateError(worker_id, error);
    });

    // Worker 日志事件
    this.localProcessManager.on('worker-log', ({ worker_id, stream, data }) => {
      // 可以在这里记录日志到数据库
      // 为了性能考虑，这里只记录错误日志
      if (stream === 'stderr') {
        logger.debug(`[${worker_id}] ${data}`);
      }
    });
  }

  /**
   * 清理
   * 停止所有 Worker
   */
  async cleanup() {
    logger.info('Cleaning up Worker Lifecycle Manager...');

    try {
      await this.localProcessManager.cleanup();
      logger.info('Worker Lifecycle Manager cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup Worker Lifecycle Manager:', error);
      throw error;
    }
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const allConfigs = this.workerConfigDAO.findAll();
    const enabledConfigs = this.workerConfigDAO.findEnabled();

    const runningCount = this.workerRuntimeDAO.countByStatus('running');
    const stoppedCount = this.workerRuntimeDAO.countByStatus('stopped');
    const errorCount = this.workerRuntimeDAO.countByStatus('error');
    const crashedCount = this.workerRuntimeDAO.countByStatus('crashed');

    const totalCapacity = allConfigs.reduce((sum, config) => sum + config.max_accounts, 0);

    return {
      total: allConfigs.length,
      enabled: enabledConfigs.length,
      running: runningCount,
      stopped: stoppedCount,
      error: errorCount,
      crashed: crashedCount,
      total_capacity: totalCapacity
    };
  }
}

module.exports = WorkerLifecycleManager;
