/**
 * 测试脚本：DataManager 数据快照功能
 *
 * 功能�?
 * 1. 创建 DataManager 实例
 * 2. 插入测试数据
 * 3. 验证快照功能（每30秒记录完整数据）
 * 4. 查看日志中的序列化数�?
 */

const path = require('path');
const fs = require('fs');

const { DouyinDataManager } = require('../packages/worker/src/platforms/douyin/data-manager');

console.log('='.repeat(80));
console.log('测试：DataManager 数据快照功能');
console.log('='.repeat(80));

const testAccountId = 'acc-snapshot-test';
const logDir = path.join(__dirname, '../packages/worker/logs');

console.log(`\n测试账户 ID: ${testAccountId}`);
console.log(`日志目录: ${logDir}\n`);

// 创建模拟�?dataPusher
const mockDataPusher = {
  async pushData(accountId, data) {
    console.log(`\n📤 [MockPusher] 模拟推送数�?`, {
      conversations: data.conversations?.length || 0,
      messages: data.messages?.length || 0,
      contents: data.contents?.length || 0,
      comments: data.comments?.length || 0,
    });

    return {
      success: true,
      synced: Object.values(data).flat().length,
      syncedIds: {
        conversations: data.conversations?.map(c => c.id) || [],
        messages: data.messages?.map(m => m.id) || [],
        contents: data.contents?.map(c => c.id) || [],
        comments: data.comments?.map(c => c.id) || [],
      }
    };
  }
};

console.log('='.repeat(80));
console.log('步骤 1: 创建 DouyinDataManager');
console.log('='.repeat(80));

const dataManager = new DouyinDataManager(testAccountId, mockDataPusher);

console.log('�?DouyinDataManager 已创�?);
console.log('�?数据快照功能已自动启动（默认 30 秒间隔）');

// 准备测试数据
const testData = {
  conversations: [
    {
      user_id: '10001',
      user: {
        nickname: '张三',
        avatar_thumb: { url_list: ['https://example.com/avatar1.jpg'] }
      }
    },
    {
      user_id: '10002',
      user: {
        nickname: '李四',
        avatar_thumb: { url_list: ['https://example.com/avatar2.jpg'] }
      }
    },
    {
      user_id: '10003',
      user: {
        nickname: '王五',
        avatar_thumb: { url_list: ['https://example.com/avatar3.jpg'] }
      }
    },
  ],
  messages: [
    {
      message_id: 'msg_001',
      conversation_id: '10001',
      sender_id: '10001',
      sender_name: '张三',
      recipient_id: testAccountId,
      type: 'text',
      content: '你好，请问产品还有货吗？',
      direction: 'incoming',
      created_at: Date.now() - 3600000
    },
    {
      message_id: 'msg_002',
      conversation_id: '10001',
      sender_id: testAccountId,
      sender_name: '客服',
      recipient_id: '10001',
      type: 'text',
      content: '您好！有货的，欢迎下单�?,
      direction: 'outgoing',
      created_at: Date.now() - 3000000
    },
    {
      message_id: 'msg_003',
      conversation_id: '10002',
      sender_id: '10002',
      sender_name: '李四',
      recipient_id: testAccountId,
      type: 'text',
      content: '什么时候能发货�?,
      direction: 'incoming',
      created_at: Date.now() - 1800000
    },
  ],
  contents: [
    {
      aweme_id: 'video_001',
      author_user_id: testAccountId,
      desc: '新品上市，限时优惠！',
      create_time: Date.now() - 86400000,
      statistics: {
        play_count: 1500,
        digg_count: 89,
        comment_count: 23,
        share_count: 12
      }
    },
  ],
  comments: [
    {
      cid: 'comment_001',
      aweme_id: 'video_001',
      user: {
        uid: '20001',
        nickname: '评论者A'
      },
      text: '产品看起来不错！',
      digg_count: 5,
      reply_comment_total: 1,
      create_time: Date.now() - 3600000
    },
    {
      cid: 'comment_002',
      aweme_id: 'video_001',
      user: {
        uid: '20002',
        nickname: '评论者B'
      },
      text: '价格怎么样？',
      digg_count: 3,
      reply_comment_total: 0,
      create_time: Date.now() - 1800000
    },
  ]
};

console.log(`\n${'='.repeat(80)}`);
console.log('步骤 2: 插入测试数据');
console.log('='.repeat(80));

// 插入会话
console.log(`\n📝 插入 ${testData.conversations.length} 个会�?..`);
const conversations = dataManager.batchUpsertConversations(
  testData.conversations.map(c => dataManager.mapConversationData(c))
);
console.log(`   �?成功插入 ${conversations.length} 个会话`);

// 插入消息
console.log(`\n📝 插入 ${testData.messages.length} 条消�?..`);
const messages = dataManager.batchUpsertMessages(
  testData.messages.map(m => dataManager.mapMessageData(m))
);
console.log(`   �?成功插入 ${messages.length} 条消息`);

// 插入作品
console.log(`\n📝 插入 ${testData.contents.length} 个作�?..`);
const contents = dataManager.batchUpsertContents(
  testData.contents.map(c => dataManager.mapContentData(c))
);
console.log(`   �?成功插入 ${contents.length} 个作品`);

// 插入评论
console.log(`\n📝 插入 ${testData.comments.length} 条评�?..`);
const comments = dataManager.batchUpsertComments(
  testData.comments.map(c => dataManager.mapCommentData(c))
);
console.log(`   �?成功插入 ${comments.length} 条评论`);

console.log(`\n📊 当前数据统计:`);
const stats = dataManager.getStats();
console.log(JSON.stringify(stats, null, 2));

console.log(`\n${'='.repeat(80)}`);
console.log('步骤 3: 测试手动快照');
console.log('='.repeat(80));

console.log('\n📸 立即触发一次数据快�?..\n');
dataManager.logDataSnapshot();

console.log(`\n${'='.repeat(80)}`);
console.log('步骤 4: 等待自动快照�?0秒间隔）');
console.log('='.repeat(80));

console.log('\n�?等待第一次自动快照（30 秒）...');
console.log('💡 提示：快照将自动记录到日志文件中');
console.log(`📁 日志文件: data-manager_${testAccountId}.log`);

let snapshotCount = 0;
const monitorInterval = setInterval(() => {
  snapshotCount++;
  const elapsed = snapshotCount * 10;
  console.log(`   ⏱️  已等�?${elapsed} �?..`);

  if (elapsed >= 40) {
    clearInterval(monitorInterval);

    console.log(`\n${'='.repeat(80)}`);
    console.log('步骤 5: 检查日志文�?);
    console.log('='.repeat(80));

    const logFile = path.join(logDir, `data-manager_${testAccountId}.log`);

    if (fs.existsSync(logFile)) {
      console.log(`\n�?日志文件已创�? ${logFile}`);

      const stats = fs.statSync(logFile);
      console.log(`   文件大小: ${stats.size} 字节`);

      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n');
      console.log(`   日志行数: ${lines.length}`);

      // 查找快照日志
      const snapshotLogs = lines.filter(line => line.includes('Data Snapshot'));
      console.log(`   数据快照: ${snapshotLogs.length} 次`);

      if (snapshotLogs.length > 0) {
        console.log(`\n📸 最后一次快照预览：`);
        try {
          const lastSnapshot = JSON.parse(snapshotLogs[snapshotLogs.length - 1]);
          console.log(JSON.stringify(lastSnapshot, null, 2).substring(0, 1000) + '...');
        } catch (e) {
          console.log(snapshotLogs[snapshotLogs.length - 1].substring(0, 500) + '...');
        }
      }

      console.log(`\n�?快照功能正常工作！`);
      console.log(`\n💡 查看完整日志:`);
      console.log(`   cat "${logFile}" | jq`);
      console.log(`\n💡 只看快照:`);
      console.log(`   grep "Data Snapshot" "${logFile}" | jq`);

    } else {
      console.log(`\n�?日志文件未找�? ${logFile}`);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('测试完成');
    console.log('='.repeat(80));

    console.log('\n🧹 清理资源...');
    dataManager.destroy();

    // 清理测试日志
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
      console.log(`🗑�? 已删除测试日�? ${logFile}`);
    }
    const errorLogFile = path.join(logDir, `data-manager_${testAccountId}-error.log`);
    if (fs.existsSync(errorLogFile)) {
      fs.unlinkSync(errorLogFile);
      console.log(`🗑�? 已删除错误日�? ${errorLogFile}`);
    }

    console.log('\n�?测试完成�?);
    process.exit(0);
  }
}, 10000); // �?0秒输出一次进�?
