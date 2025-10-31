/**
 * 检查有评论的主题数据
 */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

console.log('='.repeat(80));
console.log('检查有评论的主题数据');
console.log('='.repeat(80));

const socket = io(MASTER_URL, {
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('\n✅ 已连接到 Master');
  socket.emit('monitor:register', {
    clientType: 'monitor',
    clientId: `test_${Date.now()}`
  });
});

socket.on('monitor:registered', () => {
  console.log('✅ 注册成功');
  socket.emit('monitor:request_channels');
});

socket.on('monitor:channels', (data) => {
  if (data.channels && data.channels.length > 0) {
    const channelId = data.channels[0].id;
    socket.emit('monitor:request_topics', { channelId });
  }
});

socket.on('monitor:topics', (data) => {
  console.log('\n📋 查找有消息的主题...\n');

  if (data.topics && data.topics.length > 0) {
    // 找到所有有消息的主题
    const topicsWithMessages = data.topics.filter(t => t.messageCount > 0);

    console.log(`有消息的主题: ${topicsWithMessages.length} 个\n`);

    topicsWithMessages.forEach((topic, index) => {
      console.log(`主题 ${index + 1}:`);
      console.log(`  ID: ${topic.id}`);
      console.log(`  标题: ${topic.title}`);
      console.log(`  消息数: ${topic.messageCount}`);
      console.log(`  isPrivate: ${topic.isPrivate || false}`);
      console.log('');
    });

    if (topicsWithMessages.length > 0) {
      // 请求第一个有消息的主题
      const topic = topicsWithMessages[0];
      console.log(`\n📡 请求主题 "${topic.title}" 的消息...`);
      socket.emit('monitor:request_messages', {
        channelId: topic.channelId,
        topicId: topic.id
      });
    } else {
      console.log('\n⚠️  所有主题都没有消息');
      process.exit(0);
    }
  }
});

socket.on('monitor:messages', (data) => {
  console.log(`\n💬 收到 ${data.messages?.length || 0} 条消息\n`);

  if (data.messages && data.messages.length > 0) {
    data.messages.forEach((msg, index) => {
      console.log(`消息 ${index + 1}:`);
      console.log(`  发送者: ${msg.fromName}`);
      console.log(`  内容: ${msg.content}`);
      console.log(`  类型: ${msg.type}`);
      console.log(`  分类: ${msg.messageCategory || '未设置'} ✅`);
      console.log(`  已处理: ${msg.isHandled !== undefined ? msg.isHandled : '未设置'} ✅`);
      console.log(`  方向: ${msg.direction}`);
      console.log(`  时间: ${new Date(msg.timestamp).toLocaleString('zh-CN')}`);
      console.log('');
    });
  }

  console.log('='.repeat(80));
  console.log('检查完成');
  console.log('='.repeat(80));
  process.exit(0);
});

socket.on('error', (error) => {
  console.error('❌ 错误:', error);
  process.exit(1);
});

setTimeout(() => {
  console.log('\n⏱️  超时');
  process.exit(1);
}, 10000);
