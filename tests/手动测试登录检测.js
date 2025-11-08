/**
 * 手动测试登录检�?
 *
 * 目的：模�?Worker 的登录检测逻辑，看为什么判断为未登�?
 *
 * 使用方法�?
 * node tests/手动测试登录检�?js
 */

const { chromium } = require('playwright');
const path = require('path');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';
const userDataDir = path.join(__dirname, `../packages/worker/data/browser/worker1/browser_${accountId}`);

console.log('='.repeat(80));
console.log('手动测试登录检�?);
console.log('='.repeat(80));
console.log('');
console.log(`账户 ID: ${accountId}`);
console.log(`UserDataDir: ${userDataDir}`);
console.log('');

(async () => {
  let browser;
  let context;

  try {
    console.log('1. 启动 PersistentContext（使用保存的 cookies�?..');
    console.log('-'.repeat(80));

    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,  // 显示浏览器，方便观察
      slowMo: 500,
    });

    console.log('�?PersistentContext 启动成功');
    console.log('');

    // 获取第一个页�?
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    console.log('2. 导航到创作中心页�?..');
    console.log('-'.repeat(80));

    await page.goto('https://creator.douyin.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(3000);

    console.log(`�?导航完成: ${page.url()}`);
    console.log('');

    console.log('3. 执行登录检�?..');
    console.log('-'.repeat(80));

    // �?检测登录页面指示器（优先级最高）
    const loginPageIndicators = [
      'text=扫码登录',
      'text=验证码登�?,
      'text=密码登录',
      'text=我是创作�?,
      'text=我是MCN机构',
      'text=需在手机上进行确认',
      '[class*="qrcode"]',
      '[class*="login-qrcode"]',
    ];

    console.log('3.1 检查登录页面指示器:');
    let foundLoginIndicator = false;
    for (const indicator of loginPageIndicators) {
      try {
        const element = await page.$(indicator);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            console.log(`   �?找到登录指示�? ${indicator} - 判定为【未登录】`);
            foundLoginIndicator = true;
            break;
          }
        }
      } catch (e) {
        // 忽略错误
      }
    }

    if (!foundLoginIndicator) {
      console.log(`   �?没有找到登录页面指示器`);
    }

    console.log('');
    console.log('3.2 检查用户信息容�?');

    const userContainerSelectors = [
      'div.container-vEyGlK',
      'div[class*="container-"]',
    ];

    let foundUserContainer = false;
    for (const selector of userContainerSelectors) {
      try {
        const container = await page.$(selector);
        if (container) {
          const isVisible = await container.isVisible();
          if (isVisible) {
            const text = await container.textContent();
            if (text && text.includes('抖音号：')) {
              console.log(`   �?找到用户信息容器: ${selector}`);
              console.log(`   �?包含"抖音号：" - 判定为【已登录】`);
              console.log(`   容器内容: ${text.substring(0, 100)}...`);
              foundUserContainer = true;
              break;
            }
          }
        }
      } catch (e) {
        console.log(`   �?检�?${selector} 失败: ${e.message}`);
      }
    }

    if (!foundUserContainer) {
      console.log(`   �?没有找到用户信息容器`);
    }

    console.log('');
    console.log('3.3 检查抖音号元素:');

    const douyinIdSelectors = [
      'div.unique_id-EuH8eA',
      'div[class*="unique_id-"]',
    ];

    let foundDouyinId = false;
    for (const selector of douyinIdSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            const text = await element.textContent();
            if (text && text.includes('抖音号：')) {
              console.log(`   �?找到抖音号元�? ${selector}`);
              console.log(`   内容: ${text}`);
              foundDouyinId = true;
              break;
            }
          }
        }
      } catch (e) {
        console.log(`   �?检�?${selector} 失败: ${e.message}`);
      }
    }

    if (!foundDouyinId) {
      console.log(`   �?没有找到抖音号元素`);
    }

    console.log('');
    console.log('4. 检测结�?');
    console.log('-'.repeat(80));

    if (foundLoginIndicator) {
      console.log('�?检测结�? 未登�?);
      console.log('   原因: 页面上有登录指示器（二维码、登录按钮等�?);
    } else if (foundUserContainer || foundDouyinId) {
      console.log('�?检测结�? 已登�?);
      console.log('   原因: 页面上有用户信息容器或抖音号元素');
    } else {
      console.log('⚠️  检测结�? 无法判断');
      console.log('   原因: 既没有登录指示器，也没有用户信息元素');
      console.log('   建议: 页面可能还在加载中，或者页面结构发生了变化');
    }

    console.log('');
    console.log('5. 获取页面截图（保存到 tests/ 目录�?);
    console.log('-'.repeat(80));

    const screenshotPath = path.join(__dirname, '登录检测截�?png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`�?截图已保�? ${screenshotPath}`);

    console.log('');
    console.log('6. 获取页面 HTML（保存到 tests/ 目录�?);
    console.log('-'.repeat(80));

    const htmlContent = await page.content();
    const htmlPath = path.join(__dirname, '登录检测页�?html');
    const fs = require('fs');
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`�?HTML 已保�? ${htmlPath}`);
    console.log(`   可以查看页面结构，定位元素`);

    console.log('');
    console.log('�?Ctrl+C 关闭浏览�?..');

    // 保持浏览器打开，直到用户手动关�?
    await new Promise(resolve => {
      process.on('SIGINT', () => {
        console.log('\n正在关闭浏览�?..');
        resolve();
      });
    });

  } catch (error) {
    console.error('�?测试过程中出�?', error);
  } finally {
    if (context) {
      await context.close();
    }
    console.log('');
    console.log('='.repeat(80));
    console.log('测试完成');
    console.log('='.repeat(80));
  }
})();
