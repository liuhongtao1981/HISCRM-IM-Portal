/**
 * 测试 DataManager 的数据同步功�?
 * 直接创建 DataManager 实例并调�?syncToMaster
 */

const { DouyinDataManager } = require('../packages/worker/src/platforms/douyin/data-manager');
const { DataPusher } = require('../packages/worker/src/platforms/base/data-pusher');

console.log('==================================================');
console.log('测试 DataManager 数据同步功能');
console.log('==================================================\n');

// 创建模拟�?workerBridge
const mockBridge = {
  async sendToMaster(message) {
    console.log('\n📤 mockBridge.sendToMaster 被调�?');
    console.log('  消息类型:', message.type);
    console.log('  消息负载:', JSON.stringify(message.payload, null, 2));
    return Promise.resolve();
  }
};

console.log('步骤 1: 创建 DataPusher');
const dataPusher = new DataPusher(mockBridge);
console.log('�?DataPusher 创建成功\n');

console.log('步骤 2: 创建 DouyinDataManager');
const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';
const dataManager = new DouyinDataManager(accountId, dataPusher);
console.log('�?DouyinDataManager 创建成功\n');

// 添加一些测试数�?
console.log('步骤 3: 添加测试数据');
dataManager.upsertConversation({
  user_id: '12345',
  user: { nickname: '测试用户 1', avatar_thumb: {} },
});
dataManager.upsertConversation({
  user_id: '67890',
  user: { nickname: '测试用户 2', avatar_thumb: {} },
});
console.log('�?添加�?2 个测试会话\n');

// 手动触发同步
console.log('步骤 4: 手动调用 syncToMaster()');
console.log('--------------------------------------------\n');

dataManager.syncToMaster()
  .then(() => {
    console.log('\n--------------------------------------------');
    console.log('�?syncToMaster() 完成\n');

    // 显示统计信息
    const stats = dataManager.getStats();
    console.log('📊 DataManager 统计信息:');
    console.log('  总推送次�?', stats.totalPushed);
    console.log('  最后推送时�?', stats.lastPushTime ? new Date(stats.lastPushTime).toLocaleString() : 'N/A');
    console.log('  总会话数:', stats.conversations);
    console.log('  总私信数:', stats.messages);
    console.log('  总评论数:', stats.comments);
    console.log('  总作品数:', stats.contents);

    console.log('\n==================================================');
    console.log('测试完成�?);
    console.log('==================================================');
  })
  .catch(err => {
    console.error('\n�?syncToMaster() 失败:', err);
    console.error('错误堆栈:', err.stack);
  });
