/**
 * 测试 API 拦截器是否能正确处理 301 重定向
 */

const { chromium } = require('playwright');
const { APIInterceptorManager } = require('../packages/worker/src/platforms/base/api-interceptor-manager');

async function test301Redirect() {
  console.log('🔍 测试 301 重定向拦截\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const capturedAPIs = [];
  const redirects = [];

  // 创建拦截器
  const manager = new APIInterceptorManager(page);

  // 注册评论 API 处理器
  manager.register('**/comment/list/select/**', async (body, response) => {
    console.log(`✅ [评论 API] 捕获成功！`);
    console.log(`   URL: ${response.url()}`);
    console.log(`   状态码: ${response.status()}`);
    capturedAPIs.push({
      type: 'comment',
      url: response.url(),
      status: response.status()
    });
  });

  // 注册作品 API 处理器
  manager.register('**/aweme/v1/creator/item/list/**', async (body, response) => {
    console.log(`✅ [作品 API] 捕获成功！`);
    console.log(`   URL: ${response.url()}`);
    console.log(`   状态码: ${response.status()}`);
    capturedAPIs.push({
      type: 'item',
      url: response.url(),
      status: response.status()
    });
  });

  // 监听所有响应以捕获重定向
  page.on('response', async (response) => {
    const status = response.status();
    if (status === 301 || status === 302) {
      const redirect = {
        from: response.url(),
        to: response.headers()['location'],
        status: status
      };
      redirects.push(redirect);
      console.log(`🔄 [${status}] ${redirect.from} -> ${redirect.to}`);
    }
  });

  await manager.enable();

  // 导航到评论管理页面
  console.log('\n🌐 导航到抖音创作中心...');
  await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
    waitUntil: 'networkidle'
  });

  console.log('\n📝 请手动操作：');
  console.log('1. 点击"选择作品"按钮');
  console.log('2. 选择一个有评论的视频');
  console.log('3. 等待评论列表加载');
  console.log('4. 观察控制台输出\n');

  // 等待 2 分钟
  await page.waitForTimeout(120000);

  // 输出统计
  console.log('\n\n📊 测试结果统计：');
  console.log('='.repeat(80));
  console.log(`捕获的 API 请求: ${capturedAPIs.length} 个`);
  console.log(`检测到的重定向: ${redirects.length} 个\n`);

  if (capturedAPIs.length > 0) {
    console.log('✅ 捕获的 API 列表：');
    capturedAPIs.forEach((api, i) => {
      console.log(`${i + 1}. [${api.type}] ${api.status} - ${api.url}`);
    });
  } else {
    console.log('❌ 未捕获任何 API 请求');
  }

  if (redirects.length > 0) {
    console.log('\n🔄 检测到的重定向：');
    redirects.forEach((r, i) => {
      console.log(`${i + 1}. [${r.status}] ${r.from}`);
      console.log(`   -> ${r.to}`);
    });
  } else {
    console.log('\n✅ 未检测到 301/302 重定向');
  }

  await manager.cleanup();
  await browser.close();
}

test301Redirect().catch(console.error);
