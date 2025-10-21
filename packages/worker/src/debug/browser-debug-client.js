/**
 * 浏览器调试客户端 - 在 DEBUG 模式下自动连接到 MCP
 *
 * 用法：
 * const debugClient = new BrowserDebugClient();
 * await debugClient.connect(accountId, mcpPort);
 *
 * // 发送事件
 * await debugClient.logEvent('message_found', { messageId: '123' });
 * await debugClient.logMessage('正在查找消息', 'info');
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('browser-debug-client');

class BrowserDebugClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.browserId = null;
    this.accountId = null;
    this.mcpUrl = null;
  }

  /**
   * 连接到MCP调试服务
   * @param {string} accountId - 账户ID
   * @param {number} mcpPort - MCP服务端口（默认9222）
   * @param {string} mcpHost - MCP服务主机（默认localhost）
   */
  async connect(accountId, mcpPort = 9222, mcpHost = 'localhost') {
    return new Promise((resolve, reject) => {
      try {
        this.accountId = accountId;
        this.mcpUrl = `ws://${mcpHost}:${mcpPort}`;

        // 在浏览器中使用 ws 客户端
        if (typeof window !== 'undefined' && window.WebSocket) {
          this.ws = new window.WebSocket(this.mcpUrl);
        } else {
          // Node.js 环境（测试用）
          const WebSocket = require('ws');
          this.ws = new WebSocket(this.mcpUrl);
        }

        this.ws.onopen = () => {
          this.connected = true;
          logger.info(`✅ 已连接到MCP调试服务`, {
            url: this.mcpUrl,
            accountId
          });

          // 发送注册消息
          this.sendMessage({
            type: 'register',
            accountId,
            capabilities: ['dom_inspection', 'event_tracking', 'logging'],
            timestamp: Date.now(),
          });

          resolve();
        };

        this.ws.onerror = (error) => {
          logger.error('❌ MCP连接错误:', error);
          reject(error);
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
          } catch (error) {
            logger.error('消息解析失败:', error);
          }
        };

        this.ws.onclose = () => {
          logger.warn('⚠️ MCP连接已关闭');
          this.connected = false;
        };
      } catch (error) {
        logger.error('连接失败:', error);
        reject(error);
      }
    });
  }

  /**
   * 处理来自服务器的消息
   */
  handleServerMessage(data) {
    const { type, browserId, message } = data;

    if (type === 'welcome') {
      this.browserId = browserId;
      logger.info(`✅ 欢迎消息: ${message}`, { browserId });
    }
  }

  /**
   * 发送消息给MCP
   */
  sendMessage(data) {
    if (!this.connected || !this.ws) {
      logger.warn('⚠️ MCP未连接，无法发送消息');
      return false;
    }

    try {
      this.ws.send(JSON.stringify({
        ...data,
        browserId: this.browserId,
        accountId: this.accountId,
        timestamp: Date.now(),
      }));
      return true;
    } catch (error) {
      logger.error('发送消息失败:', error);
      return false;
    }
  }

  /**
   * 记录事件
   * 用于记录：消息查找、DOM交互、API调用等重要事件
   */
  logEvent(eventType, details = {}) {
    return this.sendMessage({
      type: 'event',
      event: eventType,
      content: {
        ...details,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * 记录日志消息
   */
  logMessage(message, level = 'info') {
    logger.log(level, message, { source: 'browser-debug' });

    return this.sendMessage({
      type: 'log',
      level,
      content: message,
    });
  }

  /**
   * 记录错误
   */
  logError(message, error = null) {
    logger.error(message, error, { source: 'browser-debug' });

    return this.sendMessage({
      type: 'log',
      level: 'error',
      content: `${message}${error ? ': ' + error.message : ''}`,
    });
  }

  /**
   * 记录调试信息
   */
  debug(message, data = {}) {
    logger.debug(message, { ...data, source: 'browser-debug' });

    return this.sendMessage({
      type: 'debug',
      content: message,
      data,
    });
  }

  /**
   * 记录DOM检查事件
   */
  logDOMInspection(selector, found, details = {}) {
    return this.logEvent('dom_inspection', {
      selector,
      found,
      ...details,
    });
  }

  /**
   * 记录虚拟列表查找事件
   */
  logVirtualListSearch(queryId, found, matchType = null) {
    return this.logEvent('virtual_list_search', {
      queryId,
      found,
      matchType, // 'exact', 'tier2a', 'tier2b', 'tier2c', 'tier3', 'tier4'
    });
  }

  /**
   * 记录消息定位事件
   */
  logMessageLocation(messageId, index, elementXPath = null) {
    return this.logEvent('message_located', {
      messageId,
      index,
      elementXPath,
    });
  }

  /**
   * 记录回复提交事件
   */
  logReplySubmitted(messageId, replyContent) {
    return this.logEvent('reply_submitted', {
      messageId,
      contentLength: replyContent.length,
      preview: replyContent.substring(0, 50),
    });
  }

  /**
   * 记录标签页生命周期事件
   */
  logTabLifecycle(event, details = {}) {
    return this.logEvent('tab_lifecycle', {
      event, // 'opened', 'navigated', 'closed', 'error'
      ...details,
    });
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
      logger.info('已断开MCP连接');
    }
  }
}

module.exports = BrowserDebugClient;
