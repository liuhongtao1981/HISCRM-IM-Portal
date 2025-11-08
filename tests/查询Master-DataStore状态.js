/**
 * 查询 Master DataStore 状�? * 检�?DataStore 中是否有数据
 */

const io = require('socket.io-client');

async function checkDataStoreStatus() {
  console.log('========================================');
  console.log('查询 Master DataStore 状�?);
  console.log('========================================\n');

  const socket = io('http://localhost:3000', {
    reconnection: false
  });

  socket.on('connect', () => {
    console.log('�?已连接到 Master IM WebSocket\n');

    // 1. 注册监控客户�?    console.log('1. 注册监控客户�?..');
    socket.emit('monitor:register', {
      clientId: 'test-datastore-checker',
      clientType: 'monitor'
    });
  });

  socket.on('monitor:registered', (data) => {
    console.log('   �?监控客户端注册成�?);
    console.log(`   频道�? ${data.channelCount}\n`);

    // 2. 请求频道列表
    console.log('2. 请求频道列表...');
    socket.emit('monitor:request_channels');
  });

  socket.on('monitor:channels', (data) => {
    console.log(`   �?收到 ${data.channels.length} 个频道\n`);

    if (data.channels.length > 0) {
      const channel = data.channels[0];
      console.log('   频道详情:');
      console.log(`     ID: ${channel.id}`);
      console.log(`     Name: ${channel.name}`);
      console.log(`     未读消息�? ${channel.unreadCount}`);
      console.log(`     总消息数: ${channel.messageCount}`);
      console.log(`     最后消�? ${channel.lastMessage}`);
      console.log(`     最后消息时�? ${new Date(channel.lastMessageTime).toLocaleString()}\n`);

      // 3. 请求主题列表
      console.log('3. 请求主题列表...');
      socket.emit('monitor:request_topics', { channelId: channel.id });
    } else {
      console.log('   �?DataStore 为空，没有频道数�?);
      socket.disconnect();
      process.exit(1);
    }
  });

  socket.on('monitor:topics', (data) => {
    console.log(`   �?收到 ${data.topics.length} 个主题\n`);

    if (data.topics.length > 0) {
      console.log('   �?个主�?');
      data.topics.slice(0, 5).forEach((topic, index) => {
        console.log(`   [${index + 1}] ${topic.title}`);
        console.log(`       ID: ${topic.id}`);
        console.log(`       消息�? ${topic.messageCount}`);
        console.log(`       未读�? ${topic.unreadCount}`);
        console.log(`       创建时间: ${new Date(topic.createdTime).toLocaleString()}`);
        console.log(`       最后消息时�? ${new Date(topic.lastMessageTime).toLocaleString()}`);
      });

      // 4. 请求第一个主题的消息
      const firstTopic = data.topics[0];
      console.log(`\n4. 请求主题 "${firstTopic.title}" 的消�?..`);
      socket.emit('monitor:request_messages', { topicId: firstTopic.id });
    } else {
      console.log('   �?没有主题数据');
      console.log('\n========================================');
      console.log('测试完成 - DataStore 有频道但没有主题');
      console.log('========================================');
      socket.disconnect();
      process.exit(0);
    }
  });

  socket.on('monitor:messages', (data) => {
    console.log(`   �?收到 ${data.messages.length} 条消息\n`);

    if (data.messages.length > 0) {
      console.log('   �?条消�?');
      data.messages.slice(0, 5).forEach((msg, index) => {
        console.log(`   [${index + 1}] ${msg.fromName}: ${msg.content.substring(0, 50)}...`);
        console.log(`       消息ID: ${msg.id}`);
        console.log(`       时间: ${new Date(msg.timestamp).toLocaleString()}`);
      });
    }

    console.log('\n========================================');
    console.log('测试完成 - DataStore 状态正�?);
    console.log('========================================');
    socket.disconnect();
    process.exit(0);
  });

  socket.on('connect_error', (error) => {
    console.error('�?连接错误:', error.message);
    process.exit(1);
  });

  // 超时保护
  setTimeout(() => {
    console.log('\n�?测试超时');
    socket.disconnect();
    process.exit(1);
  }, 15000);
}

// 运行测试
checkDataStoreStatus().catch((error) => {
  console.error('测试失败:', error);
  process.exit(1);
});
