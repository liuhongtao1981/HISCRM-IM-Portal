/**
 * 模拟用户快速多次点击同一个账�? * 检查服务器返回�?topics 是否一�? */
const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

console.log('=== 模拟快速点击账�?===\n');

const socket = io(MASTER_URL, {
  transports: ['websocket'],
  reconnection: false
});

let testChannelId = null;
const responses = [];

socket.on('connect', () => {
  console.log('�?已连接到 Master\n');

  socket.emit('monitor:register', {
    clientId: 'simulate-client',
    clientType: 'monitor'
  });
});

socket.on('monitor:registered', (data) => {
  console.log('�?监控注册成功\n');
});

socket.on('monitor:channels', (data) => {
  const channels = data.channels || [];

  if (channels.length === 0) {
    console.log('�?没有找到频道');
    socket.disconnect();
    process.exit(1);
    return;
  }

  testChannelId = channels[0].id;
  console.log(`测试频道: ${channels[0].name} (${testChannelId})\n`);
  console.log('模拟用户快速点�?5 次，间隔 100ms...\n');

  // 模拟用户快速点�?5 �?  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      console.log(`[${i + 1}] 点击账户 �?emit('monitor:request_topics')`);
      socket.emit('monitor:request_topics', { channelId: testChannelId });
    }, i * 100);  // �?100ms 点击一�?  }

  // 3秒后分析结果
  setTimeout(() => {
    analyzeResponses();
    socket.disconnect();
    process.exit(0);
  }, 4000);
});

socket.on('monitor:topics', (data) => {
  const { channelId, topics } = data;

  // 计算未读�?  let commentUnread = 0;
  let privateUnread = 0;

  topics.forEach(topic => {
    if (topic.isPrivate) {
      privateUnread += (topic.unreadCount || 0);
    } else {
      commentUnread += (topic.unreadCount || 0);
    }
  });

  const response = {
    receivedAt: Date.now(),
    topicsCount: topics.length,
    commentUnread,
    privateUnread,
    totalUnread: commentUnread + privateUnread
  };

  responses.push(response);

  console.log(`  �?收到响应 #${responses.length}: 评论=${commentUnread}, 私信=${privateUnread}, 总计=${response.totalUnread}`);
});

function analyzeResponses() {
  console.log('\n=== 分析结果 ===\n');

  if (responses.length === 0) {
    console.log('�?没有收到任何响应');
    return;
  }

  console.log(`总共收到 ${responses.length} 次响应\n`);

  // 检查未读数是否一�?  const uniqueComments = [...new Set(responses.map(r => r.commentUnread))];
  const uniquePrivates = [...new Set(responses.map(r => r.privateUnread))];

  console.log(`评论未读数的唯一�? ${JSON.stringify(uniqueComments)}`);
  console.log(`私信未读数的唯一�? ${JSON.stringify(uniquePrivates)}`);

  if (uniqueComments.length > 1) {
    console.log(`\n⚠️  评论未读数在跳动！有 ${uniqueComments.length} 个不同的值`);
    console.log(`详细序列: ${responses.map(r => r.commentUnread).join(' �?')}`);
  } else {
    console.log(`\n�?评论未读数稳�?(${uniqueComments[0]})`);
  }

  if (uniquePrivates.length > 1) {
    console.log(`\n⚠️  私信未读数在跳动！有 ${uniquePrivates.length} 个不同的值`);
    console.log(`详细序列: ${responses.map(r => r.privateUnread).join(' �?')}`);
  } else {
    console.log(`\n�?私信未读数稳�?(${uniquePrivates[0]})`);
  }

  // 检查响应时�?  if (responses.length > 1) {
    console.log('\n响应时间分析:');
    for (let i = 1; i < responses.length; i++) {
      const timeDiff = responses[i].receivedAt - responses[i - 1].receivedAt;
      console.log(`  响应 #${i} �?#${i + 1}: ${timeDiff}ms`);
    }
  }
}

socket.on('connect_error', (error) => {
  console.error('�?连接失败:', error.message);
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('\n🔌 连接已断开');
});

setTimeout(() => {
  console.log('\n⏱️  10秒超�?);
  socket.disconnect();
  process.exit(1);
}, 10000);
