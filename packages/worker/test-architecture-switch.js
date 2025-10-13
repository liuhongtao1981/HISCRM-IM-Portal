/**
 * 浏览器架构切换测试
 *
 * 用于验证不同架构的切换和基本功能
 *
 * 使用方法:
 *   # 测试单Browser架构
 *   BROWSER_ARCHITECTURE=single node test-architecture-switch.js
 *
 *   # 测试多Browser架构
 *   BROWSER_ARCHITECTURE=multi node test-architecture-switch.js
 */

const { getBrowserManager, getArchitectureInfo } = require('./src/config/browser-config');

async function testArchitecture() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║         浏览器架构切换测试                             ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // 1. 显示当前架构信息
  const archInfo = getArchitectureInfo();
  console.log('📊 当前架构配置:');
  console.log(`   类型: ${archInfo.name}`);
  console.log(`   说明: ${archInfo.description}`);
  console.log(`   指纹隔离级别: ${archInfo.fingerprint_isolation}`);
  console.log(`   内存消耗: ${archInfo.memory_per_account}`);
  console.log(`   启动时间: ${archInfo.startup_time}`);
  console.log(`   建议最大账户数: ${archInfo.max_recommended_accounts}`);
  console.log();

  // 2. 显示优缺点
  console.log('✅ 优势:');
  archInfo.pros.forEach(pro => console.log(`   - ${pro}`));
  console.log();

  console.log('⚠️  劣势:');
  archInfo.cons.forEach(con => console.log(`   - ${con}`));
  console.log();

  // 3. 创建BrowserManager实例
  console.log('🔧 创建BrowserManager实例...');
  const testWorkerId = 'test-worker';
  const browserManager = getBrowserManager(testWorkerId, {
    headless: true,
    dataDir: `./data/test/${testWorkerId}`
  });
  console.log('✓ BrowserManager创建成功\n');

  // 4. 测试基本功能
  console.log('🧪 测试基本功能...');

  try {
    // 测试账户ID
    const testAccounts = ['test-account-1', 'test-account-2'];

    console.log(`   创建${testAccounts.length}个页面实例...`);
    const startTime = Date.now();

    for (const accountId of testAccounts) {
      console.log(`   - 为账户 ${accountId} 创建页面...`);
      const page = await browserManager.newPage(accountId);
      console.log(`     ✓ 页面创建成功`);

      // 导航到测试页面
      await page.goto('https://example.com');
      const title = await page.title();
      console.log(`     ✓ 成功访问页面: ${title}`);

      // 关闭页面
      await page.close();
      console.log(`     ✓ 页面关闭成功`);
    }

    const endTime = Date.now();
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n   测试完成! 总耗时: ${totalTime}秒`);
    console.log(`   平均每个账户: ${(totalTime / testAccounts.length).toFixed(2)}秒\n`);

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    // 5. 清理资源
    console.log('🧹 清理资源...');
    await browserManager.close();
    console.log('✓ 资源清理完成\n');
  }

  // 6. 测试总结
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║         测试完成                                       ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log();
  console.log('📝 建议:');

  if (archInfo.type === 'single') {
    console.log('   ✓ 当前使用单Browser架构,适合大规模账户监控');
    console.log('   ✓ 如需更高级别的指纹隔离,可切换到多Browser架构:');
    console.log('     BROWSER_ARCHITECTURE=multi node test-architecture-switch.js');
  } else {
    console.log('   ✓ 当前使用多Browser架构,提供最高级别的指纹隔离');
    console.log('   ✓ 如需降低资源消耗,可切换到单Browser架构:');
    console.log('     BROWSER_ARCHITECTURE=single node test-architecture-switch.js');
  }
  console.log();
  console.log('📚 详细文档:');
  console.log(`   ${archInfo.docs}`);
  console.log('   ../../.docs/浏览器架构切换指南.md');
  console.log('   ../../.docs/architecture/浏览器架构对比.md');
}

// 运行测试
testArchitecture().catch(error => {
  console.error('测试异常:', error);
  process.exit(1);
});
