/**
 * 验证 DataManager 缓存数据的完整�?
 *
 * 功能�?
 * 1. 创建 DataManager 实例
 * 2. 模拟添加各种数据（会话、消息、作品、评论）
 * 3. 定时输出缓存数据，验证关系完整�?
 */

const { DouyinDataManager } = require('../packages/worker/src/platforms/douyin/data-manager');
const { DataPusher } = require('../packages/worker/src/platforms/base/data-pusher');
const { DataSource } = require('../packages/worker/src/platforms/base/data-models');

console.log('══════════════════════════════════════════════════════�?);
console.log('  DataManager 缓存数据完整性验�?);
console.log('═══════════════════════════════════════════════════════\n');

// 模拟 WorkerBridge
const mockWorkerBridge = {
  sendToMaster: async (message) => {
    console.log(`📤 [Mock] 发送到 Master:`, message.type);
    return true;
  }
};

const accountId = 'test-account-001';
const dataPusher = new DataPusher(mockWorkerBridge);
const dataManager = new DouyinDataManager(accountId, dataPusher);

console.log(`�?DataManager 创建成功 (账户: ${accountId})\n`);

// ==================== 模拟数据 ====================

console.log('📝 添加测试数据...\n');

// 1. 添加会话数据（使用抖�?API 格式�?
console.log('1️⃣  添加会话数据');
const conversations = [
  {
    user_id: '100001',        // 抖音使用 user_id 作为会话标识
    conversation_id: '100001',
    nickname: '用户A',
    avatar: {
      url_list: ['https://example.com/avatar1.jpg']
    },
    last_message: '你好�?,
    last_message_time: Date.now() - 3600000,
  },
  {
    user_id: '100002',
    conversation_id: '100002',
    nickname: '用户B',
    avatar: {
      url_list: ['https://example.com/avatar2.jpg']
    },
    last_message: '在吗�?,
    last_message_time: Date.now() - 7200000,
  }
];

conversations.forEach(conv => {
  const result = dataManager.upsertConversation(conv, DataSource.API);
  console.log(`   �?会话: ${result.conversationId} (${result.userName})`);
});

// 2. 添加消息数据（关联到会话�?
console.log('\n2️⃣  添加消息数据');
const messages = [
  {
    message_id: '200001',
    conversation_id: '100001',  // 关联到会�?100001
    sender_id: '100001',
    content: '你好�?,
    message_type: 'text',
    timestamp: Date.now() - 3600000,
  },
  {
    message_id: '200002',
    conversation_id: '100001',  // 关联到会�?100001
    sender_id: accountId,
    content: '你好，有什么可以帮你？',
    message_type: 'text',
    timestamp: Date.now() - 3500000,
  },
  {
    message_id: '200003',
    conversation_id: '100002',  // 关联到会�?100002
    sender_id: '100002',
    content: '在吗�?,
    message_type: 'text',
    timestamp: Date.now() - 7200000,
  }
];

messages.forEach(msg => {
  const result = dataManager.upsertMessage(msg, DataSource.API);
  console.log(`   �?消息: ${result.messageId} -> 会话 ${result.conversationId}`);
});

// 3. 添加作品数据
console.log('\n3️⃣  添加作品数据');
const contents = [
  {
    aweme_id: '300001',
    desc: '测试视频1',
    create_time: Math.floor(Date.now() / 1000) - 86400,
    statistics: {
      comment_count: 10,
      digg_count: 100,
      share_count: 5,
    },
  },
  {
    aweme_id: '300002',
    desc: '测试视频2',
    create_time: Math.floor(Date.now() / 1000) - 172800,
    statistics: {
      comment_count: 20,
      digg_count: 200,
      share_count: 10,
    },
  }
];

contents.forEach(content => {
  const result = dataManager.upsertContent(content, DataSource.API);
  console.log(`   �?作品: ${result.contentId} (${result.title})`);
});

// 4. 添加评论数据（使用抖�?API 格式�?
console.log('\n4️⃣  添加评论数据');
const comments = [
  {
    cid: '400001',
    aweme_id: '300001',  // 关联到作�?300001
    text: '太棒了！',
    user: {
      uid: 'user001',
      nickname: '评论者A',
      avatar_thumb: {
        url_list: ['https://example.com/avatar_comment1.jpg']
      }
    },
    create_time: Math.floor(Date.now() / 1000) - 3600,
    digg_count: 10,
    reply_comment_total: 1,
  },
  {
    cid: '400002',
    aweme_id: '300001',  // 关联到作�?300001
    text: '很不�?,
    user: {
      uid: 'user002',
      nickname: '评论者B',
      avatar_thumb: {
        url_list: ['https://example.com/avatar_comment2.jpg']
      }
    },
    create_time: Math.floor(Date.now() / 1000) - 7200,
    digg_count: 5,
  },
  {
    cid: '400003',
    aweme_id: '300001',  // 关联到作�?300001
    reply_id: '400001',  // 这是对评�?400001 的回�?(注意: 使用 reply_id, 不是 reply_comment_id)
    text: '谢谢�?,
    user: {
      uid: accountId,
      nickname: '创作�?,
      avatar_thumb: {
        url_list: ['https://example.com/avatar_author.jpg']
      }
    },
    create_time: Math.floor(Date.now() / 1000) - 3000,
    digg_count: 2,
    is_author: true,
  },
  {
    cid: '400004',
    aweme_id: '300002',  // 关联到作�?300002
    text: '支持�?,
    user: {
      uid: 'user003',
      nickname: '评论者C',
      avatar_thumb: {
        url_list: ['https://example.com/avatar_comment3.jpg']
      }
    },
    create_time: Math.floor(Date.now() / 1000) - 86400,
    digg_count: 8,
  }
];

comments.forEach(comment => {
  const result = dataManager.upsertComment(comment, DataSource.API);
  const relation = result.parentCommentId
    ? `回复 ${result.parentCommentId}`
    : `作品 ${result.contentId}`;
  console.log(`   �?评论: ${result.commentId} -> ${relation}`);
});

console.log('\n' + '�?.repeat(55));
console.log('  数据关系验证');
console.log('�?.repeat(55) + '\n');

// ==================== 验证数据关系 ====================

function validateDataRelations() {
  console.log('📊 当前缓存状�?\n');

  const stats = dataManager.getStats();
  console.log('统计信息:');
  console.log(`  �?会话: ${stats.collections.conversations.total} 个`);
  console.log(`  �?消息: ${stats.collections.messages.total} 条`);
  console.log(`  �?作品: ${stats.collections.contents.total} 个`);
  console.log(`  �?评论: ${stats.collections.comments.total} 条\n`);

  // 验证会话-消息关系
  console.log('🔗 会话 �?消息 关系:');
  const allConversations = Array.from(dataManager.conversations.items.values());
  allConversations.forEach(conv => {
    // 注意: message.conversationId 是平台ID (100001), conv.conversationId 也是平台ID
    const relatedMessages = Array.from(dataManager.messages.items.values())
      .filter(msg => msg.conversationId === conv.conversationId);
    console.log(`  会话 ${conv.conversationId} (${conv.userName}):`);
    console.log(`    └─ 包含 ${relatedMessages.length} 条消息`);
    relatedMessages.forEach(msg => {
      const direction = msg.senderId === accountId ? '发出' : '收到';
      console.log(`       �?${msg.messageId} [${direction}]: ${msg.content.substring(0, 20)}...`);
    });
  });

  // 验证作品-评论关系
  console.log('\n🔗 作品 �?评论 关系:');
  const allContents = Array.from(dataManager.contents.items.values());
  allContents.forEach(content => {
    // 注意: comment.contentId 是平台ID (300001), content.contentId 也是平台ID
    const relatedComments = Array.from(dataManager.comments.items.values())
      .filter(comment => comment.contentId === content.contentId);
    console.log(`  作品 ${content.contentId} (${content.title}):`);
    console.log(`    └─ 包含 ${relatedComments.length} 条评论`);
    relatedComments.forEach(comment => {
      const type = comment.parentCommentId ? '�?回复' : '�?评论';
      const target = comment.parentCommentId ? `#${comment.parentCommentId}` : '';
      console.log(`       ${type} ${comment.commentId} ${target}: ${comment.content}`);
    });
  });

  // 验证评论-回复关系
  console.log('\n🔗 评论 �?回复 关系:');
  const topLevelComments = Array.from(dataManager.comments.items.values())
    .filter(comment => !comment.parentCommentId);
  topLevelComments.forEach(comment => {
    const replies = Array.from(dataManager.comments.items.values())
      .filter(c => c.parentCommentId === comment.commentId);
    if (replies.length > 0) {
      console.log(`  评论 ${comment.commentId}:`);
      console.log(`    └─ �?${replies.length} 条回复`);
      replies.forEach(reply => {
        console.log(`       �?${reply.commentId}: ${reply.content}`);
      });
    }
  });

  // 数据完整性检�?
  console.log('\n�?数据完整性检�?');

  let allValid = true;

  // 检查孤立消息（没有对应会话�?
  const orphanMessages = Array.from(dataManager.messages.items.values())
    .filter(msg => {
      // 需要通过平台 conversationId 查找会话
      const conv = Array.from(dataManager.conversations.items.values())
        .find(c => c.conversationId === msg.conversationId);
      return !conv;
    });
  if (orphanMessages.length > 0) {
    console.log(`  �?发现 ${orphanMessages.length} 条孤立消息（无对应会话）`);
    allValid = false;
  } else {
    console.log(`  �?所有消息都有对应的会话`);
  }

  // 检查孤立评论（没有对应作品�?
  const orphanComments = Array.from(dataManager.comments.items.values())
    .filter(comment => {
      // 需要通过平台 contentId 查找作品
      const content = Array.from(dataManager.contents.items.values())
        .find(c => c.contentId === comment.contentId);
      return !content;
    });
  if (orphanComments.length > 0) {
    console.log(`  �?发现 ${orphanComments.length} 条孤立评论（无对应作品）`);
    allValid = false;
  } else {
    console.log(`  �?所有评论都有对应的作品`);
  }

  // 检查错误的回复关系
  const invalidReplies = Array.from(dataManager.comments.items.values())
    .filter(comment => {
      if (!comment.parentCommentId) return false;
      const parent = Array.from(dataManager.comments.items.values())
        .find(c => c.commentId === comment.parentCommentId);
      return !parent;
    });
  if (invalidReplies.length > 0) {
    console.log(`  �?发现 ${invalidReplies.length} 条错误的回复关系（父评论不存在）`);
    allValid = false;
  } else {
    console.log(`  �?所有回复都有有效的父评论`);
  }

  if (allValid) {
    console.log('\n🎉 数据关系完整性验证通过！\n');
  } else {
    console.log('\n⚠️  发现数据关系问题，请检查\n');
  }

  console.log('�?.repeat(55) + '\n');
}

// ==================== 定时输出 ====================

console.log('�?启动定时输出（每 10 秒）...\n');
console.log('�?Ctrl+C 停止\n');
console.log('�?.repeat(55) + '\n');

// 立即执行一�?
validateDataRelations();

// �?10 秒输出一�?
let count = 1;
const interval = setInterval(() => {
  console.log(`\n📍 �?${++count} 次检�?(${new Date().toLocaleTimeString()})`);
  console.log('�?.repeat(55) + '\n');
  validateDataRelations();
}, 10000);

// 优雅退�?
process.on('SIGINT', () => {
  console.log('\n\n👋 停止监控\n');
  clearInterval(interval);
  process.exit(0);
});
