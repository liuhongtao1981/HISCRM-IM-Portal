/**
 * 直接测试 DataManager 日志功能
 * 验证文件名清理和 debug 日志写入
 */

const path = require('path');
const fs = require('fs');

// 不改变工作目录，使用绝对路径
const { AccountDataManager } = require('../packages/worker/src/platforms/base/account-data-manager');
const { DouyinDataManager } = require('../packages/worker/src/platforms/douyin/douyin-data-manager');

console.log('='.repeat(80));
console.log('测试：DataManager 日志功能');
console.log('='.repeat(80));

const testAccountId = 'acc-test-12345';
const logDir = path.join(__dirname, '../packages/worker/logs');

console.log(`\n测试账户 ID: ${testAccountId}`);
console.log(`日志目录: ${logDir}`);

// 检查日志目录
if (!fs.existsSync(logDir)) {
  console.log(`\n⚠️  日志目录不存在，创建中...`);
  fs.mkdirSync(logDir, { recursive: true});
}

console.log(`\n期望的日志文件：`);
console.log(`  - data-manager_${testAccountId}.log`);
console.log(`  - data-manager_${testAccountId}-error.log`);
console.log(`  - douyin-data_${testAccountId}.log`);
console.log(`  - douyin-data_${testAccountId}-error.log`);

// 创建模拟的 dataPusher
const mockDataPusher = {
  async push(data) {
    console.log(`\n📤 [MockPusher] 推送数据:`, {
      conversations: data.conversations?.length || 0,
      messages: data.messages?.length || 0,
      contents: data.contents?.length || 0,
      comments: data.comments?.length || 0,
    });
    return { success: true, synced: Object.values(data).flat().length };
  }
};

console.log(`\n${'='.repeat(80)}`);
console.log('步骤 1: 创建 DouyinDataManager');
console.log('='.repeat(80));

const dataManager = new DouyinDataManager(testAccountId, mockDataPusher);

console.log(`✅ DouyinDataManager 已创建`);

// 等待一下确保 logger 初始化完成
setTimeout(() => {
  console.log(`\n${'='.repeat(80)}`);
  console.log('步骤 2: 插入测试数据');
  console.log('='.repeat(80));

  // 测试数据：会话
  const testConversation = {
    user_id: '888888',
    user: {
      nickname: '测试用户A',
      avatar_thumb: {
        url_list: ['https://example.com/avatar1.jpg']
      }
    }
  };

  // 测试数据：消息
  const testMessage = {
    message_id: 'msg_001',
    conversation_id: '888888',
    sender_id: '888888',
    sender_name: '测试用户A',
    recipient_id: testAccountId,
    type: 'text',
    content: '这是一条测试消息',
    direction: 'incoming',
    created_at: Date.now()
  };

  // 测试数据：作品
  const testContent = {
    aweme_id: 'aweme_001',
    author_user_id: testAccountId,
    desc: '测试视频作品',
    create_time: Date.now()
  };

  // 测试数据：评论
  const testComment = {
    cid: 'comment_001',
    aweme_id: 'aweme_001',
    user: {
      uid: '999999',
      nickname: '评论者B'
    },
    text: '很棒的视频！',
    create_time: Date.now()
  };

  console.log(`\n📝 插入 1 个会话...`);
  const mappedConv = dataManager.mapConversationData(testConversation);
  const conversation = dataManager.upsertConversation(mappedConv);
  console.log(`   ✓ 会话ID: ${conversation.id}`);

  console.log(`\n📝 插入 1 条消息...`);
  const mappedMsg = dataManager.mapMessageData(testMessage);
  const message = dataManager.upsertMessage(mappedMsg);
  console.log(`   ✓ 消息ID: ${message.id}`);

  console.log(`\n📝 插入 1 个作品...`);
  const mappedContent = dataManager.mapContentData(testContent);
  const content = dataManager.upsertContent(mappedContent);
  console.log(`   ✓ 作品ID: ${content.id}`);

  console.log(`\n📝 插入 1 条评论...`);
  const mappedComment = dataManager.mapCommentData(testComment);
  const comment = dataManager.upsertComment(mappedComment);
  console.log(`   ✓ 评论ID: ${comment.id}`);

  console.log(`\n📊 当前统计:`);
  const stats = dataManager.getStats();
  console.log(JSON.stringify(stats, null, 2));

  // 批量插入测试
  console.log(`\n📝 批量插入 3 个会话...`);
  const batchConversations = [
    { user_id: '100001', user: { nickname: '用户1' } },
    { user_id: '100002', user: { nickname: '用户2' } },
    { user_id: '100003', user: { nickname: '用户3' } },
  ].map(c => dataManager.mapConversationData(c));

  const conversations = dataManager.batchUpsertConversations(batchConversations);
  console.log(`   ✓ 批量插入了 ${conversations.length} 个会话`);

  // 等待日志写入
  setTimeout(() => {
    console.log(`\n${'='.repeat(80)}`);
    console.log('步骤 3: 检查日志文件');
    console.log('='.repeat(80));

    const expectedFiles = [
      `data-manager_${testAccountId}.log`,
      `data-manager_${testAccountId}-error.log`,
      `douyin-data_${testAccountId}.log`,
      `douyin-data_${testAccountId}-error.log`,
    ];

    expectedFiles.forEach(filename => {
      const filePath = path.join(logDir, filename);
      const exists = fs.existsSync(filePath);

      console.log(`\n📄 ${filename}`);
      console.log(`   存在: ${exists ? '✅' : '❌'}`);

      if (exists) {
        const stats = fs.statSync(filePath);
        console.log(`   大小: ${stats.size} 字节`);

        if (stats.size > 0) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.trim().split('\n');
          console.log(`   行数: ${lines.length}`);

          console.log(`\n   前 5 行内容:`);
          lines.slice(0, 5).forEach((line, idx) => {
            try {
              const log = JSON.parse(line);
              console.log(`   ${idx + 1}. [${log.level}] ${log.message}`);
            } catch (e) {
              console.log(`   ${idx + 1}. ${line.substring(0, 80)}...`);
            }
          });
        } else {
          console.log(`   ⚠️  文件为空`);
        }
      }
    });

    console.log(`\n${'='.repeat(80)}`);
    console.log('测试完成');
    console.log('='.repeat(80));

    // 清理测试数据
    expectedFiles.forEach(filename => {
      const filePath = path.join(logDir, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️  已删除测试日志文件: ${filename}`);
      }
    });

  }, 2000);  // 等待 2 秒让日志写入

}, 500);  // 等待 0.5 秒让 logger 初始化完成
