/**
 * 检�?Master WebSocket 发送的数据结构
 * 验证 topics �?messages 是否包含正确的字�? */

const io = require('socket.io-client');

const socket = io('http://localhost:3000', {
  reconnection: true,
  transports: ['websocket', 'polling']
});

let receivedChannels = null;
let receivedTopics = null;
let receivedMessages = null;

console.log('�?.repeat(80));
console.log('🔍 WebSocket 数据结构验证');
console.log('�?.repeat(80));
console.log('');

socket.on('connect', () => {
  console.log('�?已连接到 Master WebSocket');
  console.log('');

  // 注册为监控客户端
  socket.emit('monitor:register', {
    clientId: `test_${Date.now()}`,
    clientType: 'monitor'
  });
});

socket.on('monitor:registered', (data) => {
  console.log('�?注册成功:', data);
  console.log('');
});

socket.on('monitor:channels', (data) => {
  console.log('📡 收到 channels:', data.channels.length, '�?);
  receivedChannels = data.channels;

  if (receivedChannels.length > 0) {
    const channel = receivedChannels[0];
    console.log('');
    console.log('�?.repeat(80));
    console.log('📋 第一�?Channel 数据结构:');
    console.log('�?.repeat(80));
    console.log(JSON.stringify(channel, null, 2));

    // 请求该频道的 topics
    console.log('');
    console.log('📤 请求 topics...');
    socket.emit('monitor:request_topics', { channelId: channel.id });
  }
});

socket.on('monitor:topics', (data) => {
  console.log('');
  console.log('📡 收到 topics:', data.topics.length, '�?);
  receivedTopics = data.topics;

  if (receivedTopics.length > 0) {
    console.log('');
    console.log('�?.repeat(80));
    console.log('📋 Topics 数据分析:');
    console.log('�?.repeat(80));
    console.log('');

    // 统计�?isPrivate 字段�?topic
    const privateTopics = receivedTopics.filter(t => t.isPrivate === true);
    const contentTopics = receivedTopics.filter(t => !t.isPrivate);

    console.log(`�?�?topics: ${receivedTopics.length}`);
    console.log(`  - 私信主题 (isPrivate=true): ${privateTopics.length}`);
    console.log(`  - 作品主题 (�?isPrivate): ${contentTopics.length}`);
    console.log('');

    // 打印第一个私信主题的完整结构
    if (privateTopics.length > 0) {
      console.log('�?.repeat(80));
      console.log('📋 第一个私信主�?(isPrivate=true) 的完整结�?');
      console.log('�?.repeat(80));
      console.log(JSON.stringify(privateTopics[0], null, 2));
      console.log('');

      // 请求该主题的消息
      console.log('📤 请求该私信主题的 messages...');
      socket.emit('monitor:request_messages', { topicId: privateTopics[0].id });
    } else {
      console.log('⚠️ 没有找到私信主题 (isPrivate=true)');
      // 打印第一个作品主�?      if (contentTopics.length > 0) {
        console.log('');
        console.log('�?.repeat(80));
        console.log('📋 第一个作品主题的完整结构:');
        console.log('�?.repeat(80));
        console.log(JSON.stringify(contentTopics[0], null, 2));
      }
    }
  }
});

socket.on('monitor:messages', (data) => {
  console.log('');
  console.log('📡 收到 messages:', data.messages.length, '�?);
  receivedMessages = data.messages;

  if (receivedMessages.length > 0) {
    console.log('');
    console.log('�?.repeat(80));
    console.log('📋 Messages 数据分析:');
    console.log('�?.repeat(80));
    console.log('');

    // 统计�?messageCategory 字段的消�?    const privateMessages = receivedMessages.filter(m => m.messageCategory === 'private');
    const commentMessages = receivedMessages.filter(m => m.messageCategory === 'comment');
    const unknownMessages = receivedMessages.filter(m => !m.messageCategory);

    console.log(`�?总消�? ${receivedMessages.length}`);
    console.log(`  - messageCategory='private': ${privateMessages.length}`);
    console.log(`  - messageCategory='comment': ${commentMessages.length}`);
    console.log(`  - �?messageCategory 字段: ${unknownMessages.length}`);
    console.log('');

    // 打印第一条消息的完整结构
    if (privateMessages.length > 0) {
      console.log('�?.repeat(80));
      console.log('📋 第一条私信消�?(messageCategory=private) 的完整结�?');
      console.log('�?.repeat(80));
      console.log(JSON.stringify(privateMessages[0], null, 2));
    } else if (receivedMessages.length > 0) {
      console.log('�?.repeat(80));
      console.log('📋 第一条消息的完整结构:');
      console.log('�?.repeat(80));
      console.log(JSON.stringify(receivedMessages[0], null, 2));
    }

    console.log('');
    console.log('�?.repeat(80));
    console.log('🎯 结论:');
    console.log('�?.repeat(80));
    console.log('');

    if (privateMessages.length > 0) {
      console.log('�?私信消息包含 messageCategory="private" 字段');
    } else {
      console.log('�?私信消息缺少 messageCategory="private" 字段');
      console.log('   这会导致客户端无法识别私信消�?);
    }

    // 退�?    setTimeout(() => {
      socket.disconnect();
      process.exit(0);
    }, 1000);
  }
});

socket.on('error', (error) => {
  console.error('�?WebSocket 错误:', error);
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('');
  console.log('🔌 已断开连接');
});

// 5 秒超�?setTimeout(() => {
  console.error('');
  console.error('�?超时: 5秒内未收到完整数�?);
  socket.disconnect();
  process.exit(1);
}, 5000);
