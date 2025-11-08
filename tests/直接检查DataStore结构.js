/**
 * 直接通过 WebSocket 检�?DataStore �?accountData 的结�? */

const io = require('socket.io-client');

console.log('==================================================');
console.log('直接检�?DataStore 结构');
console.log('==================================================\n');

async function inspectDataStore() {
  return new Promise((resolve) => {
    const socket = io('ws://localhost:3000', {
      reconnection: false,
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log(`�?连接成功: ${socket.id}\n`);

      // 注册
      socket.emit('monitor:register', {
        clientType: 'monitor',
        clientId: `test_${Date.now()}`
      });
    });

    socket.on('monitor:registered', (data) => {
      console.log('�?注册确认:', data);
      console.log(`\n收到 ${data.channelCount} 个频道\n`);
    });

    socket.on('monitor:channels', (data) => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('频道数据 (channels):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      data.channels.forEach((ch, i) => {
        console.log(`[${i + 1}] 频道 ID: ${ch.id}`);
        console.log(`    名称: ${ch.name}`);
        console.log(`    未读�? ${ch.unreadCount}`);
        console.log(`    消息�? ${ch.messageCount}`);
        console.log(`    最后消�? ${ch.lastMessage || '�?}`);
        console.log('');
      });

      if (data.channels.length > 0) {
        const firstChannel = data.channels[0];
        console.log(`\n正在请求频道 "${firstChannel.id}" 的主�?..\n`);
        socket.emit('monitor:request_topics', { channelId: firstChannel.id });
      }
    });

    socket.on('monitor:topics', (data) => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`主题数据 (topics) for ${data.channelId}:`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      if (data.topics.length === 0) {
        console.log('�?主题列表为空！\n');
        console.log('分析:');
        console.log('  accountData.contents = undefined �?[]');
        console.log('  accountData.conversations = undefined �?[]');
        console.log('\n可能原因:');
        console.log('  1. DataStore �?accountData 没有这两个字�?);
        console.log('  2. Worker 推送的数据结构不对');
        console.log('  3. DataStore 存储时字段名不匹�?);
      } else {
        console.log(`�?找到 ${data.topics.length} 个主�?\n`);
        data.topics.slice(0, 5).forEach((topic, i) => {
          console.log(`[${i + 1}] 主题 ID: ${topic.id}`);
          console.log(`    标题: ${topic.title}`);
          console.log(`    消息�? ${topic.messageCount}`);
          console.log(`    未读�? ${topic.unreadCount}`);
          console.log('');
        });

        // 请求第一个主题的消息
        if (data.topics.length > 0) {
          const firstTopic = data.topics[0];
          console.log(`\n正在请求主题 "${firstTopic.id}" 的消�?..\n`);
          socket.emit('monitor:request_messages', { topicId: firstTopic.id });
        }
      }
    });

    socket.on('monitor:messages', (data) => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`消息数据 (messages) for ${data.topicId}:`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      console.log(`找到 ${data.messages.length} 条消息\n`);

      if (data.messages.length > 0) {
        data.messages.slice(0, 3).forEach((msg, i) => {
          console.log(`[${i + 1}] ${msg.fromName}: ${msg.content.substring(0, 40)}...`);
        });
      }

      console.log('\n==================================================');
      socket.disconnect();
      resolve();
    });

    socket.on('connect_error', (error) => {
      console.log(`�?连接错误: ${error.message}`);
      resolve();
    });

    setTimeout(() => {
      console.log('\n�?超时');
      socket.disconnect();
      resolve();
    }, 10000);
  });
}

inspectDataStore().then(() => {
  console.log('检查完�?);
});
