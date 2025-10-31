const io = require('socket.io-client');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  reconnection: false
});

socket.on('connect', () => {
  console.log('✅ 已连接到 Master');

  socket.emit('register', {
    clientId: 'test-client-check-comments',
    clientType: 'crm-pc'
  });
});

socket.on('registerSuccess', (data) => {
  console.log('✅ 注册成功');

  // 请求作品评论主题列表
  socket.emit('getTopics', {
    accountId: accountId,
    platform: 'douyin',
    messageCategory: 'comment'  // 作品评论
  });
});

socket.on('topicList', (data) => {
  console.log('\n================================================================================');
  console.log('📋 作品评论主题列表');
  console.log('================================================================================');
  console.log('总主题数:', data.topics.length);

  const topicsWithMessages = data.topics.filter(t => t.unreadCount > 0 || t.lastMessage);
  console.log('有消息的主题数:', topicsWithMessages.length);

  console.log('\n主题详情:');
  data.topics.forEach((topic, idx) => {
    console.log(`\n主题 ${idx + 1}:`);
    console.log('  topicId:', topic.topicId);
    console.log('  title:', topic.title);
    console.log('  unreadCount:', topic.unreadCount);
    console.log('  lastMessage:', topic.lastMessage ? '有' : '无');
    if (topic.lastMessage) {
      console.log('  lastMessage内容:', topic.lastMessage.content?.substring(0, 50));
      console.log('  lastMessage时间:', topic.lastMessage.createdAt);
    }
  });

  setTimeout(() => process.exit(0), 1000);
});

socket.on('error', (err) => {
  console.error('❌ Socket错误:', err);
});

socket.on('connect_error', (err) => {
  console.error('❌ 连接错误:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ 超时');
  process.exit(1);
}, 10000);
