/**
 * 检查作品的 unreadCount 计算
 */

const io = require('socket.io-client');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('================================================================================');
console.log('🔍 检查作品的 unreadCount 计算');
console.log('================================================================================\n');

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  reconnection: false
});

let topicsReceived = false;

socket.on('connect', () => {
  console.log('✅ 已连接到 Master\n');

  socket.emit('monitor:register', {
    clientId: 'test-unread-count-' + Date.now(),
    channels: [accountId]
  });
});

socket.on('monitor:registered', (data) => {
  console.log('✅ Monitor 注册成功\n');

  socket.emit('monitor:request_topics', {
    channelId: accountId
  });
});

socket.on('monitor:topics', (data) => {
  if (topicsReceived) return;
  topicsReceived = true;

  console.log(`📊 收到 ${data.topics.length} 个主题\n`);

  const contentTopics = data.topics.filter(t => !t.isPrivate);
  const privateTopics = data.topics.filter(t => t.isPrivate);

  console.log(`作品主题: ${contentTopics.length}`);
  console.log(`私信主题: ${privateTopics.length}\n`);

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

  console.log('================================================================================');
  console.log('📊 有评论的作品详情');
  console.log('================================================================================\n');

  topicsWithMessages.forEach((topic, idx) => {
    console.log(`作品 ${idx + 1}: ${topic.title || '(无标题)'}`);
    console.log(`  topicId: ${topic.id}`);
    console.log(`  messageCount: ${topic.messageCount}`);
    console.log(`  unreadCount: ${topic.unreadCount}`);
    console.log(`  ${topic.unreadCount > 0 ? '✅' : '❌'} 在 PC IM 中显示 (需要 unreadCount > 0)`);
    console.log('');
  });

  console.log('================================================================================');
  console.log('问题分析:');
  console.log('================================================================================');
  console.log(`Master 返回 ${topicsWithMessages.length} 个有评论的作品`);
  console.log(`其中有未读的作品 (unreadCount > 0): ${topicsWithUnread.length}`);
  console.log(`\nPC IM 的 unreadCommentsByTopic 只显示 unreadCount > 0 的作品`);
  console.log(`所以 PC IM 应该显示 ${topicsWithUnread.length} 个作品\n`);

  console.log('✅ 检查完成\n');
  setTimeout(() => process.exit(0), 1000);
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
}, 15000);
