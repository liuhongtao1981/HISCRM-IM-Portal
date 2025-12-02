/**
 * API 拦截器管理器 - 增强版
 *
 * 改进：
 * 1. 使用 page.on('response') 监听所有响应（包括 301 重定向后的响应）
 * 2. 使用 minimatch 进行 glob 模式匹配
 * 3. 记录重定向链路以便调试
 *
 * 使用方式：
 * const manager = new APIInterceptorManager(page);
 * manager.register('pattern', handlerA);
 * manager.register('pattern', handlerB); // 同一个路径可以注册多个处理器
 * await manager.enable();
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { minimatch } = require('minimatch');  // ✅ minimatch v5+ 需要解构导入
const logger = createLogger('api-interceptor');

class APIInterceptorManager {
  constructor(page) {
    this.page = page;
    this.handlers = new Map(); // pattern -> [handler functions]
    this.responseListener = null;
    this.redirectTracker = new Map(); // url -> redirect count
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
    // 使用 response 事件监听（能捕获重定向后的响应）
    this.responseListener = async (response) => {
      try {
        const url = response.url();
        const status = response.status();

        // 记录重定向
        if (status === 301 || status === 302) {
          const location = response.headers()['location'];
          this.redirectTracker.set(url, (this.redirectTracker.get(url) || 0) + 1);
          logger.info(`🔄 [301/302] ${url} -> ${location}`);
          return; // 不处理重定向本身，只处理最终响应
        }

        // 检查是否匹配任何注册的模式
        for (const [pattern, handlers] of this.handlers.entries()) {
          if (minimatch(url, pattern)) {
            logger.info(`✅ [MATCH] ${pattern} -> ${url.substring(0, 100)}...`);

            const body = await this.parseJSON(response);

            // 调用所有注册的处理器
            for (const handler of handlers) {
              try {
                await handler(body, response);
              } catch (error) {
                logger.error(`Handler failed for ${pattern}:`, error);
              }
            }
          }
        }
      } catch (error) {
        logger.error(`Response listener error:`, error);
      }
    };

    this.page.on('response', this.responseListener);
    logger.info(`Enabled ${this.handlers.size} API patterns (using response event)`);
  }

  /**
   * 解析响应 (支持JSON和二进制)
   */
  async parseJSON(response) {
    try {
      // 先尝试JSON解析
      return await response.json();
    } catch {
      try {
        const text = await response.text();
        return JSON.parse(text);
      } catch {
        // JSON解析失败，检查是否是二进制响应
        try {
          const contentType = response.headers()['content-type'] || '';

          // 如果是Protobuf或二进制流，保存原始buffer
          if (contentType.includes('protobuf') ||
              contentType.includes('octet-stream') ||
              contentType.includes('application/x-protobuf')) {

            const buffer = await response.body();

            logger.warn(`⚠️ Binary response detected: ${response.url()}`);
            logger.warn(`   Content-Type: ${contentType}`);
            logger.warn(`   Buffer size: ${buffer?.length || 0} bytes`);

            // 返回特殊标记的对象，包含原始二进制数据
            return {
              __isBinary: true,
              __url: response.url(),
              __contentType: contentType,
              __bufferSize: buffer?.length || 0,
              __buffer: buffer,
              __timestamp: Date.now()
            };
          }

          // 其他情况返回null
          return null;

        } catch (binaryError) {
          logger.error(`Failed to handle binary response:`, binaryError);
          return null;
        }
      }
    }
  }

  /**
   * 清理拦截器
   */
  async cleanup() {
    if (this.responseListener) {
      this.page.off('response', this.responseListener);
      this.responseListener = null;
    }
    this.handlers.clear();
    this.redirectTracker.clear();

    // 输出重定向统计
    if (this.redirectTracker.size > 0) {
      logger.info(`📊 Redirect statistics:`);
      for (const [url, count] of this.redirectTracker.entries()) {
        logger.info(`  ${url}: ${count} redirects`);
      }
    }
  }
}

module.exports = { APIInterceptorManager };
