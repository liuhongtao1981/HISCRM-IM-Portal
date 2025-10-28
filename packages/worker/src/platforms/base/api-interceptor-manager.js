/**
 * API 拦截器管理器 - 简化版
 *
 * 使用方式：
 * const manager = new APIInterceptorManager(page);
 * manager.register('pattern', handlerA);
 * manager.register('pattern', handlerB); // 同一个路径可以注册多个处理器
 * await manager.enable();
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('api-interceptor');

class APIInterceptorManager {
  constructor(page) {
    this.page = page;
    this.handlers = new Map(); // pattern -> [handler functions]
    this.routes = new Map();   // pattern -> route function
  }

  /**
   * 注册处理器
   * @param {string} pattern - API 路径模式，如 '**\/api\/path\/**'
   * @param {Function} handler - 处理函数 async (body) => {}
   */
  register(pattern, handler) {
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, []);
    }
    this.handlers.get(pattern).push(handler);
  }

  /**
   * 启用所有拦截器
   */
  async enable() {
    for (const [pattern, handlers] of this.handlers.entries()) {
      const routeHandler = async (route) => {
        try {
          const response = await route.fetch();
          const body = await this.parseJSON(response);

          // 调用所有注册的处理器
          for (const handler of handlers) {
            try {
              await handler(body, route, response);
            } catch (error) {
              logger.error(`Handler failed:`, error);
            }
          }

          await route.fulfill({ response });
        } catch (error) {
          logger.error(`Route error:`, error);
          await route.continue();
        }
      };

      await this.page.route(pattern, routeHandler);
      this.routes.set(pattern, routeHandler);
    }

    logger.info(`Enabled ${this.handlers.size} API patterns`);
  }

  /**
   * 解析 JSON 响应
   */
  async parseJSON(response) {
    try {
      return await response.json();
    } catch {
      try {
        const text = await response.text();
        return JSON.parse(text);
      } catch {
        return null;
      }
    }
  }

  /**
   * 清理拦截器
   */
  async cleanup() {
    for (const [pattern, handler] of this.routes.entries()) {
      await this.page.unroute(pattern, handler);
    }
    this.handlers.clear();
    this.routes.clear();
  }
}

module.exports = { APIInterceptorManager };
