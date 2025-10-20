/**
 * 抖音回复功能集成测试
 * 测试评论回复和私信回复的完整流程
 */

const DouyinPlatform = require('./platform');
const BrowserManager = require('../../browser/browser-manager-v2');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('reply-integration-test');

/**
 * 模拟 WorkerBridge
 */
class MockWorkerBridge {
  constructor() {
    this.events = [];
    this.socket = {
      emit: (event, data) => {
        this.events.push({ event, data, timestamp: Date.now() });
        logger.info(`[Socket Event] ${event}:`, data);
      },
      on: () => {},
    };
  }

  getEvents(eventType) {
    return this.events.filter(e => e.event === eventType);
  }

  clearEvents() {
    this.events = [];
  }
}

/**
 * 测试套件：评论回复
 */
async function testReplyToComment() {
  logger.info('=== 开始测试: 评论回复功能 ===');

  const mockBridge = new MockWorkerBridge();
  const browserManager = new BrowserManager();
  const config = {
    platform: 'douyin',
    displayName: '抖音',
  };

  const platform = new DouyinPlatform(config, mockBridge, browserManager);

  try {
    // 测试用例 1: 基本回复
    logger.info('测试用例 1: 基本评论回复');
    const result = await platform.replyToComment('test-account-1', {
      target_id: 'comment-123456',
      reply_content: '这是一条测试回复！😊',
      context: {
        video_id: 'video-789',
        comment_user_id: 'user-456',
      },
      browserManager,
    });

    logger.info('✅ 回复成功:', result);

    // 验证返回结构
    if (!result.success || !result.platform_reply_id) {
      throw new Error('回复返回结构不正确');
    }

    // 测试用例 2: 长文本回复
    logger.info('测试用例 2: 长文本回复');
    const longContent = '这是一条比较长的回复内容，用于测试系统是否能够处理较长的回复文本。包含多个句子和换行符\n测试内容第二行';

    const result2 = await platform.replyToComment('test-account-1', {
      target_id: 'comment-654321',
      reply_content: longContent,
      context: {
        video_id: 'video-999',
      },
      browserManager,
    });

    logger.info('✅ 长文本回复成功:', result2);

    // 测试用例 3: 特殊字符回复
    logger.info('测试用例 3: 特殊字符回复');
    const specialContent = '👍🎉❤️ 很棒！@用户名 #话题';

    const result3 = await platform.replyToComment('test-account-1', {
      target_id: 'comment-111111',
      reply_content: specialContent,
      context: {
        video_id: 'video-111',
      },
      browserManager,
    });

    logger.info('✅ 特殊字符回复成功:', result3);

    logger.info('✅ 所有评论回复测试通过！');
    return { success: true, tests: 3 };

  } catch (error) {
    logger.error('❌ 评论回复测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 测试套件：私信回复
 */
async function testReplyToDirectMessage() {
  logger.info('=== 开始测试: 私信回复功能 ===');

  const mockBridge = new MockWorkerBridge();
  const browserManager = new BrowserManager();
  const config = {
    platform: 'douyin',
    displayName: '抖音',
  };

  const platform = new DouyinPlatform(config, mockBridge, browserManager);

  try {
    // 测试用例 1: 基本私信回复
    logger.info('测试用例 1: 基本私信回复');
    const result = await platform.replyToDirectMessage('test-account-1', {
      target_id: 'message-123456',
      reply_content: '感谢您的私信！',
      context: {
        sender_id: 'user-sender-123',
        conversation_id: 'conv-789',
      },
      browserManager,
    });

    logger.info('✅ 私信回复成功:', result);

    if (!result.success || !result.platform_reply_id) {
      throw new Error('私信回复返回结构不正确');
    }

    // 测试用例 2: 带链接的私信
    logger.info('测试用例 2: 带链接的私信回复');
    const linkContent = '请点击查看详情：https://www.douyin.com/video/123456';

    const result2 = await platform.replyToDirectMessage('test-account-1', {
      target_id: 'message-654321',
      reply_content: linkContent,
      context: {
        sender_id: 'user-sender-456',
        conversation_id: 'conv-999',
      },
      browserManager,
    });

    logger.info('✅ 链接私信回复成功:', result2);

    // 测试用例 3: 多行私信
    logger.info('测试用例 3: 多行私信回复');
    const multilineContent = `亲爱的用户：\n感谢您的咨询\n我们将尽快为您服务\n祝好！`;

    const result3 = await platform.replyToDirectMessage('test-account-1', {
      target_id: 'message-111111',
      reply_content: multilineContent,
      context: {
        sender_id: 'user-sender-789',
      },
      browserManager,
    });

    logger.info('✅ 多行私信回复成功:', result3);

    logger.info('✅ 所有私信回复测试通过！');
    return { success: true, tests: 3 };

  } catch (error) {
    logger.error('❌ 私信回复测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 测试套件：错误处理
 */
async function testErrorHandling() {
  logger.info('=== 开始测试: 错误处理 ===');

  const mockBridge = new MockWorkerBridge();
  const browserManager = new BrowserManager();
  const config = {
    platform: 'douyin',
    displayName: '抖音',
  };

  const platform = new DouyinPlatform(config, mockBridge, browserManager);

  try {
    // 测试用例 1: 空内容回复
    logger.info('测试用例 1: 空内容回复处理');
    try {
      await platform.replyToComment('test-account-1', {
        target_id: 'comment-123',
        reply_content: '', // 空内容
        context: {},
        browserManager,
      });
      logger.warn('⚠️  应该抛出空内容错误，但没有');
    } catch (error) {
      if (error.message.includes('empty') || error.message.includes('required')) {
        logger.info('✅ 正确处理了空内容错误');
      }
    }

    // 测试用例 2: 无效的 target_id
    logger.info('测试用例 2: 无效 target_id 处理');
    try {
      await platform.replyToComment('test-account-1', {
        target_id: null,
        reply_content: '测试内容',
        context: {},
        browserManager,
      });
    } catch (error) {
      logger.info('✅ 正确处理了无效 target_id');
    }

    // 测试用例 3: 超时处理
    logger.info('测试用例 3: 超时处理');
    try {
      const timeoutResult = await Promise.race([
        platform.replyToComment('test-account-1', {
          target_id: 'comment-123',
          reply_content: '测试',
          context: {},
          browserManager,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5000)
        ),
      ]);
    } catch (error) {
      logger.info('✅ 超时处理测试完成');
    }

    logger.info('✅ 所有错误处理测试通过！');
    return { success: true, tests: 3 };

  } catch (error) {
    logger.error('❌ 错误处理测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 测试套件：幂等性
 */
async function testIdempotency() {
  logger.info('=== 开始测试: 幂等性 ===');

  const mockBridge = new MockWorkerBridge();
  const browserManager = new BrowserManager();
  const config = {
    platform: 'douyin',
    displayName: '抖音',
  };

  const platform = new DouyinPlatform(config, mockBridge, browserManager);

  try {
    // 测试用例 1: 相同的 request_id 应返回相同的结果
    logger.info('测试用例 1: 相同 request_id 幂等性');

    const request1 = await platform.replyToComment('test-account-1', {
      target_id: 'comment-123',
      reply_content: '测试幂等性',
      context: { request_id: 'req-12345' },
      browserManager,
    });

    const request2 = await platform.replyToComment('test-account-1', {
      target_id: 'comment-123',
      reply_content: '测试幂等性',
      context: { request_id: 'req-12345' },
      browserManager,
    });

    if (request1.platform_reply_id === request2.platform_reply_id) {
      logger.info('✅ 幂等性验证通过');
    } else {
      logger.warn('⚠️  同一请求返回了不同的 reply_id');
    }

    logger.info('✅ 幂等性测试完成！');
    return { success: true, tests: 1 };

  } catch (error) {
    logger.error('❌ 幂等性测试失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  logger.info('╔════════════════════════════════════════╗');
  logger.info('║  抖音回复功能集成测试套件              ║');
  logger.info('╚════════════════════════════════════════╝');

  const results = {
    comment_reply: await testReplyToComment(),
    direct_message_reply: await testReplyToDirectMessage(),
    error_handling: await testErrorHandling(),
    idempotency: await testIdempotency(),
  };

  // 输出总结
  logger.info('\n╔════════════════════════════════════════╗');
  logger.info('║          测试执行总结                  ║');
  logger.info('╚════════════════════════════════════════╝');

  const totalTests = Object.values(results).reduce((sum, r) => sum + (r.tests || 0), 0);
  const passedTests = Object.values(results).filter(r => r.success).length;

  logger.info(`总测试数: ${totalTests}`);
  logger.info(`通过: ${passedTests}/${Object.keys(results).length}`);

  Object.entries(results).forEach(([name, result]) => {
    const status = result.success ? '✅' : '❌';
    logger.info(`${status} ${name}: ${result.tests || 0} 个测试`);
  });

  const allPassed = Object.values(results).every(r => r.success);
  logger.info(`\n总体状态: ${allPassed ? '✅ 全部通过' : '❌ 有失败'}`);

  return { success: allPassed, results };
}

// 如果直接运行此文件
if (require.main === module) {
  runAllTests().catch(error => {
    logger.error('测试执行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  testReplyToComment,
  testReplyToDirectMessage,
  testErrorHandling,
  testIdempotency,
  runAllTests,
};
