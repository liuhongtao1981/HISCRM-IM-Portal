/**
 * 诊断 TabManager - 测试基本功能
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('TabManager-Diagnostic');

async function diagnosisTabManager() {
  try {
    console.log('==========================================');
    console.log('诊断 TabManager');
    console.log('==========================================\n');

    // 1. 测试导入
    console.log('1. 测试 TabManager 导入...');
    const { TabManager, TabTag } = require('../packages/worker/src/browser/tab-manager');
    console.log('   ✓ TabManager 导入成功');
    console.log('   ✓ TabTag:', Object.keys(TabTag));

    // 2. 测试创建实例
    console.log('\n2. 测试创建 TabManager 实例...');

    // 模拟 BrowserManager
    const mockBrowserManager = {
      async getAccountContext(accountId) {
        console.log(`   - getAccountContext called for ${accountId}`);
        return {
          pages: () => [],
          newPage: async () => {
            console.log('   - newPage called');
            return {
              url: () => 'about:blank',
              goto: async (url) => console.log(`   - goto: ${url}`),
              waitForTimeout: async (ms) => console.log(`   - waitForTimeout: ${ms}ms`),
              close: async () => console.log('   - page.close called'),
              isClosed: () => false,
            };
          }
        };
      }
    };

    const tabManager = new TabManager(mockBrowserManager);
    console.log('   ✓ TabManager 实例创建成功');

    // 3. 测试获取页面
    console.log('\n3. 测试 getPageForTask()...');
    try {
      const result = await tabManager.getPageForTask('test-account', {
        tag: TabTag.LOGIN,
        persistent: false,
        shareable: true,
        forceNew: false
      });
      console.log('   ✓ getPageForTask 调用成功');
      console.log('   - tabId:', result.tabId);
      console.log('   - page:', result.page ? '存在' : '不存在');
      console.log('   - shouldClose:', result.shouldClose);

      // 4. 测试关闭Tab
      console.log('\n4. 测试 closeTab()...');
      await tabManager.closeTab('test-account', result.tabId);
      console.log('   ✓ closeTab 调用成功');

    } catch (error) {
      console.error('   ✗ 测试失败:', error.message);
      console.error('   Stack:', error.stack);
    }

    console.log('\n==========================================');
    console.log('✅ TabManager 诊断完成');
    console.log('==========================================');

  } catch (error) {
    console.error('\n❌ 诊断失败:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

diagnosisTabManager();
