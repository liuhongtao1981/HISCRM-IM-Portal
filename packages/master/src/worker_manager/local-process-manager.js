/**
 * 本地进程管理器
 * 负责在本地启动、停止和监控 Worker 进程
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const EventEmitter = require('events');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('LocalProcessManager');

class LocalProcessManager extends EventEmitter {
  constructor() {
    super();
    this.processes = new Map(); // worker_id -> { process, config, startTime, pid }
  }

  /**
   * 启动 Worker 进程
   * @param {Object} config - Worker 配置
   * @returns {Promise<Object>} 进程信息 { success, pid, worker_id }
   */
  async startWorker(config) {
    const { worker_id, port, env_variables, working_directory, command_args } = config;

    // 检查是否已经在运行
    if (this.processes.has(worker_id)) {
      const existing = this.processes.get(worker_id);
      if (existing.process && !existing.process.killed) {
        throw new Error(`Worker ${worker_id} is already running with PID ${existing.pid}`);
      }
    }

    try {
      // 准备环境变量
      const env = {
        ...process.env,
        ...(env_variables || {}),
        WORKER_ID: worker_id,
        MASTER_HOST: 'localhost',
        MASTER_PORT: process.env.PORT || 3000,
        PORT: port,
        NODE_ENV: process.env.NODE_ENV || 'production'
      };

      // Worker 脚本路径
      const workerPath = path.resolve(__dirname, '../../../worker/src/index.js');

      // 确保工作目录存在 - 必须是 packages/worker 目录才能正确解析依赖
      const cwd = working_directory || path.resolve(__dirname, '../../../worker');
      await fs.ensureDir(cwd);

      // 确保日志目录存在
      const logDir = path.join(cwd, '../logs');
      await fs.ensureDir(logDir);

      // 准备日志文件
      const stdoutLog = path.join(logDir, `${worker_id}-stdout.log`);
      const stderrLog = path.join(logDir, `${worker_id}-stderr.log`);

      const stdoutStream = fs.createWriteStream(stdoutLog, { flags: 'a' });
      const stderrStream = fs.createWriteStream(stderrLog, { flags: 'a' });

      // 准备启动参数
      const args = command_args ? command_args.split(' ') : [];

      logger.info(`Starting worker ${worker_id} at ${workerPath}`);
      logger.debug(`Working directory: ${cwd}`);
      logger.debug(`Environment: ${JSON.stringify(env, null, 2)}`);

      // 启动进程
      const child = spawn('node', [workerPath, ...args], {
        cwd,
        env,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // 保存进程引用
      const processInfo = {
        process: child,
        pid: child.pid,
        config,
        startTime: Date.now(),
        stdoutLog,
        stderrLog
      };
      this.processes.set(worker_id, processInfo);

      // 处理标准输出
      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdoutStream.write(`[${new Date().toISOString()}] ${output}`);
        this.handleWorkerOutput(worker_id, 'stdout', output);
      });

      // 处理标准错误
      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderrStream.write(`[${new Date().toISOString()}] ${output}`);
        this.handleWorkerOutput(worker_id, 'stderr', output);
      });

      // 处理进程错误
      child.on('error', (error) => {
        logger.error(`Worker ${worker_id} process error:`, error);
        this.emit('worker-error', {
          worker_id,
          error: error.message,
          timestamp: Date.now()
        });
      });

      // 处理进程退出
      child.on('exit', (code, signal) => {
        logger.warn(`Worker ${worker_id} exited with code ${code}, signal ${signal}`);

        // 关闭日志流
        stdoutStream.end();
        stderrStream.end();

        // 清理进程引用
        this.processes.delete(worker_id);

        // 触发退出事件
        this.emit('worker-exit', {
          worker_id,
          code,
          signal,
          timestamp: Date.now(),
          wasRunning: code !== null
        });
      });

      logger.info(`Worker ${worker_id} started successfully with PID ${child.pid}`);

      return {
        success: true,
        pid: child.pid,
        worker_id,
        started_at: processInfo.startTime
      };

    } catch (error) {
      logger.error(`Failed to start worker ${worker_id}:`, error);
      throw error;
    }
  }

  /**
   * 停止 Worker 进程
   * @param {string} worker_id - Worker ID
   * @param {Object} options - 停止选项
   * @param {boolean} options.graceful - 是否优雅关闭
   * @param {number} options.timeout - 超时时间（毫秒）
   * @returns {Promise<Object>} 结果 { success, worker_id }
   */
  async stopWorker(worker_id, options = {}) {
    const { graceful = true, timeout = 30000 } = options;

    const processInfo = this.processes.get(worker_id);
    if (!processInfo) {
      throw new Error(`Worker ${worker_id} is not running`);
    }

    const { process: child, pid } = processInfo;

    logger.info(`Stopping worker ${worker_id} (PID: ${pid}), graceful: ${graceful}`);

    try {
      if (graceful) {
        // 发送 SIGTERM 信号优雅关闭
        child.kill('SIGTERM');

        // 等待进程退出
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            logger.warn(`Worker ${worker_id} did not exit within ${timeout}ms, force killing`);
            try {
              child.kill('SIGKILL');
            } catch (err) {
              // 进程可能已经退出
            }
            resolve();
          }, timeout);

          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      } else {
        // 强制关闭
        child.kill('SIGKILL');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      this.processes.delete(worker_id);
      logger.info(`Worker ${worker_id} stopped successfully`);

      return {
        success: true,
        worker_id,
        stopped_at: Date.now()
      };

    } catch (error) {
      logger.error(`Failed to stop worker ${worker_id}:`, error);
      throw error;
    }
  }

  /**
   * 重启 Worker 进程
   * @param {string} worker_id - Worker ID
   * @param {Object} options - 重启选项
   * @returns {Promise<Object>} 结果
   */
  async restartWorker(worker_id, options = {}) {
    logger.info(`Restarting worker ${worker_id}`);

    const processInfo = this.processes.get(worker_id);
    if (!processInfo) {
      throw new Error(`Worker ${worker_id} is not running`);
    }

    const { config } = processInfo;

    // 停止进程
    await this.stopWorker(worker_id, options);

    // 短暂延迟
    await new Promise(resolve => setTimeout(resolve, config.restart_delay_ms || 2000));

    // 启动进程
    return await this.startWorker(config);
  }

  /**
   * 获取 Worker 状态
   * @param {string} worker_id - Worker ID
   * @returns {Object|null} 状态信息
   */
  getWorkerStatus(worker_id) {
    const processInfo = this.processes.get(worker_id);

    if (!processInfo) {
      return {
        status: 'stopped',
        worker_id
      };
    }

    const { process: child, pid, startTime } = processInfo;

    // 检查进程是否仍然存活
    try {
      process.kill(pid, 0); // 发送信号 0 检查进程是否存在
      return {
        status: 'running',
        worker_id,
        pid,
        uptime: Date.now() - startTime,
        started_at: startTime
      };
    } catch (error) {
      // 进程不存在
      this.processes.delete(worker_id);
      return {
        status: 'stopped',
        worker_id
      };
    }
  }

  /**
   * 获取所有 Worker 状态
   * @returns {Array} 状态列表
   */
  getAllWorkerStatus() {
    const statuses = [];
    for (const worker_id of this.processes.keys()) {
      statuses.push(this.getWorkerStatus(worker_id));
    }
    return statuses;
  }

  /**
   * 检查 Worker 是否在运行
   * @param {string} worker_id - Worker ID
   * @returns {boolean}
   */
  isWorkerRunning(worker_id) {
    const status = this.getWorkerStatus(worker_id);
    return status.status === 'running';
  }

  /**
   * 获取 Worker 日志
   * @param {string} worker_id - Worker ID
   * @param {Object} options - 选项
   * @param {number} options.tail - 获取最后 N 行
   * @param {string} options.stream - 'stdout' 或 'stderr'
   * @returns {Promise<string>} 日志内容
   */
  async getWorkerLogs(worker_id, options = {}) {
    const { tail = 100, stream = 'stdout' } = options;

    const processInfo = this.processes.get(worker_id);
    if (!processInfo) {
      throw new Error(`Worker ${worker_id} not found`);
    }

    const logFile = stream === 'stdout' ? processInfo.stdoutLog : processInfo.stderrLog;

    try {
      // 检查文件是否存在
      const exists = await fs.pathExists(logFile);
      if (!exists) {
        return '';
      }

      // 读取文件内容
      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.split('\n');

      // 返回最后 N 行
      const tailLines = lines.slice(-tail);
      return tailLines.join('\n');

    } catch (error) {
      logger.error(`Failed to read logs for worker ${worker_id}:`, error);
      throw error;
    }
  }

  /**
   * 处理 Worker 输出
   * @param {string} worker_id - Worker ID
   * @param {string} stream - 输出流类型
   * @param {string} data - 输出数据
   */
  handleWorkerOutput(worker_id, stream, data) {
    // 发出日志事件
    this.emit('worker-log', {
      worker_id,
      stream,
      data: data.trim(),
      timestamp: Date.now()
    });

    // 检查是否有错误关键字
    if (stream === 'stderr' || data.toLowerCase().includes('error')) {
      this.emit('worker-error-log', {
        worker_id,
        message: data.trim(),
        timestamp: Date.now()
      });
    }
  }

  /**
   * 清理所有进程
   * @returns {Promise<void>}
   */
  async cleanup() {
    logger.info('Cleaning up all worker processes...');

    const workerIds = Array.from(this.processes.keys());
    
    // 在关闭时使用更短的超时时间
    const stopPromises = workerIds.map(worker_id =>
      this.stopWorker(worker_id, { graceful: true, timeout: 3000 })
        .catch(error => logger.error(`Failed to stop worker ${worker_id}:`, error))
    );

    // 添加整体超时保护
    try {
      await Promise.race([
        Promise.all(stopPromises),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Cleanup timeout')), 5000)
        )
      ]);
    } catch (error) {
      logger.warn('Cleanup timeout reached, forcing cleanup:', error.message);
      // 强制清理所有进程
      workerIds.forEach(worker_id => {
        const processInfo = this.processes.get(worker_id);
        if (processInfo) {
          try {
            processInfo.process.kill('SIGKILL');
          } catch (err) {
            // 忽略错误，进程可能已经退出
          }
          this.processes.delete(worker_id);
        }
      });
    }
    
    logger.info('All worker processes cleaned up');
  }

  /**
   * 获取进程数量
   * @returns {number}
   */
  getProcessCount() {
    return this.processes.size;
  }
}

module.exports = LocalProcessManager;
