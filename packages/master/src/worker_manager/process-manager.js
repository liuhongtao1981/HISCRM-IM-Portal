/**
 * Worker进程管理器
 * 负责启动、停止、重启Worker进程
 */

const { fork } = require('child_process');
const path = require('path');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('process-manager');

class WorkerProcessManager {
  constructor() {
    this.workers = new Map(); // workerId -> { process, restartCount, lastRestart }
    this.maxRestarts = 5; // 最大重启次数
    this.restartWindow = 60000; // 重启计数窗口(1分钟)
  }

  /**
   * 启动Worker进程
   * @param {string} workerId - Worker ID
   * @param {object} config - Worker配置
   * @returns {ChildProcess} Worker进程
   */
  startWorker(workerId, config = {}) {
    logger.info(`Starting worker process: ${workerId}`);

    const workerPath = path.join(__dirname, '../../../worker/src/index.js');

    // 环境变量配置
    const env = {
      ...process.env,
      WORKER_ID: workerId,
      MASTER_HOST: config.masterHost || 'localhost',
      MASTER_PORT: config.masterPort || '3000',
      WORKER_PORT: config.workerPort || '4000',
      NODE_ENV: process.env.NODE_ENV || 'development',
    };

    // 使用fork启动Worker进程
    const workerProcess = fork(workerPath, [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    // 监听Worker进程输出
    workerProcess.stdout.on('data', (data) => {
      logger.debug(`Worker ${workerId} stdout: ${data.toString().trim()}`);
    });

    workerProcess.stderr.on('data', (data) => {
      logger.error(`Worker ${workerId} stderr: ${data.toString().trim()}`);
    });

    // 监听Worker进程消息
    workerProcess.on('message', (msg) => {
      logger.debug(`Worker ${workerId} IPC message:`, msg);
    });

    // 监听Worker进程退出
    workerProcess.on('exit', (code, signal) => {
      logger.warn(`Worker ${workerId} exited with code ${code}, signal ${signal}`);
      this.handleWorkerExit(workerId, code, signal);
    });

    workerProcess.on('error', (error) => {
      logger.error(`Worker ${workerId} process error:`, error);
    });

    // 记录Worker进程
    this.workers.set(workerId, {
      process: workerProcess,
      restartCount: 0,
      lastRestart: Date.now(),
      config,
    });

    logger.info(`Worker ${workerId} started with PID ${workerProcess.pid}`);

    return workerProcess;
  }

  /**
   * 处理Worker进程退出
   * @param {string} workerId - Worker ID
   * @param {number} code - 退出代码
   * @param {string} signal - 退出信号
   */
  handleWorkerExit(workerId, code, signal) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) {
      logger.warn(`Worker ${workerId} not found in registry`);
      return;
    }

    // 如果是正常退出(code 0)或SIGTERM信号，不重启
    if (code === 0 || signal === 'SIGTERM') {
      logger.info(`Worker ${workerId} exited normally, not restarting`);
      this.workers.delete(workerId);
      return;
    }

    // 检查重启次数限制
    const now = Date.now();
    if (now - workerInfo.lastRestart > this.restartWindow) {
      // 重置重启计数
      workerInfo.restartCount = 0;
    }

    workerInfo.restartCount++;

    if (workerInfo.restartCount > this.maxRestarts) {
      logger.error(
        `Worker ${workerId} exceeded max restarts (${this.maxRestarts}), giving up`
      );
      this.workers.delete(workerId);
      // TODO: 发送告警通知
      return;
    }

    // 自动重启Worker
    logger.info(
      `Auto-restarting worker ${workerId} (attempt ${workerInfo.restartCount}/${this.maxRestarts})`
    );

    setTimeout(() => {
      this.startWorker(workerId, workerInfo.config);
    }, 2000); // 2秒延迟重启
  }

  /**
   * 停止Worker进程
   * @param {string} workerId - Worker ID
   * @param {number} timeout - 优雅退出超时(毫秒)
   * @returns {Promise<void>}
   */
  async stopWorker(workerId, timeout = 10000) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) {
      logger.warn(`Worker ${workerId} not found, cannot stop`);
      return;
    }

    logger.info(`Stopping worker ${workerId}`);

    const { process: workerProcess } = workerInfo;

    return new Promise((resolve) => {
      const killTimeout = setTimeout(() => {
        logger.warn(`Worker ${workerId} did not exit gracefully, force killing`);
        workerProcess.kill('SIGKILL');
        resolve();
      }, timeout);

      workerProcess.once('exit', () => {
        clearTimeout(killTimeout);
        logger.info(`Worker ${workerId} stopped`);
        this.workers.delete(workerId);
        resolve();
      });

      // 发送SIGTERM信号要求优雅退出
      workerProcess.kill('SIGTERM');
    });
  }

  /**
   * 重启Worker进程
   * @param {string} workerId - Worker ID
   * @returns {Promise<ChildProcess>}
   */
  async restartWorker(workerId) {
    logger.info(`Restarting worker ${workerId}`);

    const workerInfo = this.workers.get(workerId);
    const config = workerInfo ? workerInfo.config : {};

    await this.stopWorker(workerId);
    return this.startWorker(workerId, config);
  }

  /**
   * 停止所有Worker进程
   * @returns {Promise<void>}
   */
  async stopAllWorkers() {
    logger.info(`Stopping all workers (${this.workers.size} total)`);

    const stopPromises = Array.from(this.workers.keys()).map((workerId) =>
      this.stopWorker(workerId)
    );

    await Promise.all(stopPromises);
    logger.info('All workers stopped');
  }

  /**
   * 获取运行中的Worker列表
   * @returns {Array<string>} Worker ID列表
   */
  getRunningWorkers() {
    return Array.from(this.workers.keys());
  }

  /**
   * 检查Worker是否在运行
   * @param {string} workerId - Worker ID
   * @returns {boolean}
   */
  isWorkerRunning(workerId) {
    return this.workers.has(workerId);
  }

  /**
   * 获取Worker进程信息
   * @param {string} workerId - Worker ID
   * @returns {object|null}
   */
  getWorkerInfo(workerId) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) return null;

    return {
      workerId,
      pid: workerInfo.process.pid,
      restartCount: workerInfo.restartCount,
      lastRestart: workerInfo.lastRestart,
      uptime: Date.now() - workerInfo.lastRestart,
    };
  }
}

module.exports = WorkerProcessManager;
