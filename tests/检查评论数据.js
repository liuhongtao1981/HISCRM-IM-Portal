/**
 * 检查 Master DataStore 中的评论数据
 */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';
const ACCOUNT_ID = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('='.repeat(80));
console.log('检查评论数据工具');
console.log('='.repeat(80));

// 连接到 Master IM WebSocket
const socket = io(MASTER_URL, {
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('\n✅ 已连接到 Master IM WebSocket Server');
  console.log(`Socket ID: ${socket.id}`);

  // 注册为监控客户端
  console.log('\n📝 注册为监控客户端...');
  socket.emit('monitor:register', {
    clientType: 'monitor',
    clientId: `test_${Date.now()}`
  });
});

socket.on('monitor:registered', (data) => {
  console.log('✅ 注册成功:', data);

  // 请求频道列表
  console.log('\n📡 请求频道列表...');
  socket.emit('monitor:request_channels');
});

socket.on('monitor:channels', (data) => {
  console.log('\n📊 频道列表:');
  console.log(`总数: ${data.channels?.length || 0} 个频道`);

  if (data.channels && data.channels.length > 0) {
    data.channels.forEach((channel, index) => {
      console.log(`\n频道 ${index + 1}:`);
      console.log(`  ID: ${channel.id}`);
      console.log(`  名称: ${channel.name}`);
      console.log(`  未读: ${channel.unreadCount || 0}`);
    });

    // 请求第一个频道的主题
    const channelId = data.channels[0].id;
    console.log(`\n📡 请求频道 ${channelId} 的主题列表...`);
    socket.emit('monitor:request_topics', { channelId });
  } else {
    console.log('\n⚠️  没有找到频道数据');
    process.exit(0);
  }
});

socket.on('monitor:topics', (data) => {
  console.log('\n📋 主题列表:');
  console.log(`总数: ${data.topics?.length || 0} 个主题`);

  if (data.topics && data.topics.length > 0) {
    data.topics.forEach((topic, index) => {
      console.log(`\n主题 ${index + 1}:`);
      console.log(`  ID: ${topic.id}`);
      console.log(`  标题: ${topic.title}`);
      console.log(`  描述: ${topic.description || '无'}`);
      console.log(`  消息数: ${topic.messageCount || 0}`);
      console.log(`  未读数: ${topic.unreadCount || 0}`);
      console.log(`  isPrivate: ${topic.isPrivate || false}`);
    });

    // 请求第一个主题的消息
    const topicId = data.topics[0].id;
    const channelId = data.topics[0].channelId;
    console.log(`\n📡 请求主题 ${topicId} 的消息列表...`);
    socket.emit('monitor:request_messages', { channelId, topicId });
  } else {
    console.log('\n⚠️  没有找到主题数据');
    console.log('\n可能原因:');
    console.log('1. Worker 还没有同步数据到 Master');
    console.log('2. 账户还没有登录');
    console.log('3. 还没有爬取到评论数据');
    process.exit(0);
  }
});

socket.on('monitor:messages', (data) => {
  console.log('\n💬 消息列表:');
  console.log(`总数: ${data.messages?.length || 0} 条消息`);

  if (data.messages && data.messages.length > 0) {
    data.messages.forEach((msg, index) => {
      console.log(`\n消息 ${index + 1}:`);
      console.log(`  ID: ${msg.id}`);
      console.log(`  发送者: ${msg.fromName}`);
      console.log(`  内容: ${msg.content}`);
      console.log(`  类型: ${msg.type}`);
      console.log(`  分类: ${msg.messageCategory || '未设置'}`);
      console.log(`  已处理: ${msg.isHandled || false}`);
      console.log(`  方向: ${msg.direction || '未知'}`);
      console.log(`  时间: ${new Date(msg.timestamp).toLocaleString('zh-CN')}`);
    });
  } else {
    console.log('\n⚠️  主题中没有消息数据');
    console.log('\n可能原因:');
    console.log('1. 这个作品还没有评论');
    console.log('2. Worker 还没有爬取到评论');
    console.log('3. 数据还没有同步到 DataStore');
  }

  console.log('\n' + '='.repeat(80));
  console.log('检查完成');
  console.log('='.repeat(80));
  process.exit(0);
});

socket.on('disconnect', () => {
  console.log('\n❌ 连接已断开');
});

socket.on('error', (error) => {
  console.error('\n❌ 连接错误:', error);
  process.exit(1);
});

// 10 秒超时
setTimeout(() => {
  console.log('\n⏱️  超时 - 10秒内没有收到响应');
  process.exit(1);
}, 10000);
