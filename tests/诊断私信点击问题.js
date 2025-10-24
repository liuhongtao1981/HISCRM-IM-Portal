/**
 * 诊断私信点击问题
 * 详细记录会话点击的每个步骤,找出为什么没有点击会话
 */

const path = require('path');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');
const fs = require('fs');

async function diagnoseDirectMessageClick() {
  console.log('🔍 诊断私信点击问题\n');

  // 1. 获取账户
  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ?').get('douyin');
  console.log('✅ 账户信息:');
  console.log('   ID:', account.id);
  console.log('   平台用户ID:', account.platform_user_id);
  console.log('');

  // 2. 启动浏览器
  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  console.log('🌐 启动浏览器...');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 步骤1: 导航到私信页面');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log(`✅ 当前URL: ${currentUrl}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 步骤2: 分析会话列表元素');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 尝试多种选择器
    const selectorTests = await page.evaluate(() => {
      const results = {};

      // 测试1: role="list-item" (当前代码使用的)
      results.roleListItem = {
        selector: '[role="list-item"]',
        count: document.querySelectorAll('[role="list-item"]').length,
        sample: null
      };

      if (results.roleListItem.count > 0) {
        const first = document.querySelector('[role="list-item"]');
        results.roleListItem.sample = {
          className: first.className,
          innerHTML: first.innerHTML.substring(0, 200),
        };
      }

      // 测试2: 包含"conversation"的class
      results.conversationClass = {
        selector: '[class*="conversation"]',
        count: document.querySelectorAll('[class*="conversation"]').length,
      };

      // 测试3: 包含"chat"的class
      results.chatClass = {
        selector: '[class*="chat"]',
        count: document.querySelectorAll('[class*="chat"]').length,
      };

      // 测试4: 包含"list-item"的class
      results.listItemClass = {
        selector: '[class*="list-item"]',
        count: document.querySelectorAll('[class*="list-item"]').length,
      };

      // 测试5: 查找可能的会话容器
      results.chatContent = {
        selector: '.chat-content',
        count: document.querySelectorAll('.chat-content').length,
      };

      return results;
    });

    console.log('选择器测试结果:');
    Object.entries(selectorTests).forEach(([key, result]) => {
      console.log(`  ${key}:`);
      console.log(`    选择器: ${result.selector}`);
      console.log(`    数量: ${result.count}`);
      if (result.sample) {
        console.log(`    示例class: ${result.sample.className}`);
      }
    });
    console.log('');

    // 截图保存当前状态
    await page.screenshot({ path: './logs/dm-diagnosis-step1-list.png', fullPage: true });
    console.log('📸 已保存截图: logs/dm-diagnosis-step1-list.png\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 步骤3: 尝试点击第一个会话');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 找出数量最多的选择器
    let bestSelector = null;
    let maxCount = 0;

    Object.entries(selectorTests).forEach(([key, result]) => {
      if (result.count > maxCount) {
        maxCount = result.count;
        bestSelector = result.selector;
      }
    });

    if (maxCount === 0) {
      console.log('❌ 未找到任何会话元素!');
      console.log('\n⚠️ 可能原因:');
      console.log('  1. 页面结构不同');
      console.log('  2. 需要点击"全部"标签');
      console.log('  3. 会话列表未加载');

      // 尝试查找"全部"标签
      console.log('\n尝试查找并点击"全部"标签...');
      const allTabClicked = await page.evaluate(() => {
        const allTab = Array.from(document.querySelectorAll('*'))
          .find(el => el.textContent?.trim() === '全部' && el.offsetParent !== null);

        if (allTab) {
          allTab.click();
          return true;
        }
        return false;
      });

      if (allTabClicked) {
        console.log('✅ 已点击"全部"标签');
        await page.waitForTimeout(2000);

        // 重新检测
        const retestResults = await page.evaluate(() => {
          return {
            roleListItem: document.querySelectorAll('[role="list-item"]').length,
            conversationClass: document.querySelectorAll('[class*="conversation"]').length,
            chatClass: document.querySelectorAll('[class*="chat"]').length,
          };
        });

        console.log('重新检测结果:');
        console.log(JSON.stringify(retestResults, null, 2));
      } else {
        console.log('❌ 未找到"全部"标签');
      }

    } else {
      console.log(`✅ 找到 ${maxCount} 个会话元素 (使用选择器: ${bestSelector})\n`);

      // 点击前的URL
      const urlBefore = page.url();
      console.log(`点击前URL: ${urlBefore}`);

      // 点击第一个会话
      const clickResult = await page.evaluate((selector) => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          const first = elements[0];

          // 获取元素信息
          const info = {
            className: first.className,
            textContent: first.textContent?.substring(0, 100),
            offsetParent: first.offsetParent !== null,
          };

          // 点击
          first.click();

          return { success: true, info };
        }
        return { success: false };
      }, bestSelector);

      if (clickResult.success) {
        console.log('✅ 已点击第一个会话元素');
        console.log('   元素信息:');
        console.log('     className:', clickResult.info.className);
        console.log('     textContent:', clickResult.info.textContent);
        console.log('     可见:', clickResult.info.offsetParent);
        console.log('');

        // 等待页面变化
        await page.waitForTimeout(3000);

        // 点击后的URL
        const urlAfter = page.url();
        console.log(`点击后URL: ${urlAfter}`);
        console.log(`URL是否变化: ${urlBefore !== urlAfter ? '✅ 是' : '❌ 否'}\n`);

        // 检查页面状态
        const pageState = await page.evaluate(() => {
          return {
            // 检查消息相关元素
            hasMessageClass: document.querySelector('[class*="message"]') !== null,
            hasChatClass: document.querySelector('[class*="chat"]') !== null,
            hasTextarea: document.querySelector('textarea') !== null,
            hasContentEditable: document.querySelector('[contenteditable="true"]') !== null,

            // 检查可能的消息列表
            hasMessageList: document.querySelector('[class*="message-list"]') !== null,
            hasChatContent: document.querySelector('[class*="chat-content"]') !== null,

            // URL检查
            urlIncludesChat: window.location.href.includes('/chat/'),
            currentUrl: window.location.href,
          };
        });

        console.log('页面状态检查:');
        console.log('  有message class元素:', pageState.hasMessageClass ? '✅' : '❌');
        console.log('  有chat class元素:', pageState.hasChatClass ? '✅' : '❌');
        console.log('  有textarea元素:', pageState.hasTextarea ? '✅' : '❌');
        console.log('  有contenteditable元素:', pageState.hasContentEditable ? '✅' : '❌');
        console.log('  有message-list元素:', pageState.hasMessageList ? '✅' : '❌');
        console.log('  有chat-content元素:', pageState.hasChatContent ? '✅' : '❌');
        console.log('  URL包含/chat/:', pageState.urlIncludesChat ? '✅' : '❌');
        console.log('');

        // 判断是否成功打开会话详情
        const isOpen = pageState.hasMessageClass ||
                       pageState.hasChatClass ||
                       pageState.hasTextarea ||
                       pageState.hasContentEditable ||
                       pageState.hasMessageList ||
                       pageState.hasChatContent ||
                       pageState.urlIncludesChat;

        if (isOpen) {
          console.log('✅ 会话详情页已打开!\n');

          // 截图保存详情页
          await page.screenshot({ path: './logs/dm-diagnosis-step2-detail.png', fullPage: true });
          console.log('📸 已保存截图: logs/dm-diagnosis-step2-detail.png\n');

          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('📍 步骤4: 分析消息历史加载');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

          // 查找消息元素
          const messagesInfo = await page.evaluate(() => {
            // 尝试多种选择器
            const selectors = [
              '[class*="message"]',
              '[class*="chat-item"]',
              '[class*="bubble"]',
              '[data-message-id]',
            ];

            const results = {};
            selectors.forEach(sel => {
              const elements = document.querySelectorAll(sel);
              results[sel] = {
                count: elements.length,
                sample: elements.length > 0 ? {
                  className: elements[0].className,
                  textContent: elements[0].textContent?.substring(0, 50),
                } : null
              };
            });

            return results;
          });

          console.log('消息元素检测:');
          Object.entries(messagesInfo).forEach(([selector, info]) => {
            console.log(`  ${selector}:`);
            console.log(`    数量: ${info.count}`);
            if (info.sample) {
              console.log(`    示例class: ${info.sample.className}`);
              console.log(`    示例文本: ${info.sample.textContent}`);
            }
          });
          console.log('');

        } else {
          console.log('❌ 会话详情页未打开!\n');
          console.log('⚠️ 当前验证逻辑可能不准确,需要更新选择器\n');

          // 截图保存失败状态
          await page.screenshot({ path: './logs/dm-diagnosis-step2-failed.png', fullPage: true });
          console.log('📸 已保存截图: logs/dm-diagnosis-step2-failed.png\n');
        }

      } else {
        console.log('❌ 点击失败\n');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 诊断总结');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('关键发现:');
    console.log('  1. 最佳选择器:', bestSelector || '未找到');
    console.log('  2. 会话数量:', maxCount);
    console.log('  3. 截图已保存到 logs/ 目录');
    console.log('');

    console.log('建议修复:');
    if (maxCount === 0) {
      console.log('  - 检查"全部"标签是否需要点击');
      console.log('  - 检查页面加载是否完成');
      console.log('  - 检查选择器是否正确');
    } else if (bestSelector !== '[role="list-item"]') {
      console.log(`  - 更新选择器从 [role="list-item"] 到 ${bestSelector}`);
    }

  } catch (error) {
    console.error('\n❌ 诊断过程出错:', error);
    console.error(error.stack);

    // 保存错误截图
    try {
      await page.screenshot({ path: './logs/dm-diagnosis-error.png', fullPage: true });
      console.log('📸 已保存错误截图: logs/dm-diagnosis-error.png');
    } catch (e) {
      // 忽略截图错误
    }
  } finally {
    console.log('\n⏸️  等待30秒后关闭浏览器 (请查看页面状态)...');
    await page.waitForTimeout(30000);

    await context.close();
    db.close();
    console.log('\n✅ 诊断完成');
  }
}

// 创建 logs 目录
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

diagnoseDirectMessageClick().catch(error => {
  console.error('❌ 诊断脚本执行失败:', error);
  process.exit(1);
});
