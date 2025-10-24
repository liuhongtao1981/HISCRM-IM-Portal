/**
 * 验证点击"查看回复"按钮是否触发讨论API
 */

const path = require('path');
const Database = require('better-sqlite3');

async function testDiscussionAPI() {
  console.log('📋 验证讨论API触发\n');

  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);
  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  if (!account) {
    console.log('❌ 未找到抖音账户');
    process.exit(1);
  }

  const { chromium } = require('playwright');
  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  // API拦截器
  const apiResponses = [];

  page.on('response', async (response) => {
    const url = response.url();

    // 拦截所有API请求
    if (url.includes('/aweme/') || url.includes('/comment/') || url.includes('/reply/')) {
      const timestamp = new Date().toISOString().substring(11, 23);

      try {
        const contentType = response.headers()['content-type'] || '';

        if (contentType.includes('application/json')) {
          const data = await response.json();

          apiResponses.push({
            timestamp,
            url,
            status: response.status(),
            data,
          });

          console.log(`[${timestamp}] 📡 API: ${url.split('?')[0]}`);

          // 如果是讨论/回复API,打印详细信息
          if (url.includes('/reply/') || url.includes('discussion')) {
            console.log(`           状态: ${response.status()}`);
            console.log(`           数据: ${JSON.stringify(data).substring(0, 200)}...\n`);
          }
        }
      } catch (e) {
        // 忽略非JSON响应
      }
    }
  });

  try {
    // 1. 导航到评论页面
    console.log('📍 导航到评论管理页面...');
    await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // 2. 点击选择作品
    console.log('📍 点击选择作品...');
    try {
      await page.click('span:has-text("选择作品")', { timeout: 5000 });
      await page.waitForTimeout(1500);
    } catch (e) {}

    // 3. 选择有评论的视频
    console.log('📍 选择视频...\n');
    await page.evaluate(() => {
      const containers = document.querySelectorAll('.container-Lkxos9');
      if (containers.length > 0) {
        containers[0].click();
      }
    });

    await page.waitForTimeout(3000);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 API拦截开始');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const apiCountBefore = apiResponses.length;

    // 4. 查找并点击"查看回复"按钮
    console.log('🖱️  查找并点击"查看回复"按钮...\n');

    const buttonClicked = await page.evaluate(() => {
      // 只查找真正的按钮元素 (cursor: pointer 的那个)
      const buttons = Array.from(document.querySelectorAll('[class*="load-more"]'));

      const replyButton = buttons.find(btn => {
        const text = (btn.textContent || '').trim();
        const style = window.getComputedStyle(btn);
        return text.match(/^查看\d+条回复$/) && style.cursor === 'pointer';
      });

      if (replyButton) {
        replyButton.click();
        return {
          success: true,
          text: replyButton.textContent.trim(),
        };
      }

      return { success: false };
    });

    if (!buttonClicked.success) {
      console.log('❌ 没有找到可点击的"查看回复"按钮\n');
      await context.close();
      db.close();
      return;
    }

    console.log(`✅ 点击了按钮: ${buttonClicked.text}\n`);

    // 5. 等待API响应
    console.log('⏳ 等待API响应...\n');
    await page.waitForTimeout(5000);

    const apiCountAfter = apiResponses.length;
    const newAPIs = apiCountAfter - apiCountBefore;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 API拦截结果');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`点击前API数量: ${apiCountBefore}`);
    console.log(`点击后API数量: ${apiCountAfter}`);
    console.log(`新增API数量: ${newAPIs}\n`);

    if (newAPIs > 0) {
      console.log('✅ 点击触发了新的API请求!\n');

      const newAPIList = apiResponses.slice(apiCountBefore);

      newAPIList.forEach((api, i) => {
        console.log(`${i + 1}. ${api.url.split('?')[0]}`);
        console.log(`   时间: ${api.timestamp}`);
        console.log(`   状态: ${api.status}`);

        // 检查是否是讨论/回复相关API
        const isReplyAPI = api.url.includes('/reply/') ||
                          api.url.includes('discussion') ||
                          api.url.includes('sub_comment');

        console.log(`   类型: ${isReplyAPI ? '🎯 讨论/回复API' : '普通API'}`);

        if (isReplyAPI && api.data) {
          const dataStr = JSON.stringify(api.data);
          console.log(`   数据: ${dataStr.substring(0, 200)}...`);
        }

        console.log('');
      });
    } else {
      console.log('❌ 点击没有触发任何新的API请求!\n');
      console.log('这说明:');
      console.log('  1. 讨论数据可能已经在页面首次加载时获取');
      console.log('  2. 或者讨论数据在DOM中,不需要额外的API请求');
      console.log('  3. 或者按钮点击没有实际生效\n');
    }

    // 6. 检查DOM中是否有讨论数据
    console.log('🔍 检查DOM中的讨论数据...\n');

    const domDiscussions = await page.evaluate(() => {
      const results = [];

      // 策略1: 查找"回复XXX:"格式
      document.querySelectorAll('*').forEach(el => {
        const text = (el.textContent || '').trim();
        if (text.match(/^回复.+?:/)) {
          results.push({
            type: 'reply_prefix',
            text: text.substring(0, 100),
          });
        }
      });

      // 策略2: 查找展开的回复列表容器
      const replyContainers = document.querySelectorAll('[class*="reply"]');
      console.log(`Found ${replyContainers.length} elements with 'reply' in class`);

      return results;
    });

    console.log(`找到 ${domDiscussions.length} 条讨论数据\n`);

    if (domDiscussions.length > 0) {
      console.log('✅ DOM中有讨论数据!\n');
      domDiscussions.slice(0, 5).forEach((d, i) => {
        console.log(`${i + 1}. ${d.text}`);
      });
      console.log('');
    } else {
      console.log('❌ DOM中没有讨论数据\n');
    }

    // 总结
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 测试总结');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`按钮点击: ${buttonClicked.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`API触发: ${newAPIs > 0 ? '✅ 是' : '❌ 否'} (${newAPIs}个新API)`);
    console.log(`DOM数据: ${domDiscussions.length > 0 ? '✅ 有' : '❌ 无'} (${domDiscussions.length}条)\n`);

    if (newAPIs === 0 && domDiscussions.length === 0) {
      console.log('⚠️  关键问题: 点击后既没有API触发,也没有DOM数据出现!');
      console.log('   这说明点击可能没有实际生效,或者需要额外的操作\n');
    }

  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    console.log('⏸️  等待15秒,可以手动检查页面...');
    await page.waitForTimeout(15000);

    await context.close();
    db.close();
    console.log('\n✅ 测试完成');
  }
}

testDiscussionAPI().catch(error => {
  console.error('❌ 测试脚本执行失败:', error);
  process.exit(1);
});
