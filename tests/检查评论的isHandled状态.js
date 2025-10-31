const io = require('socket.io-client');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('================================================================================');
console.log('检查评论的 isHandled 状态');
console.log('================================================================================\n');

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  reconnection: false
});

let topicsReceived = false;

socket.on('connect', () => {
  console.log('✅ 已连接到 Master\n');

  socket.emit('register', {
    clientId: 'test_check_handled_' + Date.now(),
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
  if (topicsReceived) return;
  topicsReceived = true;

  const contentTopics = data.topics.filter(t => !t.isPrivate && t.messageCount > 0);

  console.log(`找到 ${contentTopics.length} 个有评论的作品\n`);
  console.log('开始请求每个作品的评论详情...\n');

  let completed = 0;
  const allComments = [];

  contentTopics.forEach((topic, idx) => {
    socket.emit('getMessages', {
      accountId: accountId,
      topicId: topic.id,
      platform: 'douyin'
    });
  });

  socket.on('messageList', (data) => {
    completed++;

    data.messages.forEach(msg => {
      allComments.push({
        topicId: data.topicId || 'unknown',
        messageId: msg.messageId,
        content: msg.content?.substring(0, 30),
        isHandled: msg.isHandled,
        isNew: msg.isNew
      });
    });

    if (completed === contentTopics.length) {
      console.log('================================================================================');
      console.log('所有评论的 isHandled 状态:');
      console.log('================================================================================\n');

      const handled = allComments.filter(c => c.isHandled === true);
      const unhandled = allComments.filter(c => c.isHandled === false || c.isHandled === undefined);

      console.log(`总评论数: ${allComments.length}`);
      console.log(`已处理: ${handled.length}`);
      console.log(`未处理: ${unhandled.length}\n`);

      console.log('详细数据:');
      allComments.forEach((comment, idx) => {
        console.log(`  ${idx + 1}. ${comment.content}...`);
        console.log(`     isHandled: ${comment.isHandled ?? '(未定义)'}`);
        console.log(`     isNew: ${comment.isNew ?? '(未定义)'}`);
        console.log('');
      });

      console.log('================================================================================');
      console.log('✅ 检查完成');
      console.log('================================================================================');

      setTimeout(() => process.exit(0), 1000);
    }
  });
});

socket.on('error', (err) => {
  console.error('❌ 错误:', err);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ 超时');
  process.exit(1);
}, 15000);
