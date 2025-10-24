/**
 * 检查 platformManager 返回的对象
 */

// 模拟 workerBridge 和 browserManager
const mockBridge = {
  socket: { emit: () => {} }
};

const mockBrowserManager = {
  getOrCreateFingerprintConfig: () => ({}),
  createBrowser: () => Promise.resolve({})
};

// 加载 PlatformManager
const PlatformManager = require('../packages/worker/src/platform-manager');

console.log('🧪 检查 PlatformManager\n');

(async () => {
  try {
    // 创建 PlatformManager 实例
    const platformManager = new PlatformManager(mockBridge, mockBrowserManager);

    console.log('📋 已注册的平台:');
    const platforms = platformManager.getSupportedPlatforms();
    console.log('  ', platforms);
    console.log('');

    // 获取 douyin 平台
    console.log('🔍 获取 douyin 平台实例...');
    const douyinPlatform = platformManager.getPlatform('douyin');

    if (!douyinPlatform) {
      console.error('❌ douyin 平台未找到！');
      process.exit(1);
    }

    console.log('✅ douyin 平台实例获取成功');
    console.log('   类型:', typeof douyinPlatform);
    console.log('   构造函数:', douyinPlatform.constructor.name);
    console.log('');

    // 检查方法
    console.log('🔧 检查平台方法:');
    const methods = ['getName', 'startLogin', 'login', 'detectLoginMethod'];

    for (const method of methods) {
      if (typeof douyinPlatform[method] === 'function') {
        console.log(`   ✓ ${method}: function`);
      } else {
        console.log(`   ❌ ${method}: ${typeof douyinPlatform[method]}`);
      }
    }

    console.log('');

    // 尝试调用 getName()
    console.log('📞 调用 getName() 方法...');
    try {
      const name = douyinPlatform.getName();
      console.log(`   ✅ getName() 返回: "${name}"`);
    } catch (error) {
      console.error(`   ❌ getName() 失败:`, error.message);
    }

    console.log('\n✅ 所有检查完成！');

  } catch (error) {
    console.error('\n❌ 检查失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
