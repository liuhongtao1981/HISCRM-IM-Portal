/**
 * 直接测试 DataManager 创建
 *
 * 模拟 Worker 启动流程，直接测�?DataManager 的创�?
 */

const { DouyinDataManager } = require('../packages/worker/src/platforms/douyin/data-manager');
const { DataPusher } = require('../packages/worker/src/platforms/base/data-pusher');

console.log('══════════════════════════════════════════════════════�?);
console.log('  DataManager 创建测试');
console.log('═══════════════════════════════════════════════════════\n');

// 模拟账户 ID
const accountId = 'test-account-123';

// 创建一个模拟的 workerBridge
const mockWorkerBridge = {
  sendToMaster: async (message) => {
    console.log(`📤 [MockBridge] Sending to Master:`, message.type);
    return true;
  }
};

// 创建 DataPusher
console.log('1. 创建 DataPusher...');
const dataPusher = new DataPusher(mockWorkerBridge);
console.log('   �?DataPusher 创建成功\n');

// 创建 DouyinDataManager
console.log('2. 创建 DouyinDataManager...');
try {
  const dataManager = new DouyinDataManager(accountId, dataPusher);
  console.log('   �?DouyinDataManager 创建成功');
  console.log(`   账户 ID: ${dataManager.accountId}`);
  console.log(`   平台: ${dataManager.platform}`);
  console.log(`   自动同步: ${dataManager.pushConfig.autoSync}`);
  console.log(`   同步间隔: ${dataManager.pushConfig.pushInterval}ms\n`);

  // 测试数据管理功能
  console.log('3. 测试数据管理功能...');

  // 添加一条测试会�?
  const testConversation = {
    conversation_id: 'conv123',
    user_name: '测试用户',
    avatar_url: 'https://example.com/avatar.jpg',
    last_message: '你好',
    last_message_time: Date.now(),
  };

  const { DataSource } = require('../packages/worker/src/platforms/base/data-models');
  const conversation = dataManager.upsertConversation(testConversation, DataSource.API);
  console.log(`   �?添加会话成功: ${conversation.conversationId}`);

  // 检查统�?
  const stats = dataManager.getStats();
  console.log(`   统计:`, JSON.stringify(stats, null, 2));

  console.log('\n�?所有测试通过！DataManager 功能正常。\n');

} catch (error) {
  console.error('   �?创建 DouyinDataManager 失败:', error.message);
  console.error(error.stack);
  process.exit(1);
}

console.log('══════════════════════════════════════════════════════�?);
