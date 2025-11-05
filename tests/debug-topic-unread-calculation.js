/**
 * 调试 topic unreadCount 的计算逻辑
 * 多次请求同一个账户的 topics，检查未读数是否稳定
 */
const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

console.log('=== 调试 Topic 未读数计算 ===\n');

const socket = io(MASTER_URL, {
  transports: ['websocket'],
  reconnection: false
});

let testChannelId = null;
let requestCount = 0;
const topicsHistory = [];  // 记录每次请求的 topics

socket.on('connect', () => {
  console.log('✅ 已连接到 Master\n');

  // 注册为监控客户端
  socket.emit('monitor:register', {
    clientId: 'debug-client',
    clientType: 'monitor'
  });
});

socket.on('monitor:registered', (data) => {
  console.log('✅ 监控注册成功');
  console.log(`频道数量: ${data.channelCount}\n`);
});

socket.on('monitor:channels', (data) => {
  const channels = data.channels || [];

  if (channels.length === 0) {
    console.log('❌ 没有找到频道');
    socket.disconnect();
    process.exit(1);
    return;
  }

  // 选择第一个频道进行测试
  testChannelId = channels[0].id;
  console.log(`测试频道: ${channels[0].name} (${testChannelId})\n`);
  console.log('开始连续请求 topics 10 次，每次间隔 500ms...\n');

  // 连续请求 10 次
  for (let i = 1; i <= 10; i++) {
    setTimeout(() => {
      requestCount = i;
      console.log(`\n[请求 ${i}] emit('monitor:request_topics', { channelId: ${testChannelId} })`);
      socket.emit('monitor:request_topics', { channelId: testChannelId });
    }, i * 500);
  }

  // 15秒后分析结果
  setTimeout(() => {
    analyzeResults();
    socket.disconnect();
    process.exit(0);
  }, 6000);
});

socket.on('monitor:topics', (data) => {
  const { channelId, topics } = data;
  const receivedAt = Date.now();

  console.log(`[响应] 收到 topics (请求 #${topicsHistory.length + 1}): ${topics.length} 个 topics`);

  // 计算未读数
  let totalUnread = 0;
  let privateUnread = 0;
  let commentUnread = 0;

  topics.forEach(topic => {
    totalUnread += (topic.unreadCount || 0);
    if (topic.isPrivate) {
      privateUnread += (topic.unreadCount || 0);
    } else {
      commentUnread += (topic.unreadCount || 0);
    }
  });

  console.log(`  - 评论未读: ${commentUnread}`);
  console.log(`  - 私信未读: ${privateUnread}`);
  console.log(`  - 总未读: ${totalUnread}`);

  // 保存到历史记录
  topicsHistory.push({
    receivedAt,
    topicsCount: topics.length,
    totalUnread,
    privateUnread,
    commentUnread,
    topics: JSON.parse(JSON.stringify(topics))  // 深拷贝
  });
});

function analyzeResults() {
  console.log('\n=== 分析结果 ===\n');

  if (topicsHistory.length === 0) {
    console.log('❌ 没有收到任何 topics 响应');
    return;
  }

  console.log(`总共收到 ${topicsHistory.length} 次响应\n`);

  // 检查未读数是否稳定
  const unreadCounts = topicsHistory.map(h => ({
    comment: h.commentUnread,
    private: h.privateUnread,
    total: h.totalUnread
  }));

  console.log('未读数变化：\n');
  unreadCounts.forEach((count, index) => {
    console.log(`响应 ${index + 1}: 评论=${count.comment}, 私信=${count.private}, 总计=${count.total}`);
  });

  // 检查是否有跳动
  const uniqueCommentCounts = [...new Set(unreadCounts.map(c => c.comment))];
  const uniquePrivateCounts = [...new Set(unreadCounts.map(c => c.private))];

  console.log(`\n评论未读数的唯一值: ${JSON.stringify(uniqueCommentCounts)}`);
  console.log(`私信未读数的唯一值: ${JSON.stringify(uniquePrivateCounts)}`);

  if (uniqueCommentCounts.length > 1) {
    console.log(`\n⚠️  评论未读数在跳动！有 ${uniqueCommentCounts.length} 个不同的值`);
    console.log(`值为: ${uniqueCommentCounts.join(', ')}`);
  } else {
    console.log('\n✅ 评论未读数稳定');
  }

  if (uniquePrivateCounts.length > 1) {
    console.log(`\n⚠️  私信未读数在跳动！有 ${uniquePrivateCounts.length} 个不同的值`);
    console.log(`值为: ${uniquePrivateCounts.join(', ')}`);
  } else {
    console.log('\n✅ 私信未读数稳定');
  }

  // 检查 topics 数量是否稳定
  const topicsCounts = topicsHistory.map(h => h.topicsCount);
  const uniqueTopicsCounts = [...new Set(topicsCounts)];

  if (uniqueTopicsCounts.length > 1) {
    console.log(`\n⚠️  Topics 数量在变化！有 ${uniqueTopicsCounts.length} 个不同的值`);
    console.log(`值为: ${uniqueTopicsCounts.join(', ')}`);
  } else {
    console.log(`\n✅ Topics 数量稳定 (${uniqueTopicsCounts[0]} 个)`);
  }

  // 如果有跳动，详细对比第一次和第二次的差异
  if (uniqueCommentCounts.length > 1 || uniquePrivateCounts.length > 1) {
    console.log('\n=== 详细对比第一次和第二次响应 ===\n');

    const first = topicsHistory[0];
    const second = topicsHistory[1];

    console.log('第一次响应的 topics:');
    first.topics.forEach((topic, index) => {
      console.log(`  ${index + 1}. [${topic.isPrivate ? '私信' : '评论'}] ${topic.title} - 未读: ${topic.unreadCount || 0}`);
    });

    console.log('\n第二次响应的 topics:');
    second.topics.forEach((topic, index) => {
      console.log(`  ${index + 1}. [${topic.isPrivate ? '私信' : '评论'}] ${topic.title} - 未读: ${topic.unreadCount || 0}`);
    });

    // 找出差异
    console.log('\n差异分析:');
    first.topics.forEach((topic1, index) => {
      const topic2 = second.topics.find(t => t.id === topic1.id);
      if (topic2) {
        if (topic1.unreadCount !== topic2.unreadCount) {
          console.log(`  ⚠️  Topic "${topic1.title}" 未读数变化: ${topic1.unreadCount} → ${topic2.unreadCount}`);
        }
        if (topic1.isPrivate !== topic2.isPrivate) {
          console.log(`  ⚠️  Topic "${topic1.title}" isPrivate 变化: ${topic1.isPrivate} → ${topic2.isPrivate}`);
        }
      }
    });
  }
}

socket.on('connect_error', (error) => {
  console.error('❌ 连接失败:', error.message);
  console.log('请确保 Master 服务器正在运行');
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('\n🔌 连接已断开');
});

setTimeout(() => {
  console.log('\n⏱️  20秒超时，关闭连接');
  socket.disconnect();
  process.exit(1);
}, 20000);
