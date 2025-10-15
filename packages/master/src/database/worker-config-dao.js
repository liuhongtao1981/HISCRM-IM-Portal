/**
 * Worker 配置数据访问对象 (DAO)
 * 负责 worker_configs 表的 CRUD 操作
 */

const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('WorkerConfigDAO');

class WorkerConfigDAO {
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
      INSERT INTO worker_configs (
        id, worker_id, name, description,
        deployment_type, host, port,
        max_accounts, max_memory_mb, cpu_cores,
        env_variables, command_args, working_directory,
        proxy_id, browser_config,
        auto_start, auto_restart, restart_delay_ms, max_restart_attempts,
        ssh_host, ssh_port, ssh_user, ssh_key_path, ssh_password,
        docker_image, docker_network, docker_volumes,
        enabled, created_at, updated_at
      ) VALUES (
        @id, @worker_id, @name, @description,
        @deployment_type, @host, @port,
        @max_accounts, @max_memory_mb, @cpu_cores,
        @env_variables, @command_args, @working_directory,
        @proxy_id, @browser_config,
        @auto_start, @auto_restart, @restart_delay_ms, @max_restart_attempts,
        @ssh_host, @ssh_port, @ssh_user, @ssh_key_path, @ssh_password,
        @docker_image, @docker_network, @docker_volumes,
        @enabled, @created_at, @updated_at
      )
    `);

    // 查询所有
    this.findAllStmt = this.db.prepare(`
      SELECT * FROM worker_configs
      ORDER BY created_at DESC
    `);

    // 根据ID查询
    this.findByIdStmt = this.db.prepare(`
      SELECT * FROM worker_configs WHERE id = ?
    `);

    // 根据 worker_id 查询
    this.findByWorkerIdStmt = this.db.prepare(`
      SELECT * FROM worker_configs WHERE worker_id = ?
    `);

    // 查询启用的配置
    this.findEnabledStmt = this.db.prepare(`
      SELECT * FROM worker_configs WHERE enabled = 1
      ORDER BY created_at DESC
    `);

    // 查询自动启动的配置
    this.findAutoStartStmt = this.db.prepare(`
      SELECT * FROM worker_configs WHERE enabled = 1 AND auto_start = 1
      ORDER BY created_at DESC
    `);

    // 更新
    this.updateStmt = this.db.prepare(`
      UPDATE worker_configs SET
        name = @name,
        description = @description,
        deployment_type = @deployment_type,
        host = @host,
        port = @port,
        max_accounts = @max_accounts,
        max_memory_mb = @max_memory_mb,
        cpu_cores = @cpu_cores,
        env_variables = @env_variables,
        command_args = @command_args,
        working_directory = @working_directory,
        proxy_id = @proxy_id,
        browser_config = @browser_config,
        auto_start = @auto_start,
        auto_restart = @auto_restart,
        restart_delay_ms = @restart_delay_ms,
        max_restart_attempts = @max_restart_attempts,
        ssh_host = @ssh_host,
        ssh_port = @ssh_port,
        ssh_user = @ssh_user,
        ssh_key_path = @ssh_key_path,
        ssh_password = @ssh_password,
        docker_image = @docker_image,
        docker_network = @docker_network,
        docker_volumes = @docker_volumes,
        enabled = @enabled,
        updated_at = @updated_at
      WHERE id = @id
    `);

    // 删除
    this.deleteStmt = this.db.prepare(`
      DELETE FROM worker_configs WHERE id = ?
    `);

    // 统计
    this.countStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM worker_configs
    `);

    this.countEnabledStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM worker_configs WHERE enabled = 1
    `);
  }

  /**
   * 创建 Worker 配置
   * @param {Object} config - Worker 配置对象
   * @returns {Object} 创建的配置
   */
  create(config) {
    const now = Date.now();
    const id = uuidv4();

    const data = {
      id,
      worker_id: config.worker_id,
      name: config.name,
      description: config.description || null,

      // 部署配置
      deployment_type: config.deployment_type || 'local',
      host: config.host,
      port: config.port || 4001,

      // 进程配置
      max_accounts: config.max_accounts || 10,
      max_memory_mb: config.max_memory_mb || 2048,
      cpu_cores: config.cpu_cores || 2,

      // 环境配置
      env_variables: config.env_variables ? JSON.stringify(config.env_variables) : null,
      command_args: config.command_args || null,
      working_directory: config.working_directory || null,

      // 代理配置
      proxy_id: config.proxy_id || null,
      browser_config: config.browser_config ? JSON.stringify(config.browser_config) : null,

      // 自动管理
      auto_start: config.auto_start !== undefined ? (config.auto_start ? 1 : 0) : 1,
      auto_restart: config.auto_restart !== undefined ? (config.auto_restart ? 1 : 0) : 1,
      restart_delay_ms: config.restart_delay_ms || 5000,
      max_restart_attempts: config.max_restart_attempts || 3,

      // SSH配置
      ssh_host: config.ssh_host || null,
      ssh_port: config.ssh_port || 22,
      ssh_user: config.ssh_user || null,
      ssh_key_path: config.ssh_key_path || null,
      ssh_password: config.ssh_password || null,

      // Docker配置
      docker_image: config.docker_image || null,
      docker_network: config.docker_network || null,
      docker_volumes: config.docker_volumes ? JSON.stringify(config.docker_volumes) : null,

      // 状态
      enabled: config.enabled !== undefined ? (config.enabled ? 1 : 0) : 1,
      created_at: now,
      updated_at: now
    };

    try {
      this.createStmt.run(data);
      logger.info(`Created worker config: ${config.worker_id}`);
      return this.findById(id);
    } catch (error) {
      logger.error(`Failed to create worker config: ${config.worker_id}`, error);
      throw error;
    }
  }

  /**
   * 查询所有配置
   * @returns {Array} 配置列表
   */
  findAll() {
    try {
      const rows = this.findAllStmt.all();
      return rows.map(row => this.deserialize(row));
    } catch (error) {
      logger.error('Failed to find all worker configs', error);
      throw error;
    }
  }

  /**
   * 根据 ID 查询配置
   * @param {string} id - 配置 ID
   * @returns {Object|null} 配置对象
   */
  findById(id) {
    try {
      const row = this.findByIdStmt.get(id);
      return row ? this.deserialize(row) : null;
    } catch (error) {
      logger.error(`Failed to find worker config by id: ${id}`, error);
      throw error;
    }
  }

  /**
   * 根据 worker_id 查询配置
   * @param {string} worker_id - Worker ID
   * @returns {Object|null} 配置对象
   */
  findByWorkerId(worker_id) {
    try {
      const row = this.findByWorkerIdStmt.get(worker_id);
      return row ? this.deserialize(row) : null;
    } catch (error) {
      logger.error(`Failed to find worker config by worker_id: ${worker_id}`, error);
      throw error;
    }
  }

  /**
   * 查询启用的配置
   * @returns {Array} 配置列表
   */
  findEnabled() {
    try {
      const rows = this.findEnabledStmt.all();
      return rows.map(row => this.deserialize(row));
    } catch (error) {
      logger.error('Failed to find enabled worker configs', error);
      throw error;
    }
  }

  /**
   * 查询自动启动的配置
   * @returns {Array} 配置列表
   */
  findAutoStart() {
    try {
      const rows = this.findAutoStartStmt.all();
      return rows.map(row => this.deserialize(row));
    } catch (error) {
      logger.error('Failed to find auto-start worker configs', error);
      throw error;
    }
  }

  /**
   * 更新配置
   * @param {string} id - 配置 ID
   * @param {Object} updates - 更新字段
   * @returns {Object|null} 更新后的配置
   */
  update(id, updates) {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`Worker config not found: ${id}`);
    }

    const data = {
      id,
      name: updates.name !== undefined ? updates.name : existing.name,
      description: updates.description !== undefined ? updates.description : existing.description,

      deployment_type: updates.deployment_type !== undefined ? updates.deployment_type : existing.deployment_type,
      host: updates.host !== undefined ? updates.host : existing.host,
      port: updates.port !== undefined ? updates.port : existing.port,

      max_accounts: updates.max_accounts !== undefined ? updates.max_accounts : existing.max_accounts,
      max_memory_mb: updates.max_memory_mb !== undefined ? updates.max_memory_mb : existing.max_memory_mb,
      cpu_cores: updates.cpu_cores !== undefined ? updates.cpu_cores : existing.cpu_cores,

      env_variables: updates.env_variables !== undefined ? JSON.stringify(updates.env_variables) : (existing.env_variables ? JSON.stringify(existing.env_variables) : null),
      command_args: updates.command_args !== undefined ? updates.command_args : existing.command_args,
      working_directory: updates.working_directory !== undefined ? updates.working_directory : existing.working_directory,

      proxy_id: updates.proxy_id !== undefined ? updates.proxy_id : existing.proxy_id,
      browser_config: updates.browser_config !== undefined ? JSON.stringify(updates.browser_config) : (existing.browser_config ? JSON.stringify(existing.browser_config) : null),

      auto_start: updates.auto_start !== undefined ? (updates.auto_start ? 1 : 0) : (existing.auto_start ? 1 : 0),
      auto_restart: updates.auto_restart !== undefined ? (updates.auto_restart ? 1 : 0) : (existing.auto_restart ? 1 : 0),
      restart_delay_ms: updates.restart_delay_ms !== undefined ? updates.restart_delay_ms : existing.restart_delay_ms,
      max_restart_attempts: updates.max_restart_attempts !== undefined ? updates.max_restart_attempts : existing.max_restart_attempts,

      ssh_host: updates.ssh_host !== undefined ? updates.ssh_host : existing.ssh_host,
      ssh_port: updates.ssh_port !== undefined ? updates.ssh_port : existing.ssh_port,
      ssh_user: updates.ssh_user !== undefined ? updates.ssh_user : existing.ssh_user,
      ssh_key_path: updates.ssh_key_path !== undefined ? updates.ssh_key_path : existing.ssh_key_path,
      ssh_password: updates.ssh_password !== undefined ? updates.ssh_password : existing.ssh_password,

      docker_image: updates.docker_image !== undefined ? updates.docker_image : existing.docker_image,
      docker_network: updates.docker_network !== undefined ? updates.docker_network : existing.docker_network,
      docker_volumes: updates.docker_volumes !== undefined ? JSON.stringify(updates.docker_volumes) : (existing.docker_volumes ? JSON.stringify(existing.docker_volumes) : null),

      enabled: updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : (existing.enabled ? 1 : 0),
      updated_at: Date.now()
    };

    try {
      this.updateStmt.run(data);
      logger.info(`Updated worker config: ${id}`);
      return this.findById(id);
    } catch (error) {
      logger.error(`Failed to update worker config: ${id}`, error);
      throw error;
    }
  }

  /**
   * 删除配置
   * @param {string} id - 配置 ID
   * @returns {boolean} 是否成功删除
   */
  delete(id) {
    try {
      const result = this.deleteStmt.run(id);
      logger.info(`Deleted worker config: ${id}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to delete worker config: ${id}`, error);
      throw error;
    }
  }

  /**
   * 统计总数
   * @returns {number} 配置总数
   */
  count() {
    try {
      const result = this.countStmt.get();
      return result.count;
    } catch (error) {
      logger.error('Failed to count worker configs', error);
      throw error;
    }
  }

  /**
   * 统计启用的配置数
   * @returns {number} 启用的配置数
   */
  countEnabled() {
    try {
      const result = this.countEnabledStmt.get();
      return result.count;
    } catch (error) {
      logger.error('Failed to count enabled worker configs', error);
      throw error;
    }
  }

  /**
   * 反序列化数据库行
   * @param {Object} row - 数据库行
   * @returns {Object} 配置对象
   */
  deserialize(row) {
    return {
      id: row.id,
      worker_id: row.worker_id,
      name: row.name,
      description: row.description,

      deployment_type: row.deployment_type,
      host: row.host,
      port: row.port,

      max_accounts: row.max_accounts,
      max_memory_mb: row.max_memory_mb,
      cpu_cores: row.cpu_cores,

      env_variables: row.env_variables ? JSON.parse(row.env_variables) : null,
      command_args: row.command_args,
      working_directory: row.working_directory,

      proxy_id: row.proxy_id,
      browser_config: row.browser_config ? JSON.parse(row.browser_config) : null,

      auto_start: Boolean(row.auto_start),
      auto_restart: Boolean(row.auto_restart),
      restart_delay_ms: row.restart_delay_ms,
      max_restart_attempts: row.max_restart_attempts,

      ssh_host: row.ssh_host,
      ssh_port: row.ssh_port,
      ssh_user: row.ssh_user,
      ssh_key_path: row.ssh_key_path,
      ssh_password: row.ssh_password,

      docker_image: row.docker_image,
      docker_network: row.docker_network,
      docker_volumes: row.docker_volumes ? JSON.parse(row.docker_volumes) : null,

      enabled: Boolean(row.enabled),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

module.exports = WorkerConfigDAO;
