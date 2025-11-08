/**
 * 启动一个连接到 MCP �?Playwright 浏览�?
 * 用于手动验证和调试爬虫逻辑
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { createLogger } = require('../packages/shared/utils/logger');

const logger = createLogger('browser-mcp-test');

async function startBrowserWithMCP() {
  const mcpPort = process.env.MCP_PORT || 9222;
  const accountId = process.env.ACCOUNT_ID || 'test-account-001';
  const headless = process.env.HEADLESS === 'true';

  logger.info('====================================');
  logger.info('启动调试浏览�?+ MCP 连接');
  logger.info('====================================');
  logger.info('');
  logger.info(`账户 ID: ${accountId}`);
  logger.info(`MCP 端口: ${mcpPort}`);
  logger.info(`无头模式: ${headless ? '�? : '�?}`);
  logger.info('');

  // 创建用户数据目录
  const userDataDir = path.join(__dirname, '../data/browser/test-worker/browser_' + accountId);
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
    logger.info(`�?创建用户数据目录: ${userDataDir}`);
  }

  // 创建浏览器指纹配�?
  const fingerprint = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    colorScheme: 'light',
  };

  logger.info('🚀 启动浏览�?..');

  // 启动浏览器上下文
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: headless,
    viewport: fingerprint.viewport,
    userAgent: fingerprint.userAgent,
    locale: fingerprint.locale,
    timezoneId: fingerprint.timezone,
    colorScheme: fingerprint.colorScheme,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
    devtools: true, // 自动打开 DevTools
  });

  const page = await browser.newPage();

  logger.info('�?浏览器已启动');
  logger.info('');

  // 注入 MCP 连接脚本到页�?
  await page.addInitScript((mcpPort, accountId) => {
    // 连接�?MCP WebSocket
    const mcpWs = new WebSocket(`ws://localhost:${mcpPort}/`);

    mcpWs.onopen = () => {
      console.log('[MCP] 已连接到调试接口');

      // 注册浏览�?
      mcpWs.send(JSON.stringify({
        type: 'register',
        accountId: accountId,
        capabilities: {
          platform: 'douyin',
          apiInterception: true,
          fiberExtraction: true,
        }
      }));
    };

    mcpWs.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('[MCP] 收到消息:', data);
    };

    mcpWs.onerror = (error) => {
      console.error('[MCP] WebSocket 错误:', error);
    };

    mcpWs.onclose = () => {
      console.log('[MCP] 连接已关�?);
    };

    // �?MCP WebSocket 暴露到全局，方便手动发送事�?
    window.__mcpWs = mcpWs;
    window.__sendMCPEvent = (event, content) => {
      if (mcpWs.readyState === WebSocket.OPEN) {
        mcpWs.send(JSON.stringify({
          type: 'event',
          accountId: accountId,
          event: event,
          content: content
        }));
        console.log('[MCP] 已发送事�?', event);
      } else {
        console.error('[MCP] WebSocket 未连�?);
      }
    };

    // 监听所有网络请�?
    window.__interceptedAPIs = [];

    // 劫持 fetch
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const url = args[0];
      console.log('[API拦截] Fetch:', url);

      window.__sendMCPEvent('api_request', {
        method: 'fetch',
        url: url,
        timestamp: Date.now()
      });

      const response = await originalFetch.apply(this, args);

      // 克隆响应以便读取
      const clonedResponse = response.clone();
      try {
        const data = await clonedResponse.json();
        window.__interceptedAPIs.push({
          url: url,
          data: data,
          timestamp: Date.now()
        });

        window.__sendMCPEvent('api_response', {
          url: url,
          dataKeys: Object.keys(data),
          timestamp: Date.now()
        });
      } catch (e) {
        // �?JSON 响应
      }

      return response;
    };

    // 劫持 XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__url = url;
      this.__method = method;
      console.log('[API拦截] XHR:', method, url);

      window.__sendMCPEvent('api_request', {
        method: 'xhr',
        httpMethod: method,
        url: url,
        timestamp: Date.now()
      });

      return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
      this.addEventListener('load', function() {
        try {
          const data = JSON.parse(this.responseText);
          window.__interceptedAPIs.push({
            url: this.__url,
            method: this.__method,
            data: data,
            timestamp: Date.now()
          });

          window.__sendMCPEvent('api_response', {
            url: this.__url,
            method: this.__method,
            dataKeys: Object.keys(data),
            timestamp: Date.now()
          });
        } catch (e) {
          // �?JSON 响应
        }
      });

      return originalXHRSend.apply(this, args);
    };

    console.log('[MCP] 已注�?API 拦截脚本');
    console.log('[MCP] 可用函数:');
    console.log('  - window.__sendMCPEvent(event, content) - 发送事件到 MCP');
    console.log('  - window.__interceptedAPIs - 查看拦截�?API 数据');
  }, mcpPort, accountId);

  logger.info('�?MCP 连接脚本已注�?);
  logger.info('');
  logger.info('📋 使用指南:');
  logger.info('');
  logger.info('1. 浏览器控制台可用函数:');
  logger.info('   window.__sendMCPEvent(event, content)  - 发送事件到 MCP');
  logger.info('   window.__interceptedAPIs               - 查看拦截�?API 数据');
  logger.info('');
  logger.info('2. 验证步骤:');
  logger.info('   a) 手动导航到抖音创作者中�?);
  logger.info('   b) 在控制台查看 API 拦截日志');
  logger.info('   c) 使用 window.__interceptedAPIs 查看数据');
  logger.info('   d) 访问 http://localhost:9222/ 查看 MCP 面板');
  logger.info('');
  logger.info('3. 测试 API 拦截:');
  logger.info('   作品列表: https://creator.douyin.com/creator-micro/content/manage');
  logger.info('   私信会话: https://creator.douyin.com/creator-micro/data/following/chat');
  logger.info('   评论管理: https://creator.douyin.com/creator-micro/data/video/analysis');
  logger.info('');
  logger.info('====================================');
  logger.info('浏览器正在运行中...');
  logger.info('�?Ctrl+C 关闭浏览�?);
  logger.info('====================================');

  // 导航到抖音首�?
  logger.info('');
  logger.info('🌐 导航到抖音创作者中�?..');
  await page.goto('https://creator.douyin.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  logger.info('�?页面加载完成');
  logger.info('');
  logger.info('💡 提示: 如果需要登录，请在浏览器中手动扫码登录');
  logger.info('');

  // 保持浏览器运�?
  process.on('SIGINT', async () => {
    logger.info('');
    logger.info('正在关闭浏览�?..');
    await browser.close();
    logger.info('已关闭，再见�?);
    process.exit(0);
  });

  // 返回浏览器实例供外部使用
  return { browser, page };
}

// 如果直接运行此脚�?
if (require.main === module) {
  startBrowserWithMCP().catch(error => {
    logger.error('启动失败:', error);
    process.exit(1);
  });
}

module.exports = { startBrowserWithMCP };
