/**
 * 测试主题列表 - 触发调试日志
 */

const io = require('socket.io-client');

console.log('连接�?Master...');

const socket = io('ws://localhost:3000', {
  reconnection: false,
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log(`�?连接成功! Socket ID: ${socket.id}\n`);

  // 注册监控客户�?  const clientId = `debug_test_${Date.now()}`;
  console.log(`发送注册请�? ${clientId}...`);
  socket.emit('monitor:register', {
    clientType: 'monitor',
    clientId: clientId
  });
});

socket.on('monitor:registered', (data) => {
  console.log(`�?注册确认:`, data);
});

socket.on('monitor:channels', (data) => {
  console.log(`�?收到频道列表: ${data.channels.length} 个频道`);

  if (data.channels.length > 0) {
    const firstChannel = data.channels[0];
    console.log(`\n📝 第一个频�?`, {
      id: firstChannel.id,
      name: firstChannel.name,
      messageCount: firstChannel.messageCount
    });

    // 请求该频道的主题列表 (会触发调试日�?
    console.log(`\n🔍 请求频道 "${firstChannel.id}" 的主题列�?..`);
    socket.emit('monitor:request_topics', { channelId: firstChannel.id });
  }
});

socket.on('monitor:topics', (data) => {
  console.log(`\n�?收到主题列表: ${data.topics.length} 个主题`);

  if (data.topics.length > 0) {
    console.log('\n主题详情 (�?3 �?:');
    data.topics.slice(0, 3).forEach((topic, i) => {
      console.log(`  [${i + 1}] ${topic.title} (${topic.id})`);
      console.log(`      - 未读: ${topic.unreadCount}, 消息�? ${topic.messageCount}`);
    });
  } else {
    console.log('⚠️ 主题列表为空!');
    console.log('\n请检�?Master 日志中的 [DEBUG] 输出');
  }

  // 完成测试
  setTimeout(() => {
    console.log('\n测试完成，断开连接');
    socket.disconnect();
    process.exit(0);
  }, 2000);
});

socket.on('connect_error', (error) => {
  console.log(`�?连接错误: ${error.message}`);
  process.exit(1);
});

setTimeout(() => {
  console.log('⏱️ 超时 (10�?');
  socket.disconnect();
  process.exit(1);
}, 10000);
