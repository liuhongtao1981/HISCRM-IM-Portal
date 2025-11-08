/**
 * 调试未读数跳动问�?- 启动浏览器并观察
 */

const playwright = require('playwright');
const path = require('path');

async function main() {
  console.log('启动浏览器用于调试未读数跳动问题...');

  // 使用测试浏览器数据目�?  const userDataDir = path.join(__dirname, '../test-browser-data-manual');

  const browser = await playwright.chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1920, height: 1080 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--remote-debugging-port=9222'  // 启用 DevTools Protocol
    ],
    devtools: true  // 自动打开 DevTools
  });

  console.log('浏览器已启动，DevTools 端口: 9222');
  console.log('Chrome DevTools 地址: http://localhost:9222');

  const page = browser.pages()[0];

  // 导航到抖音创作者平�?  console.log('正在导航到抖音创作者平�?..');
  await page.goto('https://creator.douyin.com/creator-micro/home');

  console.log('\n�?浏览器已启动，请执行以下操作来复现问题：');
  console.log('1. 点击左侧菜单【互动管理】→【私信�?);
  console.log('2. 观察私信列表中的未读�?);
  console.log('3. 点击不同的会�?);
  console.log('4. 观察未读数是否跳�?);
  console.log('\n我会在控制台监听并分析网络请求和DOM变化...\n');

  // 监听控制台输�?  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      console.log(`[浏览�?${type}]`, msg.text());
    }
  });

  // 监听网络请求（抓取私信相关的API调用�?  page.on('response', async response => {
    const url = response.url();

    // 监听私信列表API
    if (url.includes('/aweme/v1/im/conversation/list')) {
      console.log('\n[API] 会话列表请求:', url);
      try {
        const data = await response.body();
        console.log('[API] 响应大小:', data.length, 'bytes');
      } catch (e) {
        console.log('[API] 无法读取响应�?);
      }
    }

    // 监听私信消息API
    if (url.includes('/aweme/v1/im/messages')) {
      console.log('\n[API] 消息列表请求:', url);
      try {
        const data = await response.body();
        console.log('[API] 响应大小:', data.length, 'bytes');
      } catch (e) {
        console.log('[API] 无法读取响应�?);
      }
    }
  });

  // 定期检查DOM中的未读数显�?  const checkInterval = setInterval(async () => {
    try {
      const unreadBadges = await page.$$eval('[class*="unread"], [class*="badge"]', elements => {
        return elements.map(el => ({
          text: el.textContent?.trim(),
          className: el.className,
          visible: el.offsetParent !== null
        })).filter(item => item.visible && item.text);
      });

      if (unreadBadges.length > 0) {
        console.log('\n[DOM] 检测到未读徽章:', unreadBadges);
      }
    } catch (e) {
      // 忽略错误
    }
  }, 5000);

  // 等待用户操作
  console.log('\n�?Ctrl+C 关闭浏览�?..\n');

  // 保持浏览器打开
  await new Promise(() => {});
}

main().catch(console.error);
