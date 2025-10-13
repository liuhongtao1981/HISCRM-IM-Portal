/**
 * Proxies API 路由
 * 提供代理配置管理
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

const logger = createLogger('proxies-api');

/**
 * 创建 Proxies 路由
 * @param {Database} db - SQLite数据库实例
 * @returns {Router}
 */
function createProxiesRouter(db) {
  const router = express.Router();

  /**
   * GET /api/v1/proxies - 获取代理列表
   */
  router.get('/', (req, res) => {
    try {
      const filters = {};

      // 支持按状态筛选
      if (req.query.status) {
        filters.status = req.query.status;
      }

      // 支持按国家筛选
      if (req.query.country) {
        filters.country = req.query.country;
      }

      // 构建查询
      let query = 'SELECT * FROM proxies';
      const params = [];
      const conditions = [];

      if (filters.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }

      if (filters.country) {
        conditions.push('country = ?');
        params.push(filters.country);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY created_at DESC';

      const proxies = db.prepare(query).all(...params);

      // 不返回密码
      const proxiesData = proxies.map((proxy) => {
        const { password, ...safeProxy } = proxy;
        return {
          ...safeProxy,
          has_password: !!password,
        };
      });

      res.json({
        success: true,
        data: proxiesData,
      });
    } catch (error) {
      logger.error('Failed to get proxies:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * GET /api/v1/proxies/:id - 获取单个代理
   */
  router.get('/:id', (req, res) => {
    try {
      const proxy = db.prepare('SELECT * FROM proxies WHERE id = ?').get(req.params.id);

      if (!proxy) {
        return res.status(404).json({
          success: false,
          error: 'Proxy not found',
        });
      }

      // 不返回密码
      const { password, ...safeProxy } = proxy;

      res.json({
        success: true,
        data: {
          ...safeProxy,
          has_password: !!password,
        },
      });
    } catch (error) {
      logger.error(`Failed to get proxy ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * POST /api/v1/proxies - 创建代理
   */
  router.post('/', (req, res) => {
    try {
      const { name, server, protocol, username, password, country, city } = req.body;

      // 验证必填字段
      if (!name || !server || !protocol) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, server, protocol',
        });
      }

      // 验证协议
      if (!['http', 'https', 'socks5'].includes(protocol)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid protocol. Must be: http, https, or socks5',
        });
      }

      // 验证服务器格式 (host:port)
      if (!/^[\w\.\-]+:\d+$/.test(server)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid server format. Expected: host:port',
        });
      }

      // 检查是否已存在
      const existing = db.prepare('SELECT id FROM proxies WHERE server = ?').get(server);
      if (existing) {
        return res.status(400).json({
          success: false,
          error: `Proxy with server ${server} already exists`,
        });
      }

      const id = uuidv4();
      const now = Math.floor(Date.now() / 1000);

      const stmt = db.prepare(`
        INSERT INTO proxies (
          id, name, server, protocol, username, password,
          country, city, status, success_rate, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        name,
        server,
        protocol,
        username || null,
        password || null,
        country || null,
        city || null,
        'active',
        1.0,
        now,
        now
      );

      const proxy = db.prepare('SELECT * FROM proxies WHERE id = ?').get(id);

      // 不返回密码
      const { password: pwd, ...safeProxy } = proxy;

      res.status(201).json({
        success: true,
        data: {
          ...safeProxy,
          has_password: !!pwd,
        },
      });
    } catch (error) {
      logger.error('Failed to create proxy:', error);

      if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({
          success: false,
          error: 'Proxy with this server already exists',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * PATCH /api/v1/proxies/:id - 更新代理
   */
  router.patch('/:id', (req, res) => {
    try {
      const allowedUpdates = [
        'name',
        'server',
        'protocol',
        'username',
        'password',
        'country',
        'city',
        'status',
      ];

      const updates = {};
      for (const key of Object.keys(req.body)) {
        if (allowedUpdates.includes(key)) {
          updates[key] = req.body[key];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid fields to update',
        });
      }

      // 验证协议（如果提供）
      if (updates.protocol && !['http', 'https', 'socks5'].includes(updates.protocol)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid protocol. Must be: http, https, or socks5',
        });
      }

      // 验证服务器格式（如果提供）
      if (updates.server && !/^[\w\.\-]+:\d+$/.test(updates.server)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid server format. Expected: host:port',
        });
      }

      // 检查代理是否存在
      const proxy = db.prepare('SELECT * FROM proxies WHERE id = ?').get(req.params.id);
      if (!proxy) {
        return res.status(404).json({
          success: false,
          error: 'Proxy not found',
        });
      }

      // 构建更新语句
      const setClauses = Object.keys(updates).map((key) => `${key} = ?`);
      const values = Object.values(updates);
      values.push(Math.floor(Date.now() / 1000)); // updated_at
      values.push(req.params.id);

      const updateQuery = `
        UPDATE proxies
        SET ${setClauses.join(', ')}, updated_at = ?
        WHERE id = ?
      `;

      db.prepare(updateQuery).run(...values);

      const updatedProxy = db.prepare('SELECT * FROM proxies WHERE id = ?').get(req.params.id);

      // 不返回密码
      const { password, ...safeProxy } = updatedProxy;

      res.json({
        success: true,
        data: {
          ...safeProxy,
          has_password: !!password,
        },
      });
    } catch (error) {
      logger.error(`Failed to update proxy ${req.params.id}:`, error);

      if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({
          success: false,
          error: 'Proxy with this server already exists',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * DELETE /api/v1/proxies/:id - 删除代理
   */
  router.delete('/:id', (req, res) => {
    try {
      // 检查是否有 Worker 正在使用此代理
      const assignedWorker = db
        .prepare('SELECT COUNT(*) as count FROM workers WHERE proxy_id = ?')
        .get(req.params.id);

      if (assignedWorker && assignedWorker.count > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete proxy that is assigned to workers',
        });
      }

      const result = db.prepare('DELETE FROM proxies WHERE id = ?').run(req.params.id);

      if (result.changes === 0) {
        return res.status(404).json({
          success: false,
          error: 'Proxy not found',
        });
      }

      res.json({
        success: true,
        message: 'Proxy deleted successfully',
      });
    } catch (error) {
      logger.error(`Failed to delete proxy ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * POST /api/v1/proxies/:id/test - 测试代理连接
   */
  router.post('/:id/test', async (req, res) => {
    try {
      const proxy = db.prepare('SELECT * FROM proxies WHERE id = ?').get(req.params.id);

      if (!proxy) {
        return res.status(404).json({
          success: false,
          error: 'Proxy not found',
        });
      }

      logger.info(`Testing proxy ${proxy.name} (${proxy.server})...`);

      const startTime = Date.now();
      let success = false;
      let errorMessage = null;
      let responseTime = 0;

      try {
        // 构建代理 URL
        let proxyUrl;
        if (proxy.username && proxy.password) {
          proxyUrl = `${proxy.protocol}://${proxy.username}:${proxy.password}@${proxy.server}`;
        } else {
          proxyUrl = `${proxy.protocol}://${proxy.server}`;
        }

        // 创建代理 Agent
        let agent;
        if (proxy.protocol === 'socks5') {
          agent = new SocksProxyAgent(proxyUrl);
        } else {
          agent = new HttpsProxyAgent(proxyUrl);
        }

        // 测试请求（使用 httpbin.org 或其他测试服务）
        const response = await axios.get('https://httpbin.org/ip', {
          httpAgent: agent,
          httpsAgent: agent,
          timeout: 10000,
        });

        responseTime = Date.now() - startTime;

        if (response.status === 200) {
          success = true;
          logger.info(`Proxy test successful: ${proxy.name}, IP: ${response.data.origin}`);
        }
      } catch (error) {
        responseTime = Date.now() - startTime;
        errorMessage = error.message;
        logger.warn(`Proxy test failed: ${proxy.name} - ${errorMessage}`);
      }

      // 更新代理状态
      const now = Math.floor(Date.now() / 1000);
      const newStatus = success ? 'active' : 'failed';

      db.prepare(
        'UPDATE proxies SET status = ?, last_check_time = ?, response_time = ? WHERE id = ?'
      ).run(newStatus, now, responseTime, req.params.id);

      res.json({
        success: true,
        data: {
          proxy_id: proxy.id,
          test_success: success,
          response_time: responseTime,
          error_message: errorMessage,
          status: newStatus,
        },
      });
    } catch (error) {
      logger.error(`Failed to test proxy ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  return router;
}

module.exports = createProxiesRouter;
