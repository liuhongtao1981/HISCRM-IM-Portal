/**
 * 测试平台初始化流程
 */

const path = require('path');

// 设置环境变量
process.env.NODE_ENV = 'development';

async function testPlatformInitialization() {
  console.log('========================================');
  console.log('测试平台初始化流程');
  console.log('========================================\n');

  try {
    // 1. 加载平台管理器
    const PlatformManager = require('../packages/worker/src/platform-manager');

    // 创建模拟的 workerBridge 和 browserManager
    const mockWorkerBridge = {
      socket: {
        emit: () => {},
        on: () => {}
      }
    };

    const mockBrowserManager = {
      getContext: () => null
    };

    // 创建平台管理器实例
    const platformManager = new PlatformManager(mockWorkerBridge, mockBrowserManager);

    // 2. 加载平台
    console.log('1. 加载平台...');
    await platformManager.loadPlatforms();
    console.log(`   ✓ 已加载 ${platformManager.platforms.size} 个平台\n`);

    // 3. 获取抖音平台
    console.log('2. 获取抖音平台...');
    const douyinPlatform = platformManager.getPlatform('douyin');
    console.log('   douyinPlatform 存在:', !!douyinPlatform);
    console.log('   douyinPlatform 类型:', douyinPlatform ? douyinPlatform.constructor.name : 'null');

    if (!douyinPlatform) {
      console.error('   ❌ 无法获取抖音平台');
      return;
    }

    console.log('   ✓ 成功获取抖音平台\n');

    // 4. 检查 initialize 方法
    console.log('3. 检查 initialize 方法...');
    console.log('   douyinPlatform.initialize 存在:', typeof douyinPlatform.initialize);
    console.log('   douyinPlatform.initialize 是函数:', typeof douyinPlatform.initialize === 'function');

    if (typeof douyinPlatform.initialize !== 'function') {
      console.error('   ❌ initialize 不是一个函数');
      return;
    }

    console.log('   ✓ initialize 方法存在\n');

    // 5. 尝试调用 initialize
    console.log('4. 调用 initialize 方法...');
    const mockAccount = {
      id: 'test-account-123',
      platform: 'douyin',
      account_id: 'test_douyin_123',
      account_name: '测试账户'
    };

    try {
      console.log('   调用 platform.initialize(mockAccount)...');
      await douyinPlatform.initialize(mockAccount);
      console.log('   ✓ initialize 调用成功\n');
    } catch (error) {
      console.error('   ❌ initialize 调用失败:', error.message);
      console.error('   错误堆栈:', error.stack);
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 运行测试
testPlatformInitialization()
  .then(() => {
    console.log('\n========================================');
    console.log('测试完成');
    console.log('========================================');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n========================================');
    console.error('测试出错:', error);
    console.error('========================================');
    process.exit(1);
  });
