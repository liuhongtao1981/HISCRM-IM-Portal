/**
 * ProxyManager - 代理管理器
 * 负责:
 * 1. 代理健康检查
 * 2. 代理降级策略 (主代理 → 备用代理 → 直连)
 * 3. 代理连接重试
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('proxy-manager');

class ProxyManager {
  constructor(browserManager) {
    this.browserManager = browserManager;

    // 代理健康状态缓存 (server -> { healthy, lastCheck, responseTime })
    this.proxyHealthCache = new Map();

    // 健康检查配置
    this.HEALTH_CHECK_TIMEOUT = 10000; // 10秒
    this.HEALTH_CHECK_URL = 'https://www.baidu.com'; // 用于测试的URL
    this.CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存时间
  }

  /**
   * 检查代理健康状态
   * @param {Object} proxyConfig - 代理配置
   * @returns {Promise<Object>} 健康状态 { healthy, responseTime, error }
   */
  async checkProxyHealth(proxyConfig) {
    try {
      // 检查缓存
      const cached = this.proxyHealthCache.get(proxyConfig.server);
      if (cached && Date.now() - cached.lastCheck < this.CACHE_DURATION) {
        logger.debug(`Using cached health status for proxy ${proxyConfig.server}`);
        return {
          healthy: cached.healthy,
          responseTime: cached.responseTime,
          cached: true,
        };
      }

      logger.info(`Checking proxy health: ${proxyConfig.server}`);
      const startTime = Date.now();

      // 创建临时浏览器上下文测试代理
      const browser = this.browserManager.getBrowser();
      if (!browser) {
        throw new Error('Browser not initialized');
      }

      const context = await browser.newContext({
        proxy: {
          server: proxyConfig.server,
          username: proxyConfig.username,
          password: proxyConfig.password,
        },
      });

      const page = await context.newPage();

      try {
        // 尝试访问测试URL
        await page.goto(this.HEALTH_CHECK_URL, {
          timeout: this.HEALTH_CHECK_TIMEOUT,
          waitUntil: 'domcontentloaded',
        });

        const responseTime = Date.now() - startTime;

        // 更新缓存
        this.proxyHealthCache.set(proxyConfig.server, {
          healthy: true,
          responseTime,
          lastCheck: Date.now(),
        });

        logger.info(`Proxy health check passed: ${proxyConfig.server} (${responseTime}ms)`);

        return {
          healthy: true,
          responseTime,
          cached: false,
        };

      } finally {
        // 清理临时上下文
        await page.close().catch(() => {});
        await context.close().catch(() => {});
      }

    } catch (error) {
      logger.error(`Proxy health check failed: ${proxyConfig.server}`, error);

      // 更新缓存为不健康
      this.proxyHealthCache.set(proxyConfig.server, {
        healthy: false,
        error: error.message,
        lastCheck: Date.now(),
      });

      return {
        healthy: false,
        error: error.message,
        cached: false,
      };
    }
  }

  /**
   * 使用降级策略创建浏览器上下文
   * @param {string} accountId - 账户ID
   * @param {Object} proxyConfig - 代理配置
   * @returns {Promise<Object>} { context, proxyUsed }
   */
  async createContextWithFallback(accountId, proxyConfig) {
    // 策略 1: 尝试使用主代理
    if (proxyConfig && proxyConfig.server) {
      try {
        logger.info(`Attempting to create context with primary proxy: ${proxyConfig.server}`);

        // 先检查代理健康
        const health = await this.checkProxyHealth(proxyConfig);
        if (!health.healthy) {
          logger.warn(`Primary proxy unhealthy: ${proxyConfig.server}, trying fallback...`);
        } else {
          // 尝试创建上下文
          const context = await this.browserManager.createContext(accountId, {
            proxy: proxyConfig,
          });

          logger.info(`Context created successfully with primary proxy: ${proxyConfig.server}`);

          return {
            context,
            proxyUsed: proxyConfig.server,
            fallbackLevel: 'primary',
          };
        }

      } catch (error) {
        logger.error(`Primary proxy failed: ${proxyConfig.server}`, error);
        // 继续尝试备用方案
      }
    }

    // 策略 2: 尝试使用备用代理
    if (proxyConfig && proxyConfig.fallbackServer) {
      try {
        logger.info(`Attempting to create context with fallback proxy: ${proxyConfig.fallbackServer}`);

        const fallbackProxy = {
          server: proxyConfig.fallbackServer,
          username: proxyConfig.fallbackUsername,
          password: proxyConfig.fallbackPassword,
        };

        // 检查备用代理健康
        const health = await this.checkProxyHealth(fallbackProxy);
        if (!health.healthy) {
          logger.warn(`Fallback proxy unhealthy: ${proxyConfig.fallbackServer}, trying direct connection...`);
        } else {
          // 尝试创建上下文
          const context = await this.browserManager.createContext(accountId, {
            proxy: fallbackProxy,
          });

          logger.info(`Context created successfully with fallback proxy: ${proxyConfig.fallbackServer}`);

          return {
            context,
            proxyUsed: proxyConfig.fallbackServer,
            fallbackLevel: 'fallback',
          };
        }

      } catch (error) {
        logger.error(`Fallback proxy also failed: ${proxyConfig.fallbackServer}`, error);
        // 继续尝试直连
      }
    }

    // 策略 3: 直连降级（如果允许）
    if (!proxyConfig || proxyConfig.allowDirectConnection !== false) {
      try {
        logger.warn(`Falling back to direct connection for account ${accountId}`);

        const context = await this.browserManager.createContext(accountId, {});

        logger.info(`Context created successfully with direct connection (no proxy)`);

        return {
          context,
          proxyUsed: null,
          fallbackLevel: 'direct',
        };

      } catch (error) {
        logger.error(`Direct connection also failed`, error);
        throw error;
      }
    }

    // 所有策略都失败
    throw new Error(`All proxy connection attempts failed for account ${accountId}`);
  }

  /**
   * 批量检查多个代理的健康状态
   * @param {Array<Object>} proxyConfigs - 代理配置数组
   * @returns {Promise<Array<Object>>} 健康状态数组
   */
  async checkMultipleProxies(proxyConfigs) {
    const results = [];

    for (const proxyConfig of proxyConfigs) {
      const health = await this.checkProxyHealth(proxyConfig);
      results.push({
        server: proxyConfig.server,
        ...health,
      });
    }

    return results;
  }

  /**
   * 清除代理健康缓存
   * @param {string} server - 代理服务器地址 (可选，不提供则清除所有)
   */
  clearHealthCache(server = null) {
    if (server) {
      this.proxyHealthCache.delete(server);
      logger.info(`Cleared health cache for proxy: ${server}`);
    } else {
      this.proxyHealthCache.clear();
      logger.info('Cleared all proxy health cache');
    }
  }

  /**
   * 获取所有代理的健康状态
   * @returns {Object} 健康状态映射
   */
  getAllHealthStatus() {
    const status = {};
    this.proxyHealthCache.forEach((health, server) => {
      status[server] = {
        healthy: health.healthy,
        responseTime: health.responseTime,
        error: health.error,
        lastCheck: health.lastCheck,
        age: Date.now() - health.lastCheck,
      };
    });
    return status;
  }
}

module.exports = ProxyManager;
