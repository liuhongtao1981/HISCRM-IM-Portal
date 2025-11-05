/**
 * 测试浏览器启动 - 排查 exitCode=21 崩溃问题
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testBrowserLaunch() {
  console.log('\n===  测试 Playwright Chromium 启动 ===\n');

  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker1/test_browser');

  // 确保目录存在
  if (fs.existsSync(userDataDir)) {
    console.log(`清理已存在的测试目录: ${userDataDir}`);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  fs.mkdirSync(userDataDir, { recursive: true });
  console.log(`✅ 创建用户数据目录: ${userDataDir}\n`);

  // 测试1: 最小参数启动
  console.log('测试 1: 最小参数启动...');
  try {
    const context1 = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('✅ 测试 1 成功: 浏览器启动正常');
    await context1.close();
  } catch (error) {
    console.error('❌ 测试 1 失败:', error.message);
  }

  // 清理
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });

  // 测试2: 添加 --disable-dev-shm-usage
  console.log('\n测试 2: 添加 --disable-dev-shm-usage...');
  try {
    const context2 = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
    console.log('✅ 测试 2 成功: 浏览器启动正常');
    await context2.close();
  } catch (error) {
    console.error('❌ 测试 2 失败:', error.message);
  }

  // 清理
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });

  // 测试3: 使用完整的 Worker 参数（简化版）
  console.log('\n测试 3: 使用简化的 Worker 参数...');
  try {
    const context3 = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: { width: 1440, height: 900 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1440,900',
        '--window-position=100,100'
      ]
    });
    console.log('✅ 测试 3 成功: 浏览器启动正常');
    await context3.close();
  } catch (error) {
    console.error('❌ 测试 3 失败:', error.message);
  }

  // 清理
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });

  // 测试4: 使用 Worker 的完整参数
  console.log('\n测试 4: 使用 Worker 完整参数...');
  try {
    const context4 = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: { width: 1440, height: 900 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--window-size=1440,900',
        '--window-position=100,100',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });
    console.log('✅ 测试 4 成功: 浏览器启动正常');

    // 保持浏览器打开3秒
    console.log('浏览器将保持打开3秒...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    await context4.close();
  } catch (error) {
    console.error('❌ 测试 4 失败:', error.message);
    console.error('完整错误栈:', error.stack);
  }

  // 最终清理
  console.log('\n清理测试目录...');
  fs.rmSync(userDataDir, { recursive: true, force: true });

  console.log('\n=== 测试完成 ===\n');
}

testBrowserLaunch().catch(err => {
  console.error('测试脚本执行失败:', err);
  process.exit(1);
});
