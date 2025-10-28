/**
 * 测试作品列表 API 拦截器
 * 目的：验证 API 拦截器是否能正确捕获 /creator/item/list/ API 请求
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../packages/worker/.env') });

const { chromium } = require('playwright');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('test-works-api');

// API 数据收集
const apiData = {
  worksList: [],
  cache: new Set()
};

/**
 * API 回调：作品列表
 */
async function onWorksListAPI(body, route) {
  const url = route.request().url();
  logger.info(`\n📦 API 响应数据结构:`);
  logger.info(`   URL: ${url.substring(0, 100)}...`);
  logger.info(`   响应体键: ${Object.keys(body || {}).join(', ')}`);

  if (body) {
    // 显示前3层数据结构
    logger.info(`   完整响应体 (前500字符):\n   ${JSON.stringify(body, null, 2).substring(0, 500)}...`);
  }

  // ✅ 修正：检查 item_info_list 而不是 aweme_list
  if (!body || !body.item_info_list) {
    logger.warn('⚠️  API 响应没有 item_info_list 字段');
    return;
  }

  // URL 去重
  if (apiData.cache.has(url)) {
    logger.debug('🔁 重复的 URL，跳过');
    return;
  }

  apiData.cache.add(url);
  apiData.worksList.push(body);

  logger.info(`✅ 收集到作品列表: ${body.item_info_list.length} 个作品`);
  logger.info(`   has_more: ${body.has_more}, total_count: ${body.total_count || 'N/A'}`);
  logger.info(`   API URL: ${url.substring(0, 100)}...`);
}

async function testWorksAPIInterceptor() {
  let browser;
  let context;

  try {
    logger.info('🚀 启动测试：作品列表 API 拦截器');

    // 1. 启动浏览器
    browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ]
    });

    // 2. 创建上下文（使用已登录的存储状态）
    const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';
    const storageStatePath = path.join(
      __dirname,
      `../packages/worker/data/browser/worker1/storage-states/${accountId}_storage.json`
    );

    logger.info(`📂 加载存储状态: ${storageStatePath}`);

    context = await browser.newContext({
      storageState: storageStatePath,
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    const page = await context.newPage();

    // 2.5. 监听所有网络请求（调试用）
    const allRequests = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('creator.douyin.com') && url.includes('item')) {
        allRequests.push(url);
        logger.info(`\n🌐 捕获到相关请求: ${url.substring(0, 150)}...`);
      }
    });

    // 3. 注册 API 拦截器 - 测试多种模式
    const patterns = [
      '**/creator/item/list*',            // ✅ 修正：不要求结尾斜杠
      '**/creator/item/list?**',          // ✅ 匹配查询参数
      '**/creator/item/list/?**',         // ✅ 匹配带斜杠+查询参数
    ];

    logger.info('\n📡 注册 API 拦截器模式:');
    for (const pattern of patterns) {
      logger.info(`   - ${pattern}`);
      await page.route(pattern, async (route) => {
        try {
          logger.info(`\n🎯 拦截到请求: ${pattern}`);
          logger.info(`   URL: ${route.request().url()}`);

          const response = await route.fetch();
          const body = await response.json();

          await onWorksListAPI(body, route);
          await route.fulfill({ response });

        } catch (error) {
          logger.error(`❌ 拦截器错误:`, error);
          await route.continue();
        }
      });
    }

    logger.info('✅ API 拦截器已注册\n');

    // 4. 导航到评论管理页面（会触发作品列表 API）
    logger.info('📍 导航到评论管理页面...');
    await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    logger.info('✅ 页面加载完成');
    await page.waitForTimeout(3000);

    // 5. 点击"选择作品"按钮（应该会触发作品列表 API）
    logger.info('\n🖱️  点击"选择作品"按钮...');
    try {
      await page.click('span:has-text("选择作品")', { timeout: 5000 });
      logger.info('✅ 按钮已点击');
      await page.waitForTimeout(3000);
    } catch (error) {
      logger.warn('⚠️  未找到"选择作品"按钮，可能已经打开');
    }

    // 6. 检查是否拦截到 API 请求
    logger.info('\n📊 测试结果:');
    logger.info(`   拦截到的 API 响应数量: ${apiData.worksList.length}`);
    logger.info(`   捕获到的相关请求数量: ${allRequests.length}`);

    if (allRequests.length > 0) {
      logger.info('\n📜 捕获到的所有相关请求:');
      allRequests.forEach((url, idx) => {
        logger.info(`   [${idx}] ${url}`);
      });
    }

    if (apiData.worksList.length > 0) {
      logger.info('   ✅ API 拦截器工作正常！');
      apiData.worksList.forEach((resp, idx) => {
        logger.info(`   [${idx}] 作品数量: ${resp.aweme_list?.length || 0}`);
      });
    } else {
      logger.error('   ❌ 没有拦截到任何 API 请求！');
      logger.info('\n🔍 调试建议:');
      logger.info('   1. 检查网络面板，确认 API 请求是否真的被发送');
      logger.info('   2. 检查 API URL 是否与模式匹配');
      logger.info('   3. 检查 API 响应是否包含 aweme_list 字段');
    }

    // 等待用户观察
    logger.info('\n⏳ 等待 10 秒以便观察...');
    await page.waitForTimeout(10000);

  } catch (error) {
    logger.error('❌ 测试失败:', error);
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    logger.info('\n✅ 测试结束');
  }
}

// 运行测试
testWorksAPIInterceptor().catch(console.error);
