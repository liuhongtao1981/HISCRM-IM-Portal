/**
 * Chrome 启动诊断脚本
 * 测试不同的浏览器启动方式以确定 exitCode=21 的根本原因
 */

const { chromium } = require('playwright');
const path = require('path');

async function diagnoseChrome() {
  console.log('=== Chrome 启动诊断测试 ===\n');
  console.log('目标: 确定为什么 Chrome 以 exitCode=21 退出\n');

  // 测试 1: Playwright 捆绑的 Chromium (基础启动)
  try {
    console.log('📋 测试 1: 启动 Playwright Chromium (基础模式)...');
    const browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('   ✅ Playwright Chromium 启动成功!');
    console.log(`   浏览器版本: ${browser.version()}`);
    await browser.close();
    console.log('   ✅ 浏览器正常关闭\n');
  } catch (error) {
    console.log('   ❌ Playwright Chromium 启动失败:');
    console.log(`   错误: ${error.message}\n`);
  }

  // 测试 2: 系统安装的 Chrome
  try {
    console.log('📋 测试 2: 启动系统 Chrome...');
    const browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
      args: ['--no-sandbox']
    });
    console.log('   ✅ 系统 Chrome 启动成功!');
    console.log(`   浏览器版本: ${browser.version()}`);
    await browser.close();
    console.log('   ✅ 浏览器正常关闭\n');
  } catch (error) {
    console.log('   ❌ 系统 Chrome 启动失败:');
    console.log(`   错误: ${error.message}\n`);
  }

  // 测试 3: 持久化上下文 (当前失败的模式)
  const testDataDir = path.join(__dirname, 'test-browser-data');
  try {
    console.log('📋 测试 3: 启动持久化上下文 (launchPersistentContext)...');
    console.log(`   数据目录: ${testDataDir}`);
    const context = await chromium.launchPersistentContext(testDataDir, {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    });
    console.log('   ✅ 持久化上下文启动成功!');
    console.log(`   浏览器版本: ${context.browser().version()}`);
    await context.close();
    console.log('   ✅ 上下文正常关闭\n');
  } catch (error) {
    console.log('   ❌ 持久化上下文启动失败:');
    console.log(`   错误: ${error.message}\n`);
  }

  // 测试 4: 持久化上下文 + 系统 Chrome
  try {
    console.log('📋 测试 4: 持久化上下文 + 系统 Chrome...');
    const testDataDir2 = path.join(__dirname, 'test-browser-data-chrome');
    const context = await chromium.launchPersistentContext(testDataDir2, {
      channel: 'chrome',
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('   ✅ 持久化上下文 (系统 Chrome) 启动成功!');
    console.log(`   浏览器版本: ${context.browser().version()}`);
    await context.close();
    console.log('   ✅ 上下文正常关闭\n');
  } catch (error) {
    console.log('   ❌ 持久化上下文 (系统 Chrome) 启动失败:');
    console.log(`   错误: ${error.message}\n`);
  }

  // 测试 5: 检查 Playwright 安装
  console.log('📋 测试 5: Playwright 安装信息...');
  try {
    const executablePath = chromium.executablePath();
    console.log(`   Chromium 可执行文件: ${executablePath}`);
    console.log('   ✅ Playwright Chromium 已安装\n');
  } catch (error) {
    console.log('   ❌ 无法获取 Chromium 路径');
    console.log(`   错误: ${error.message}\n`);
  }

  console.log('=== 诊断完成 ===\n');
  console.log('分析建议:');
  console.log('- 如果测试 1 失败 → Playwright Chromium 有问题，尝试重新安装');
  console.log('- 如果测试 2 成功 → 使用系统 Chrome (channel: "chrome")');
  console.log('- 如果测试 3 失败但测试 1 成功 → 持久化上下文问题，改用 launch + newContext');
  console.log('- 如果测试 4 成功 → 使用持久化上下文 + 系统 Chrome');
  console.log('- 如果所有测试都失败 → 系统环境问题 (防病毒/安全策略)');
}

diagnoseChrome()
  .then(() => {
    console.log('\n✅ 诊断脚本执行完毕');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ 诊断脚本执行失败:', error);
    process.exit(1);
  });
