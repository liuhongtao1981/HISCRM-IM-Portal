/**
 * 直接检查评论的 isHandled 状态
 * 使用 IM WebSocket 协议
 */

const io = require('socket.io-client');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('================================================================================');
console.log('🔍 直接检查评论的 isHandled 状态');
console.log('================================================================================\n');

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  reconnection: false
});

let topicsReceived = false;

socket.on('connect', () => {
  console.log('✅ 已连接到 Master\n');

  // 使用 IM 协议的 monitor:register 事件
  socket.emit('monitor:register', {
    clientId: 'test-check-ishandled-' + Date.now(),
    channels: [accountId]
  });
});

socket.on('monitor:registered', (data) => {
  console.log('✅ Monitor 注册成功\n');
  console.log(`客户端ID: ${data.clientId}\n`);

  // 请求频道列表
  socket.emit('monitor:getChannels', {});
});

socket.on('monitor:channels', (data) => {
  console.log(`📊 收到 ${data.channels.length} 个频道\n`);

  // 请求主题列表
  socket.emit('monitor:getTopics', {
    channelId: accountId
  });
});

socket.on('monitor:topics', (data) => {
  if (topicsReceived) return;
  topicsReceived = true;

  console.log(`📊 收到 ${data.topics.length} 个主题\n`);

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

  if (topicsWithMessages.length === 0) {
    console.log('❌ 没有找到有评论的作品！\n');
    setTimeout(() => process.exit(1), 1000);
    return;
  }

  console.log('有评论的作品详情:\n');
  topicsWithMessages.forEach((topic, idx) => {
    console.log(`  ${idx + 1}. ${topic.title || '(无标题)'}`);
    console.log(`     topicId: ${topic.id}`);
    console.log(`     评论数: ${topic.messageCount}`);
    console.log(`     未读数: ${topic.unreadCount}`);
    console.log('');
  });

  // 请求每个作品的评论详情
  console.log('开始请求每个作品的评论详情...\n');

  let completed = 0;
  const allComments = [];

  topicsWithMessages.forEach((topic) => {
    socket.emit('monitor:getMessages', {
      topicId: topic.id
    });
  });

  socket.on('monitor:messages', (data) => {
    completed++;

    console.log(`📬 收到主题 ${data.topicId} 的 ${data.messages.length} 条评论\n`);

    data.messages.forEach(msg => {
      allComments.push({
        topicId: data.topicId,
        messageId: msg.messageId,
        content: msg.content?.substring(0, 30) || '(无内容)',
        isHandled: msg.isHandled,
        isNew: msg.isNew,
        createdAt: msg.createdAt
      });
    });

    if (completed === topicsWithMessages.length) {
      console.log('================================================================================');
      console.log('所有评论的 isHandled 状态统计:');
      console.log('================================================================================\n');

      const handled = allComments.filter(c => c.isHandled === true);
      const unhandled = allComments.filter(c => c.isHandled === false || c.isHandled === undefined);

      console.log(`总评论数: ${allComments.length}`);
      console.log(`已处理 (isHandled === true): ${handled.length}`);
      console.log(`未处理 (isHandled === false 或 undefined): ${unhandled.length}\n`);

      console.log('详细数据:\n');
      allComments.forEach((comment, idx) => {
        console.log(`  ${idx + 1}. ${comment.content}...`);
        console.log(`     topicId: ${comment.topicId}`);
        console.log(`     isHandled: ${comment.isHandled ?? '(未定义)'}`);
        console.log(`     isNew: ${comment.isNew ?? '(未定义)'}`);
        console.log(`     createdAt: ${new Date(comment.createdAt).toLocaleString('zh-CN')}`);
        console.log('');
      });

      // 分析为什么只显示 2 个作品
      console.log('================================================================================');
      console.log('📊 按 topicId 分组的 isHandled 统计:');
      console.log('================================================================================\n');

      const groupedByTopic = {};
      allComments.forEach(c => {
        if (!groupedByTopic[c.topicId]) {
          groupedByTopic[c.topicId] = { total: 0, handled: 0, unhandled: 0 };
        }
        groupedByTopic[c.topicId].total++;
        if (c.isHandled === true) {
          groupedByTopic[c.topicId].handled++;
        } else {
          groupedByTopic[c.topicId].unhandled++;
        }
      });

      const topicsMap = {};
      topicsWithMessages.forEach(t => {
        topicsMap[t.id] = t.title;
      });

      Object.entries(groupedByTopic).forEach(([topicId, stats]) => {
        const title = topicsMap[topicId] || '(未知标题)';
        console.log(`作品: ${title}`);
        console.log(`  topicId: ${topicId}`);
        console.log(`  总评论: ${stats.total}`);
        console.log(`  已处理: ${stats.handled}`);
        console.log(`  未处理: ${stats.unhandled}`);
        console.log(`  ${stats.unhandled > 0 ? '✅' : '❌'} 会在 PC IM 中显示（需要 unhandled > 0）`);
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

socket.on('connect_error', (err) => {
  console.error('❌ 连接错误:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ 超时');
  process.exit(1);
}, 20000);
