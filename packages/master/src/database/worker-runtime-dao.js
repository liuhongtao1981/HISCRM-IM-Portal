/**
 * Worker 运行时状态数据访问对象 (DAO)
 * 负责 worker_runtime 表的 CRUD 操作
 */

const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('WorkerRuntimeDAO');

class WorkerRuntimeDAO {
  constructor(db) {
    this.db = db;
    this.initStatements();
  }

  /**
   * 初始化预编译语句
   */
  initStatements() {
    // 创建
    this.createStmt = this.db.prepare(`
      INSERT INTO worker_runtime (
        id, worker_id, config_id,
        process_id, container_id, pod_name,
        status, started_at, stopped_at, last_heartbeat,
        cpu_usage, memory_usage_mb, assigned_accounts, active_tasks,
        error_count, last_error, restart_count, last_restart_at,
        worker_version, node_version,
        created_at, updated_at
      ) VALUES (
        @id, @worker_id, @config_id,
        @process_id, @container_id, @pod_name,
        @status, @started_at, @stopped_at, @last_heartbeat,
        @cpu_usage, @memory_usage_mb, @assigned_accounts, @active_tasks,
        @error_count, @last_error, @restart_count, @last_restart_at,
        @worker_version, @node_version,
        @created_at, @updated_at
      )
    `);

    // 查询所有
    this.findAllStmt = this.db.prepare(`
      SELECT * FROM worker_runtime ORDER BY updated_at DESC
    `);

    // 根据ID查询
    this.findByIdStmt = this.db.prepare(`
      SELECT * FROM worker_runtime WHERE id = ?
    `);

    // 根据 worker_id 查询
    this.findByWorkerIdStmt = this.db.prepare(`
      SELECT * FROM worker_runtime WHERE worker_id = ?
    `);

    // 根据状态查询
    this.findByStatusStmt = this.db.prepare(`
      SELECT * FROM worker_runtime WHERE status = ?
      ORDER BY updated_at DESC
    `);

    // 查询运行中的
    this.findRunningStmt = this.db.prepare(`
      SELECT * FROM worker_runtime WHERE status = 'running'
      ORDER BY updated_at DESC
    `);

    // 更新状态
    this.updateStatusStmt = this.db.prepare(`
      UPDATE worker_runtime SET
        status = @status,
        updated_at = @updated_at
      WHERE worker_id = @worker_id
    `);

    // 更新进程信息
    this.updateProcessStmt = this.db.prepare(`
      UPDATE worker_runtime SET
        process_id = @process_id,
        container_id = @container_id,
        pod_name = @pod_name,
        started_at = @started_at,
        updated_at = @updated_at
      WHERE worker_id = @worker_id
    `);

    // 更新性能指标
    this.updateMetricsStmt = this.db.prepare(`
      UPDATE worker_runtime SET
        cpu_usage = @cpu_usage,
        memory_usage_mb = @memory_usage_mb,
        assigned_accounts = @assigned_accounts,
        active_tasks = @active_tasks,
        last_heartbeat = @last_heartbeat,
        updated_at = @updated_at
      WHERE worker_id = @worker_id
    `);

    // 更新错误信息
    this.updateErrorStmt = this.db.prepare(`
      UPDATE worker_runtime SET
        error_count = error_count + 1,
        last_error = @last_error,
        updated_at = @updated_at
      WHERE worker_id = @worker_id
    `);

    // 记录重启
    this.recordRestartStmt = this.db.prepare(`
      UPDATE worker_runtime SET
        restart_count = restart_count + 1,
        last_restart_at = @last_restart_at,
        updated_at = @updated_at
      WHERE worker_id = @worker_id
    `);

    // 删除
    this.deleteStmt = this.db.prepare(`
      DELETE FROM worker_runtime WHERE id = ?
    `);

    this.deleteByWorkerIdStmt = this.db.prepare(`
      DELETE FROM worker_runtime WHERE worker_id = ?
    `);

    // 统计
    this.countByStatusStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM worker_runtime WHERE status = ?
    `);
  }

  /**
   * 创建运行时记录
   * @param {Object} runtime - 运行时数据
   * @returns {Object} 创建的记录
   */
  create(runtime) {
    const now = Date.now();
    const id = uuidv4();

    const data = {
      id,
      worker_id: runtime.worker_id,
      config_id: runtime.config_id,

      process_id: runtime.process_id || null,
      container_id: runtime.container_id || null,
      pod_name: runtime.pod_name || null,

      status: runtime.status || 'stopped',
      started_at: runtime.started_at || null,
      stopped_at: runtime.stopped_at || null,
      last_heartbeat: runtime.last_heartbeat || null,

      cpu_usage: runtime.cpu_usage || 0,
      memory_usage_mb: runtime.memory_usage_mb || 0,
      assigned_accounts: runtime.assigned_accounts || 0,
      active_tasks: runtime.active_tasks || 0,

      error_count: runtime.error_count || 0,
      last_error: runtime.last_error || null,
      restart_count: runtime.restart_count || 0,
      last_restart_at: runtime.last_restart_at || null,

      worker_version: runtime.worker_version || null,
      node_version: runtime.node_version || null,

      created_at: now,
      updated_at: now
    };

    try {
      this.createStmt.run(data);
      logger.info(`Created worker runtime: ${runtime.worker_id}`);
      return this.findById(id);
    } catch (error) {
      logger.error(`Failed to create worker runtime: ${runtime.worker_id}`, error);
      throw error;
    }
  }

  /**
   * 查询所有运行时记录
   * @returns {Array} 运行时记录列表
   */
  findAll() {
    try {
      return this.findAllStmt.all();
    } catch (error) {
      logger.error('Failed to find all worker runtimes', error);
      throw error;
    }
  }

  /**
   * 根据 ID 查询
   * @param {string} id - 记录 ID
   * @returns {Object|null} 运行时记录
   */
  findById(id) {
    try {
      return this.findByIdStmt.get(id);
    } catch (error) {
      logger.error(`Failed to find worker runtime by id: ${id}`, error);
      throw error;
    }
  }

  /**
   * 根据 worker_id 查询
   * @param {string} worker_id - Worker ID
   * @returns {Object|null} 运行时记录
   */
  findByWorkerId(worker_id) {
    try {
      return this.findByWorkerIdStmt.get(worker_id);
    } catch (error) {
      logger.error(`Failed to find worker runtime by worker_id: ${worker_id}`, error);
      throw error;
    }
  }

  /**
   * 根据状态查询
   * @param {string} status - 状态
   * @returns {Array} 运行时记录列表
   */
  findByStatus(status) {
    try {
      return this.findByStatusStmt.all(status);
    } catch (error) {
      logger.error(`Failed to find worker runtimes by status: ${status}`, error);
      throw error;
    }
  }

  /**
   * 查询运行中的 Worker
   * @returns {Array} 运行时记录列表
   */
  findRunning() {
    try {
      return this.findRunningStmt.all();
    } catch (error) {
      logger.error('Failed to find running worker runtimes', error);
      throw error;
    }
  }

  /**
   * 更新状态
   * @param {string} worker_id - Worker ID
   * @param {string} status - 新状态
   * @returns {boolean} 是否成功
   */
  updateStatus(worker_id, status) {
    try {
      const result = this.updateStatusStmt.run({
        worker_id,
        status,
        updated_at: Date.now()
      });
      logger.info(`Updated worker status: ${worker_id} -> ${status}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to update worker status: ${worker_id}`, error);
      throw error;
    }
  }

  /**
   * 更新进程信息
   * @param {string} worker_id - Worker ID
   * @param {Object} processInfo - 进程信息
   * @returns {boolean} 是否成功
   */
  updateProcess(worker_id, processInfo) {
    try {
      const result = this.updateProcessStmt.run({
        worker_id,
        process_id: processInfo.process_id || null,
        container_id: processInfo.container_id || null,
        pod_name: processInfo.pod_name || null,
        started_at: processInfo.started_at || Date.now(),
        updated_at: Date.now()
      });
      logger.info(`Updated worker process info: ${worker_id}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to update worker process: ${worker_id}`, error);
      throw error;
    }
  }

  /**
   * 更新性能指标
   * @param {string} worker_id - Worker ID
   * @param {Object} metrics - 性能指标
   * @returns {boolean} 是否成功
   */
  updateMetrics(worker_id, metrics) {
    try {
      const result = this.updateMetricsStmt.run({
        worker_id,
        cpu_usage: metrics.cpu_usage || 0,
        memory_usage_mb: metrics.memory_usage_mb || 0,
        assigned_accounts: metrics.assigned_accounts || 0,
        active_tasks: metrics.active_tasks || 0,
        last_heartbeat: metrics.last_heartbeat || Date.now(),
        updated_at: Date.now()
      });
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to update worker metrics: ${worker_id}`, error);
      throw error;
    }
  }

  /**
   * 更新错误信息
   * @param {string} worker_id - Worker ID
   * @param {string} error - 错误信息
   * @returns {boolean} 是否成功
   */
  updateError(worker_id, error) {
    try {
      const result = this.updateErrorStmt.run({
        worker_id,
        last_error: error,
        updated_at: Date.now()
      });
      logger.info(`Recorded error for worker: ${worker_id}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to update worker error: ${worker_id}`, error);
      throw error;
    }
  }

  /**
   * 记录重启
   * @param {string} worker_id - Worker ID
   * @returns {boolean} 是否成功
   */
  recordRestart(worker_id) {
    try {
      const result = this.recordRestartStmt.run({
        worker_id,
        last_restart_at: Date.now(),
        updated_at: Date.now()
      });
      logger.info(`Recorded restart for worker: ${worker_id}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to record restart: ${worker_id}`, error);
      throw error;
    }
  }

  /**
   * 删除运行时记录
   * @param {string} id - 记录 ID
   * @returns {boolean} 是否成功
   */
  delete(id) {
    try {
      const result = this.deleteStmt.run(id);
      logger.info(`Deleted worker runtime: ${id}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to delete worker runtime: ${id}`, error);
      throw error;
    }
  }

  /**
   * 根据 worker_id 删除
   * @param {string} worker_id - Worker ID
   * @returns {boolean} 是否成功
   */
  deleteByWorkerId(worker_id) {
    try {
      const result = this.deleteByWorkerIdStmt.run(worker_id);
      logger.info(`Deleted worker runtime by worker_id: ${worker_id}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to delete worker runtime by worker_id: ${worker_id}`, error);
      throw error;
    }
  }

  /**
   * 统计指定状态的 Worker 数量
   * @param {string} status - 状态
   * @returns {number} 数量
   */
  countByStatus(status) {
    try {
      const result = this.countByStatusStmt.get(status);
      return result.count;
    } catch (error) {
      logger.error(`Failed to count workers by status: ${status}`, error);
      throw error;
    }
  }

  /**
   * 创建或更新运行时记录
   * @param {string} worker_id - Worker ID
   * @param {Object} runtime - 运行时数据
   * @returns {Object} 运行时记录
   */
  upsert(worker_id, runtime) {
    const existing = this.findByWorkerId(worker_id);

    if (existing) {
      // 更新现有记录 - 确保所有参数都有默认值
      const updates = {
        worker_id,
        process_id: runtime.process_id ?? existing.process_id,
        container_id: runtime.container_id ?? existing.container_id,
        pod_name: runtime.pod_name ?? existing.pod_name,
        status: runtime.status ?? existing.status,
        started_at: runtime.started_at ?? existing.started_at,
        stopped_at: runtime.stopped_at ?? existing.stopped_at,
        last_heartbeat: runtime.last_heartbeat ?? existing.last_heartbeat,
        cpu_usage: runtime.cpu_usage ?? existing.cpu_usage,
        memory_usage_mb: runtime.memory_usage_mb ?? existing.memory_usage_mb,
        assigned_accounts: runtime.assigned_accounts ?? existing.assigned_accounts,
        active_tasks: runtime.active_tasks ?? existing.active_tasks,
        worker_version: runtime.worker_version ?? existing.worker_version,
        node_version: runtime.node_version ?? existing.node_version,
        updated_at: Date.now()
      };
      
      const stmt = this.db.prepare(`
        UPDATE worker_runtime SET
          process_id = @process_id,
          container_id = @container_id,
          pod_name = @pod_name,
          status = @status,
          started_at = @started_at,
          stopped_at = @stopped_at,
          last_heartbeat = @last_heartbeat,
          cpu_usage = @cpu_usage,
          memory_usage_mb = @memory_usage_mb,
          assigned_accounts = @assigned_accounts,
          active_tasks = @active_tasks,
          worker_version = @worker_version,
          node_version = @node_version,
          updated_at = @updated_at
        WHERE worker_id = @worker_id
      `);
      stmt.run(updates);
      return this.findByWorkerId(worker_id);
    } else {
      // 创建新记录
      return this.create({ ...runtime, worker_id });
    }
  }
}

module.exports = WorkerRuntimeDAO;
