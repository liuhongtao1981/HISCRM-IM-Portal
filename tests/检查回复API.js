/**
 * 测试脚本：检查回复 API 模式
 *
 * 目的：通过 MCP 浏览器工具查看点击"查看回复"按钮时触发的 API 请求
 */

const playwright = require('playwright');

async function checkReplyAPI() {
  const requests = [];

  const browser = await playwright.chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 拦截网络请求
  page.on('request', request => {
    const url = request.url();
    // 只记录包含 comment 或 reply 的请求
    if (url.includes('comment') || url.includes('reply')) {
      requests.push({
        url: url,
        method: request.method(),
        time: new Date().toLocaleTimeString()
      });
      console.log(`🌐 [${request.method()}] ${url}`);
    }
  });

  // 导航到评论管理页面
  await page.goto('https://creator.douyin.com/creator-micro/interactive/comment');

  // 等待用户手动操作
  console.log('\n📝 请手动操作：');
  console.log('1. 点击"选择作品"');
  console.log('2. 选择一个有评论的视频');
  console.log('3. 点击"查看X条回复"按钮');
  console.log('4. 观察控制台输出的 API 请求\n');

  // 等待 5 分钟让用户操作
  await page.waitForTimeout(300000);

  // 打印所有捕获的请求
  console.log('\n\n📊 捕获的评论相关 API 请求：');
  console.log('='.repeat(80));
  requests.forEach((req, i) => {
    console.log(`\n${i + 1}. [${req.method}] ${req.time}`);
    console.log(`   ${req.url}`);
  });

  await browser.close();
}

checkReplyAPI().catch(console.error);
