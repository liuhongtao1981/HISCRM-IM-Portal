/**
 * 验证所�?topic 对象都有正确�?isPrivate 字段
 * 确认修复 Tab 未读数跳动问�? */
const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

console.log('=== 验证 Topic isPrivate 字段修复 ===\n');

const socket = io(MASTER_URL, {
  transports: ['websocket'],
  reconnection: false
});

let requestCount = 0;

socket.on('connect', () => {
  console.log('�?已连接到 Master\n');

  // 注册为监控客户端
  socket.emit('monitor:register', {
    clientId: 'verify-client',
    clientType: 'monitor'
  });
});

socket.on('monitor:registered', (data) => {
  console.log('�?监控注册成功');
  console.log(`频道数量: ${data.channelCount}\n`);
});

socket.on('monitor:channels', (data) => {
  const channels = data.channels || [];

  if (channels.length === 0) {
    console.log('�?没有找到频道');
    socket.disconnect();
    process.exit(1);
    return;
  }

  // 选择第一个频道进行测�?  const testChannel = channels[0];
  console.log(`测试频道: ${testChannel.name} (${testChannel.id})\n`);

  // 多次请求 topics（模拟用户反复点击）
  for (let i = 1; i <= 5; i++) {
    setTimeout(() => {
      console.log(`\n=== �?${i} 次请�?topics ===`);
      requestCount = i;
      socket.emit('monitor:request_topics', { channelId: testChannel.id });
    }, i * 1000);
  }
});

socket.on('monitor:topics', (data) => {
  const { channelId, topics } = data;

  console.log(`\n收到 topics (�?${requestCount} 次请�?:`);
  console.log(`- 频道: ${channelId}`);
  console.log(`- Topics 数量: ${topics.length}\n`);

  // 验证所�?topic 都有 isPrivate 字段
  let missingFieldCount = 0;
  let privateCount = 0;
  let commentCount = 0;

  topics.forEach((topic, index) => {
    if (topic.isPrivate === undefined) {
      console.log(`�?Topic ${index + 1} (${topic.id}) 缺少 isPrivate 字段`);
      missingFieldCount++;
    } else {
      if (topic.isPrivate === true) {
        privateCount++;
      } else if (topic.isPrivate === false) {
        commentCount++;
      }
    }
  });

  console.log(`\n字段验证结果:`);
  console.log(`- �?私信 topics (isPrivate = true): ${privateCount}`);
  console.log(`- �?评论 topics (isPrivate = false): ${commentCount}`);
  console.log(`- ${missingFieldCount > 0 ? '�? : '�?} 缺少 isPrivate 字段: ${missingFieldCount}`);

  // 计算未读数（模拟客户端逻辑�?  let privateUnread = 0;
  let commentUnread = 0;

  topics.forEach(topic => {
    if (topic.isPrivate) {
      privateUnread += (topic.unreadCount || 0);
    } else if (!topic.isPrivate) {
      commentUnread += (topic.unreadCount || 0);
    }
  });

  console.log(`\n未读数统�?`);
  console.log(`- 私信未读: ${privateUnread}`);
  console.log(`- 评论未读: ${commentUnread}`);
  console.log(`- 总未�? ${privateUnread + commentUnread}`);

  // 如果是最后一次请求，总结并退�?  if (requestCount === 5) {
    console.log('\n=== 测试完成 ===');

    if (missingFieldCount > 0) {
      console.log('�?修复未生效：仍有 topic 缺少 isPrivate 字段');
      console.log('请检查服务器是否重启');
      socket.disconnect();
      process.exit(1);
    } else {
      console.log('�?修复已生效：所�?topic 都有正确�?isPrivate 字段');
      console.log('�?未读数统计应该保持一�?);
      socket.disconnect();
      process.exit(0);
    }
  }
});

socket.on('connect_error', (error) => {
  console.error('�?连接失败:', error.message);
  console.log('请确�?Master 服务器正在运�?(npm start)');
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('\n🔌 连接已断开');
});

setTimeout(() => {
  console.log('\n⏱️  15秒超时，关闭连接');
  socket.disconnect();
  process.exit(1);
}, 15000);
