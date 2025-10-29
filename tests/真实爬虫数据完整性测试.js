/**
 * 真实爬虫数据完整性测试
 *
 * 目标:
 * 1. 触发真实爬虫抓取数据
 * 2. 监控 DataManager 更新日志
 * 3. 验证抓取到的数据关系完整性
 * 4. 输出详细的缓存状态
 */

const path = require('path');

// 设置环境变量
process.env.NODE_ENV = 'development';
process.env.WORKER_ID = 'test-worker-001';

// 引入依赖
const DouyinPlatform = require('../packages/worker/src/platforms/douyin/platform');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('crawler-test');

// 测试配置
const TEST_CONFIG = {
  accountId: 'dy_bst_studio',  // 使用你实际配置的账户ID
  crawlerTypes: ['comments', 'contents', 'direct-messages'],  // 要测试的爬虫类型
  monitorInterval: 5000,  // 每5秒输出一次状态
  testDuration: 60000,    // 测试持续60秒
};

// 全局状态
let platform = null;
let dataManager = null;
let monitorTimer = null;
let startTime = Date.now();

console.log('═'.repeat(55));
console.log('  真实爬虫数据完整性测试');
console.log('═'.repeat(55));
console.log(`账户ID: ${TEST_CONFIG.accountId}`);
console.log(`测试爬虫: ${TEST_CONFIG.crawlerTypes.join(', ')}`);
console.log(`监控间隔: ${TEST_CONFIG.monitorInterval / 1000}秒`);
console.log(`测试时长: ${TEST_CONFIG.testDuration / 1000}秒`);
console.log('═'.repeat(55) + '\n');

/**
 * 输出 DataManager 统计信息
 */
function printDataManagerStats() {
  if (!dataManager) {
    console.log('⚠️  DataManager 尚未创建\n');
    return;
  }

  const stats = dataManager.getStats();
  const elapsed = Math.floor((Date.now() - startTime) / 1000);

  console.log('\n' + '═'.repeat(55));
  console.log(`📊 数据统计 (运行时间: ${elapsed}秒)`);
  console.log('═'.repeat(55));

  console.log(`\n基本信息:`);
  console.log(`  • 账户ID: ${stats.accountId}`);
  console.log(`  • 平台: ${stats.platform}`);

  console.log(`\n数据集合:`);
  console.log(`  • 会话: ${stats.collections.conversations.total} 个 (待同步: ${stats.collections.conversations.dirty})`);
  console.log(`  • 消息: ${stats.collections.messages.total} 条 (待同步: ${stats.collections.messages.dirty})`);
  console.log(`  • 作品: ${stats.collections.contents.total} 个 (待同步: ${stats.collections.contents.dirty})`);
  console.log(`  • 评论: ${stats.collections.comments.total} 条 (待同步: ${stats.collections.comments.dirty})`);
  console.log(`  • 通知: ${stats.collections.notifications.total} 条 (待同步: ${stats.collections.notifications.dirty})`);

  console.log(`\n推送配置:`);
  console.log(`  • 自动同步: ${stats.pushConfig.autoSync ? '启用' : '禁用'}`);
  console.log(`  • 同步间隔: ${stats.pushConfig.interval / 1000}秒`);
  console.log(`  • 批量大小: ${stats.pushConfig.batchSize}`);

  // 验证数据关系
  validateDataRelations();
}

/**
 * 验证数据关系完整性
 */
function validateDataRelations() {
  if (!dataManager) return;

  console.log(`\n数据关系验证:`);

  let allValid = true;

  // 1. 验证会话-消息关系
  const allConversations = Array.from(dataManager.conversations.items.values());
  const allMessages = Array.from(dataManager.messages.items.values());

  if (allConversations.length > 0) {
    console.log(`\n  🔗 会话 ↔ 消息:`);
    allConversations.slice(0, 3).forEach(conv => {
      const relatedMessages = allMessages.filter(msg => msg.conversationId === conv.conversationId);
      console.log(`     会话 ${conv.conversationId} (${conv.userName}): ${relatedMessages.length} 条消息`);
    });
    if (allConversations.length > 3) {
      console.log(`     ... 还有 ${allConversations.length - 3} 个会话`);
    }

    // 检查孤立消息
    const orphanMessages = allMessages.filter(msg => {
      return !allConversations.find(c => c.conversationId === msg.conversationId);
    });
    if (orphanMessages.length > 0) {
      console.log(`     ❌ 发现 ${orphanMessages.length} 条孤立消息`);
      allValid = false;
    } else if (allMessages.length > 0) {
      console.log(`     ✅ 所有消息都有对应会话`);
    }
  }

  // 2. 验证作品-评论关系
  const allContents = Array.from(dataManager.contents.items.values());
  const allComments = Array.from(dataManager.comments.items.values());

  if (allContents.length > 0) {
    console.log(`\n  🔗 作品 ↔ 评论:`);
    allContents.slice(0, 3).forEach(content => {
      const relatedComments = allComments.filter(c => c.contentId === content.contentId);
      const title = content.title ? content.title.substring(0, 20) : '无标题';
      console.log(`     作品 ${content.contentId} (${title}...): ${relatedComments.length} 条评论`);
    });
    if (allContents.length > 3) {
      console.log(`     ... 还有 ${allContents.length - 3} 个作品`);
    }

    // 检查孤立评论
    const orphanComments = allComments.filter(comment => {
      return !allContents.find(c => c.contentId === comment.contentId);
    });
    if (orphanComments.length > 0) {
      console.log(`     ❌ 发现 ${orphanComments.length} 条孤立评论`);
      allValid = false;
    } else if (allComments.length > 0) {
      console.log(`     ✅ 所有评论都有对应作品`);
    }
  }

  // 3. 验证评论-回复关系
  if (allComments.length > 0) {
    const topLevelComments = allComments.filter(c => !c.parentCommentId);
    const replies = allComments.filter(c => c.parentCommentId);

    if (replies.length > 0) {
      console.log(`\n  🔗 评论 ↔ 回复:`);
      console.log(`     一级评论: ${topLevelComments.length} 条`);
      console.log(`     回复: ${replies.length} 条`);

      // 检查无效回复
      const invalidReplies = replies.filter(reply => {
        return !allComments.find(c => c.commentId === reply.parentCommentId);
      });
      if (invalidReplies.length > 0) {
        console.log(`     ❌ 发现 ${invalidReplies.length} 条无效回复 (父评论不存在)`);
        allValid = false;
      } else {
        console.log(`     ✅ 所有回复都有有效父评论`);
      }
    }
  }

  if (allValid) {
    console.log(`\n  🎉 数据关系完整性验证通过！`);
  } else {
    console.log(`\n  ⚠️  发现数据关系问题`);
  }

  console.log('═'.repeat(55) + '\n');
}

/**
 * 启动监控
 */
function startMonitoring() {
  console.log('⏰ 启动定时监控...\n');

  // 立即输出一次
  printDataManagerStats();

  // 定时输出
  monitorTimer = setInterval(() => {
    printDataManagerStats();

    // 检查是否超时
    if (Date.now() - startTime >= TEST_CONFIG.testDuration) {
      console.log(`\n⏱️  测试时间到 (${TEST_CONFIG.testDuration / 1000}秒)，停止监控`);
      stopMonitoring();
      process.exit(0);
    }
  }, TEST_CONFIG.monitorInterval);
}

/**
 * 停止监控
 */
function stopMonitoring() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

/**
 * 主测试流程
 */
async function runTest() {
  try {
    console.log('1️⃣  初始化抖音平台...');
    platform = new DouyinPlatform();

    console.log('2️⃣  获取 DataManager (测试懒加载)...');
    dataManager = await platform.getDataManager(TEST_CONFIG.accountId);

    if (!dataManager) {
      throw new Error('DataManager 创建失败');
    }

    console.log(`✅ DataManager 创建成功 (账户: ${TEST_CONFIG.accountId})\n`);

    // 检查浏览器状态
    console.log('3️⃣  检查账户浏览器状态...');
    const accountBrowser = platform.browserManager.getBrowserForAccount(TEST_CONFIG.accountId);

    if (!accountBrowser || !accountBrowser.page) {
      console.log('⚠️  账户浏览器未运行，需要先启动 Worker 并登录账户');
      console.log('提示: npm run start:worker');
      console.log('\n测试将仅验证 DataManager 创建和结构，不执行真实爬取\n');

      // 只输出一次统计
      printDataManagerStats();
      process.exit(0);
      return;
    }

    console.log(`✅ 账户浏览器已就绪\n`);

    // 启动监控
    startMonitoring();

    // 执行爬虫测试
    console.log('4️⃣  开始执行爬虫测试...\n');

    for (const crawlerType of TEST_CONFIG.crawlerTypes) {
      try {
        console.log(`\n${'─'.repeat(55)}`);
        console.log(`  测试爬虫: ${crawlerType}`);
        console.log('─'.repeat(55));

        const account = { id: TEST_CONFIG.accountId, platform: 'douyin' };

        switch (crawlerType) {
          case 'comments':
            console.log('触发评论爬虫...');
            await platform.crawlComments(account, { maxScroll: 2 });
            break;

          case 'contents':
            console.log('触发作品爬虫...');
            await platform.crawlContents(account, { maxScroll: 2 });
            break;

          case 'direct-messages':
            console.log('触发私信爬虫...');
            await platform.crawlDirectMessages(account, { maxScroll: 2 });
            break;

          default:
            console.log(`⚠️  未知的爬虫类型: ${crawlerType}`);
        }

        console.log(`✅ ${crawlerType} 爬虫执行完成`);

        // 等待一段时间让数据处理完成
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`❌ ${crawlerType} 爬虫执行失败:`, error.message);
      }
    }

    console.log('\n' + '═'.repeat(55));
    console.log('  所有爬虫测试完成');
    console.log('═'.repeat(55));
    console.log('\n继续监控数据变化...');
    console.log('按 Ctrl+C 停止\n');

  } catch (error) {
    console.error('❌ 测试执行失败:', error);
    stopMonitoring();
    process.exit(1);
  }
}

// 处理退出信号
process.on('SIGINT', () => {
  console.log('\n\n收到中断信号，正在清理...');
  stopMonitoring();

  if (dataManager) {
    const finalStats = dataManager.getStats();
    console.log('\n最终统计:');
    console.log(`  • 会话: ${finalStats.collections.conversations.total}`);
    console.log(`  • 消息: ${finalStats.collections.messages.total}`);
    console.log(`  • 作品: ${finalStats.collections.contents.total}`);
    console.log(`  • 评论: ${finalStats.collections.comments.total}`);
  }

  console.log('\n测试结束\n');
  process.exit(0);
});

// 启动测试
runTest();
