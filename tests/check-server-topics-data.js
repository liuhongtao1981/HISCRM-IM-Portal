/**
 * 检查服务端返回的 topics 数据
 * 连续请求 3 次，看看每次返回的数据是否一致
 */
const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

console.log('=== 检查服务端 Topics 数据一致性 ===\n');

const socket = io(MASTER_URL, {
  transports: ['websocket'],
  reconnection: false
});

let testChannelId = null;
const allResponses = [];

socket.on('connect', () => {
  console.log('✅ 已连接到 Master\n');

  socket.emit('monitor:register', {
    clientId: 'check-client',
    clientType: 'monitor'
  });
});

socket.on('monitor:registered', (data) => {
  console.log('✅ 监控注册成功\n');
});

socket.on('monitor:channels', (data) => {
  const channels = data.channels || [];

  if (channels.length === 0) {
    console.log('❌ 没有找到频道');
    socket.disconnect();
    process.exit(1);
    return;
  }

  testChannelId = channels[0].id;
  console.log(`测试频道: ${channels[0].name} (${testChannelId})\n`);
  console.log('连续请求 3 次 topics，间隔 1 秒...\n');

  // 请求 3 次
  for (let i = 1; i <= 3; i++) {
    setTimeout(() => {
      console.log(`\n[请求 ${i}] 发送 monitor:request_topics`);
      socket.emit('monitor:request_topics', { channelId: testChannelId });
    }, i * 1000);
  }

  // 5 秒后分析结果
  setTimeout(() => {
    analyzeResponses();
    socket.disconnect();
    process.exit(0);
  }, 5000);
});

socket.on('monitor:topics', (data) => {
  const { channelId, topics } = data;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📡 收到响应 #${allResponses.length + 1}`);
  console.log(`   频道ID: ${channelId}`);
  console.log(`   Topics 数量: ${topics.length}`);

  // 统计未读数
  let privateUnread = 0;
  let commentUnread = 0;

  const detailedTopics = [];
  topics.forEach(topic => {
    const unread = topic.unreadCount || 0;
    if (topic.isPrivate) {
      privateUnread += unread;
    } else {
      commentUnread += unread;
    }

    detailedTopics.push({
      id: topic.id,
      title: topic.title,
      isPrivate: topic.isPrivate,
      unreadCount: unread
    });
  });

  console.log(`   📧 私信未读: ${privateUnread}`);
  console.log(`   💬 评论未读: ${commentUnread}`);
  console.log(`   📊 总未读: ${privateUnread + commentUnread}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // 保存响应
  allResponses.push({
    index: allResponses.length + 1,
    timestamp: Date.now(),
    topicsCount: topics.length,
    privateUnread,
    commentUnread,
    totalUnread: privateUnread + commentUnread,
    detailedTopics
  });
});

function analyzeResponses() {
  console.log('\n\n=== 分析结果 ===\n');

  if (allResponses.length === 0) {
    console.log('❌ 没有收到任何响应');
    return;
  }

  console.log(`总共收到 ${allResponses.length} 次响应\n`);

  // 对比每次响应
  console.log('未读数对比：\n');
  allResponses.forEach(resp => {
    console.log(`响应 ${resp.index}: 评论=${resp.commentUnread}, 私信=${resp.privateUnread}, 总计=${resp.totalUnread}, Topics数=${resp.topicsCount}`);
  });

  // 检查一致性
  const uniqueComment = [...new Set(allResponses.map(r => r.commentUnread))];
  const uniquePrivate = [...new Set(allResponses.map(r => r.privateUnread))];
  const uniqueTotal = [...new Set(allResponses.map(r => r.totalUnread))];

  console.log(`\n一致性检查：`);
  console.log(`评论未读数的唯一值: ${JSON.stringify(uniqueComment)} ${uniqueComment.length === 1 ? '✅ 一致' : '❌ 不一致'}`);
  console.log(`私信未读数的唯一值: ${JSON.stringify(uniquePrivate)} ${uniquePrivate.length === 1 ? '✅ 一致' : '❌ 不一致'}`);
  console.log(`总未读数的唯一值: ${JSON.stringify(uniqueTotal)} ${uniqueTotal.length === 1 ? '✅ 一致' : '❌ 不一致'}`);

  // 如果不一致，详细对比
  if (uniqueComment.length > 1 || uniquePrivate.length > 1) {
    console.log('\n\n⚠️  发现不一致！详细对比：\n');

    const first = allResponses[0];
    const second = allResponses[1];

    console.log('第 1 次响应的 Topics:');
    first.detailedTopics.forEach(t => {
      console.log(`  - [${t.isPrivate ? '私信' : '评论'}] ${t.title}: ${t.unreadCount} 条未读`);
    });

    console.log('\n第 2 次响应的 Topics:');
    second.detailedTopics.forEach(t => {
      console.log(`  - [${t.isPrivate ? '私信' : '评论'}] ${t.title}: ${t.unreadCount} 条未读`);
    });

    // 找出差异
    console.log('\n差异分析:');
    first.detailedTopics.forEach(t1 => {
      const t2 = second.detailedTopics.find(t => t.id === t1.id);
      if (t2) {
        if (t1.unreadCount !== t2.unreadCount) {
          console.log(`  ⚠️  "${t1.title}" 未读数变化: ${t1.unreadCount} → ${t2.unreadCount}`);
        }
      } else {
        console.log(`  ⚠️  第 2 次响应缺少 Topic: "${t1.title}"`);
      }
    });

    second.detailedTopics.forEach(t2 => {
      const t1 = first.detailedTopics.find(t => t.id === t2.id);
      if (!t1) {
        console.log(`  ⚠️  第 1 次响应缺少 Topic: "${t2.title}"`);
      }
    });
  } else {
    console.log('\n✅ 服务端数据完全一致，问题在客户端！');
  }
}

socket.on('connect_error', (error) => {
  console.error('❌ 连接失败:', error.message);
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('\n🔌 连接已断开');
});

setTimeout(() => {
  console.log('\n⏱️  10秒超时');
  socket.disconnect();
  process.exit(1);
}, 10000);
