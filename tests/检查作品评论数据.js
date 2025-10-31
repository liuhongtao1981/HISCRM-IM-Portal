const io = require('socket.io-client');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('================================================================================');
console.log('检查作品评论数据');
console.log('================================================================================\n');

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  reconnection: false
});

socket.on('connect', () => {
  console.log('✅ 已连接到 Master\n');

  socket.emit('register', {
    clientId: 'test_check_comments_' + Date.now(),
    clientType: 'monitor',
    channels: [accountId]
  });
});

socket.on('registerSuccess', () => {
  console.log('✅ 注册成功\n');

  socket.emit('getTopics', {
    accountId: accountId,
    platform: 'douyin'
  });
});

socket.on('topicList', (data) => {
  console.log(`📊 收到主题列表: ${data.topics.length} 个\n`);

  // 分离作品和私信
  const contentTopics = data.topics.filter(t => !t.isPrivate);
  const privateTopics = data.topics.filter(t => t.isPrivate);

  console.log(`作品主题: ${contentTopics.length}`);
  console.log(`私信主题: ${privateTopics.length}\n`);

  // 统计有评论的作品
  const topicsWithMessages = contentTopics.filter(t => t.messageCount > 0);
  const topicsWithUnread = contentTopics.filter(t => t.unreadCount > 0);

  console.log('================================================================================');
  console.log('📋 作品评论统计');
  console.log('================================================================================');
  console.log(`有评论的作品: ${topicsWithMessages.length} / ${contentTopics.length}`);
  console.log(`有未读评论的作品: ${topicsWithUnread.length} / ${contentTopics.length}\n`);

  if (topicsWithMessages.length > 0) {
    console.log('有评论的作品详情:\n');
    topicsWithMessages.forEach((topic, idx) => {
      console.log(`  ${idx + 1}. ${topic.title || '(无标题)'}`);
      console.log(`     contentId: ${topic.id}`);
      console.log(`     评论数: ${topic.messageCount}`);
      console.log(`     未读数: ${topic.unreadCount}`);
      console.log('');
    });
  } else {
    console.log('❌ 没有找到有评论的作品！\n');
  }

  console.log('================================================================================');
  console.log('✅ 检查完成');
  console.log('================================================================================');

  setTimeout(() => process.exit(0), 1000);
});

socket.on('error', (err) => {
  console.error('❌ 错误:', err);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ 超时');
  process.exit(1);
}, 10000);
