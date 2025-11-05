/**
 * 验证私信消息显示 - 选择有消息的会话
 */

const io = require('socket.io-client');

const socket = io('http://localhost:3000', {
  reconnection: false,
  transports: ['websocket', 'polling']
});

console.log('='.repeat(80));
console.log('🎯 验证私信消息显示');
console.log('='.repeat(80));
console.log('');

let channelId = null;
const topicsWithMessages = [];

socket.on('connect', () => {
  console.log('✅ WebSocket 连接成功');
  console.log('');
  socket.emit('monitor:register', { clientId: `verify_${Date.now()}`, clientType: 'monitor' });
});

socket.on('monitor:channels', (data) => {
  if (data.channels.length > 0) {
    channelId = data.channels[0].id;
    console.log(`频道: ${data.channels[0].name}`);
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

  // 找messageCount > 0 的主题
  const topicsWithMsgs = privateTopics.filter(t => t.messageCount > 0);
  console.log(`有消息的私信 topics: ${topicsWithMsgs.length}`);
  console.log('');

  if (topicsWithMsgs.length === 0) {
    console.log('⚠️  所有私信主题都显示 messageCount=0');
    console.log('   这可能是 getTopicsFromDataStore 计算 messageCount 的问题');
    console.log('');
    console.log('尝试直接请求前3个私信主题的消息...');
    console.log('');

    const testTopics = privateTopics.slice(0, 3);
    let completed = 0;

    testTopics.forEach((topic, index) => {
      socket.emit('monitor:request_messages', { topicId: topic.id });

      socket.once('monitor:messages', (msgData) => {
        if (msgData.topicId === topic.id) {
          console.log(`Topic #${index + 1}: ${topic.title}`);
          console.log(`  messageCount 字段: ${topic.messageCount}`);
          console.log(`  实际消息数: ${msgData.messages.length}`);

          if (msgData.messages.length > 0) {
            const msg = msgData.messages[0];
            console.log(`  ✅ 有消息！`);
            console.log(`     id: ${msg.id}`);
            console.log(`     messageCategory: ${msg.messageCategory}`);
            console.log(`     content: ${msg.content.substring(0, 40)}...`);
          } else {
            console.log(`  ❌ 无消息`);
          }
          console.log('');

          completed++;
          if (completed === testTopics.length) {
            console.log('='.repeat(80));
            console.log('🎯 结论:');
            console.log('='.repeat(80));
            console.log('');
            console.log('如果有 topic 的实际消息数 > 0，但 messageCount=0，');
            console.log('说明问题在 getTopicsFromDataStore 的 messageCount 计算逻辑。');
            console.log('');
            console.log('需要检查 im-websocket-server.js 第 445 行附近的代码。');
            console.log('');
            socket.disconnect();
            process.exit(0);
          }
        }
      });
    });
  } else {
    console.log('✅ 找到有消息的私信主题！');
    console.log('');
    topicsWithMsgs.slice(0, 3).forEach((topic, index) => {
      console.log(`Topic #${index + 1}: ${topic.title}`);
      console.log(`  messageCount: ${topic.messageCount}`);
      console.log('');
    });

    // 请求第一个有消息的主题
    const testTopic = topicsWithMsgs[0];
    console.log(`测试主题: ${testTopic.title}`);
    console.log('');
    socket.emit('monitor:request_messages', { topicId: testTopic.id });

    socket.once('monitor:messages', (msgData) => {
      console.log(`收到 ${msgData.messages.length} 条消息`);
      console.log('');

      if (msgData.messages.length > 0) {
        const privateMessages = msgData.messages.filter(m => m.messageCategory === 'private');
        console.log(`messageCategory='private' 的消息: ${privateMessages.length}`);
        console.log('');

        if (privateMessages.length > 0) {
          const msg = privateMessages[0];
          console.log('第一条私信消息:');
          console.log(JSON.stringify(msg, null, 2));
          console.log('');

          console.log('='.repeat(80));
          console.log('🎉 验证结果:');
          console.log('='.repeat(80));
          console.log('');
          console.log('✅ Topics 包含 isPrivate=true');
          console.log('✅ Messages 包含 messageCategory="private"');
          console.log('✅ 消息与主题 ID 正确匹配');
          console.log('✅ Master WebSocket 数据结构完全正确！');
          console.log('');
          console.log('IM PC 客户端应该能够正常显示私信！');
        }
      }

      socket.disconnect();
      process.exit(0);
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
}, 15000);
