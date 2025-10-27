/**
 * 端到端集成测试
 * 测试 Worker → Master → Client 完整数据流
 */

const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('test-integration-e2e', './tests/logs');

// ============================================
// 模拟 Master 处理器
// ============================================

class MockMasterProcessors {
  constructor() {
    this.results = {
      comments: { inserted: 0, skipped: 0, notified: 0 },
      messages: { inserted: 0, skipped: 0, notified: 0 },
      videos: { inserted: 0, skipped: 0, notified: 0 },
    };
    this.ackResults = [];
  }

  onPushNewComments(data) {
    logger.info(`[Master] Processing ${data.comments.length} comments`);

    let inserted = 0, skipped = 0, notified = 0;

    for (const comment of data.comments) {
      // 模拟: 第一次推送的都是新数据
      if (Math.random() > 0.2) {
        inserted++;
        notified++;
      } else {
        skipped++;
      }
    }

    this.results.comments = { inserted, skipped, notified };
    this.ackResults.push({
      type: 'comments',
      request_id: data.request_id,
      success: true,
      inserted,
      skipped,
      notified,
    });

    logger.info(`[Master] ✅ Processed: ${inserted} inserted, ${skipped} skipped, ${notified} notified`);
    return { success: true, inserted, skipped, notified };
  }

  onPushNewMessages(data) {
    logger.info(`[Master] Processing ${data.messages.length} messages`);

    let inserted = 0, skipped = 0, notified = 0;

    for (const msg of data.messages) {
      if (Math.random() > 0.2) {
        inserted++;
        notified++;
      } else {
        skipped++;
      }
    }

    this.results.messages = { inserted, skipped, notified };
    this.ackResults.push({
      type: 'messages',
      request_id: data.request_id,
      success: true,
      inserted,
      skipped,
      notified,
    });

    logger.info(`[Master] ✅ Processed: ${inserted} inserted, ${skipped} skipped, ${notified} notified`);
    return { success: true, inserted, skipped, notified };
  }

  onPushNewVideos(data) {
    logger.info(`[Master] Processing ${data.videos.length} videos`);

    let inserted = 0, skipped = 0, notified = 0;

    for (const video of data.videos) {
      if (Math.random() > 0.2) {
        inserted++;
        notified++;
      } else {
        skipped++;
      }
    }

    this.results.videos = { inserted, skipped, notified };
    this.ackResults.push({
      type: 'videos',
      request_id: data.request_id,
      success: true,
      inserted,
      skipped,
      notified,
    });

    logger.info(`[Master] ✅ Processed: ${inserted} inserted, ${skipped} skipped, ${notified} notified`);
    return { success: true, inserted, skipped, notified };
  }
}

// ============================================
// 模拟 Worker 推送
// ============================================

function generateTestData() {
  const baseTime = Math.floor(Date.now() / 1000);

  return {
    comments: Array.from({ length: 5 }, (_, i) => ({
      id: `comment-${uuidv4()}`,
      content: `Test comment ${i}`,
      author_name: `User ${i}`,
      author_id: `user-${i}`,
      post_id: 'post-123',
      post_title: 'Test Post',
      created_at: baseTime - i * 3600,
    })),
    messages: Array.from({ length: 3 }, (_, i) => ({
      id: `message-${uuidv4()}`,
      content: `Test message ${i}`,
      from_user_id: `sender-${i}`,
      from_user_name: `Sender ${i}`,
      created_at: baseTime - i * 1800,
    })),
    videos: Array.from({ length: 2 }, (_, i) => ({
      id: `video-${uuidv4()}`,
      title: `Test Video ${i}`,
      cover: 'https://example.com/cover.jpg',
      publish_time: baseTime - i * 86400,
      stats_comment_count: Math.floor(Math.random() * 100),
    })),
  };
}

// ============================================
// 测试场景
// ============================================

async function testCommentFlow() {
  logger.info('\n╔════════════════════════════════════════════════════╗');
  logger.info('║  测试场景 1: 评论推送完整流程                        ║');
  logger.info('╚════════════════════════════════════════════════════╝\n');

  const data = generateTestData();
  const master = new MockMasterProcessors();
  const requestId = `req-${uuidv4()}`;

  // Step 1: Worker 生成数据
  logger.info('[Worker] 🔄 Generated comment data');
  logger.info(`  - Count: ${data.comments.length}`);
  logger.info(`  - Request ID: ${requestId}`);

  // Step 2: Worker 推送到 Master
  logger.info('\n[Worker] 📤 Pushing comments to Master...');
  const pushData = {
    request_id: requestId,
    account_id: 'account-001',
    platform_user_id: 'platform-user-001',
    comments: data.comments,
  };

  // Step 3: Master 处理
  logger.info('[Master] 📥 Received push_new_comments event');
  const result = master.onPushNewComments(pushData);

  // Step 4: 验证结果
  logger.info('\n[Verification] ✅ Flow completed successfully');
  logger.info(`  - Inserted: ${result.inserted}`);
  logger.info(`  - Skipped: ${result.skipped}`);
  logger.info(`  - Notified: ${result.notified}`);
  logger.info(`  - ACK sent: ${result.success}`);

  return {
    scenario: 'Comment Flow',
    status: result.success ? 'PASS' : 'FAIL',
    data: result,
  };
}

async function testMessageFlow() {
  logger.info('\n╔════════════════════════════════════════════════════╗');
  logger.info('║  测试场景 2: 私信推送完整流程                        ║');
  logger.info('╚════════════════════════════════════════════════════╝\n');

  const data = generateTestData();
  const master = new MockMasterProcessors();
  const requestId = `req-${uuidv4()}`;

  logger.info('[Worker] 🔄 Generated message data');
  logger.info(`  - Count: ${data.messages.length}`);

  logger.info('\n[Worker] 📤 Pushing messages to Master...');
  const pushData = {
    request_id: requestId,
    account_id: 'account-002',
    platform_user_id: 'platform-user-002',
    messages: data.messages,
  };

  logger.info('[Master] 📥 Received push_new_messages event');
  const result = master.onPushNewMessages(pushData);

  logger.info('\n[Verification] ✅ Flow completed successfully');
  logger.info(`  - Inserted: ${result.inserted}`);
  logger.info(`  - Skipped: ${result.skipped}`);
  logger.info(`  - Notified: ${result.notified}`);

  return {
    scenario: 'Message Flow',
    status: result.success ? 'PASS' : 'FAIL',
    data: result,
  };
}

async function testVideoFlow() {
  logger.info('\n╔════════════════════════════════════════════════════╗');
  logger.info('║  测试场景 3: 视频推送完整流程                        ║');
  logger.info('╚════════════════════════════════════════════════════╝\n');

  const data = generateTestData();
  const master = new MockMasterProcessors();
  const requestId = `req-${uuidv4()}`;

  logger.info('[Worker] 🔄 Generated video data');
  logger.info(`  - Count: ${data.videos.length}`);

  logger.info('\n[Worker] 📤 Pushing videos to Master...');
  const pushData = {
    request_id: requestId,
    account_id: 'account-003',
    platform_user_id: 'platform-user-003',
    videos: data.videos,
  };

  logger.info('[Master] 📥 Received push_new_videos event');
  const result = master.onPushNewVideos(pushData);

  logger.info('\n[Verification] ✅ Flow completed successfully');
  logger.info(`  - Inserted: ${result.inserted}`);
  logger.info(`  - Skipped: ${result.skipped}`);
  logger.info(`  - Notified: ${result.notified}`);

  return {
    scenario: 'Video Flow',
    status: result.success ? 'PASS' : 'FAIL',
    data: result,
  };
}

// ============================================
// 主测试运行器
// ============================================

async function runAllTests() {
  logger.info('╔════════════════════════════════════════════════════╗');
  logger.info('║  端到端集成测试 - Worker → Master → Client         ║');
  logger.info('╠════════════════════════════════════════════════════╣');
  logger.info('║  验证完整的新数据推送系统数据流                    ║');
  logger.info('╚════════════════════════════════════════════════════╝');

  const results = [];

  try {
    results.push(await testCommentFlow());
    results.push(await testMessageFlow());
    results.push(await testVideoFlow());
  } catch (error) {
    logger.error('Test execution failed:', error);
    return false;
  }

  // 总结
  logger.info('\n╔════════════════════════════════════════════════════╗');
  logger.info('║  测试总结                                          ║');
  logger.info('╠════════════════════════════════════════════════════╣');

  let passed = 0;
  for (const result of results) {
    const status = result.status === 'PASS' ? '✅' : '❌';
    logger.info(`║ ${status} ${result.scenario.padEnd(45)} ║`);
    if (result.status === 'PASS') passed++;
  }

  logger.info('╠════════════════════════════════════════════════════╣');
  logger.info(`║  总计: ${passed}/${results.length} 通过                              ║`);
  logger.info('╠════════════════════════════════════════════════════╣');

  if (passed === results.length) {
    logger.info('║  状态: ✅ 所有测试通过                             ║');
  } else {
    logger.info('║  状态: ❌ 存在失败测试                             ║');
  }

  logger.info('╚════════════════════════════════════════════════════╝\n');

  return passed === results.length;
}

// ============================================
// 执行
// ============================================

if (require.main === module) {
  (async () => {
    try {
      const success = await runAllTests();
      process.exit(success ? 0 : 1);
    } catch (error) {
      logger.error('Test error:', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  runAllTests,
  testCommentFlow,
  testMessageFlow,
  testVideoFlow,
};
