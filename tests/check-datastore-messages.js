/**
 * 检查 DataStore 中的消息数据结构
 */

const io = require('socket.io-client');

const socket = io('http://localhost:3000', {
  reconnection: false,
  transports: ['websocket', 'polling']
});

console.log('='.repeat(80));
console.log('检查 DataStore 中的消息数据');
console.log('='.repeat(80));
console.log('');

let channelId = null;

socket.on('connect', () => {
  console.log('✅ WebSocket 连接成功');
  console.log('');
  socket.emit('monitor:register', { clientId: `check_${Date.now()}`, clientType: 'monitor' });
});

socket.on('monitor:channels', (data) => {
  if (data.channels.length > 0) {
    channelId = data.channels[0].id;
    console.log(`频道 ID: ${channelId}`);
    console.log('');
    socket.emit('monitor:request_topics', { channelId });
  }
});

socket.on('monitor:topics', (data) => {
  const { topics } = data;
  const privateTopics = topics.filter(t => t.isPrivate);

  console.log(`总 topics: ${topics.length}`);
  console.log(`私信 topics: ${privateTopics.length}`);
  console.log('');

  if (privateTopics.length > 0) {
    // 取前3个私信主题
    const testTopics = privateTopics.slice(0, 3);

    console.log('测试前3个私信主题:');
    console.log('');

    let completed = 0;
    testTopics.forEach((topic, index) => {
      console.log(`Topic #${index + 1}:`);
      console.log(`  id: ${topic.id}`);
      console.log(`  title: ${topic.title}`);
      console.log(`  messageCount: ${topic.messageCount}`);

      // 请求消息
      socket.emit('monitor:request_messages', { topicId: topic.id });

      socket.once('monitor:messages', (msgData) => {
        if (msgData.topicId === topic.id) {
          console.log(`  实际消息数: ${msgData.messages.length}`);

          if (msgData.messages.length > 0) {
            const msg = msgData.messages[0];
            console.log(`  第一条消息:`);
            console.log(`    id: ${msg.id}`);
            console.log(`    topicId: ${msg.topicId}`);
            console.log(`    content: ${msg.content.substring(0, 30)}...`);
            console.log(`    messageCategory: ${msg.messageCategory}`);
          }
          console.log('');

          completed++;
          if (completed === testTopics.length) {
            socket.disconnect();
            process.exit(0);
          }
        }
      });
    });
  }
});

socket.on('error', (error) => {
  console.error('❌ 错误:', error.message);
  socket.disconnect();
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ 超时');
  socket.disconnect();
  process.exit(1);
}, 10000);
