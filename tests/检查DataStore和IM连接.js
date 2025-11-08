/**
 * 检�?DataStore 数据�?IM WebSocket 连接
 */

const http = require('http');
const io = require('socket.io-client');

console.log('==================================================');
console.log('检�?DataStore �?IM WebSocket 连接');
console.log('==================================================\n');

// 1. 检�?DataStore 是否有数�?(通过 IM API)
async function checkDataStore() {
  console.log('步骤 1: 检�?DataStore 是否有数�?..\n');

  const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';
  const apis = [
    { name: '会话列表', url: `http://localhost:3000/api/im/conversations?account_id=${accountId}&count=10` },
    { name: '私信列表', url: `http://localhost:3000/api/im/messages?account_id=${accountId}&count=10` },
    { name: '评论列表', url: `http://localhost:3000/api/im/discussions?account_id=${accountId}&count=10` },
    { name: '作品列表', url: `http://localhost:3000/api/im/contents?account_id=${accountId}&count=10` },
  ];

  for (const api of apis) {
    try {
      const response = await fetch(api.url);
      const data = await response.json();

      if (response.ok && data.status_code === 0) {
        const dataKey = Object.keys(data.data).find(k => Array.isArray(data.data[k]));
        const count = dataKey ? data.data[dataKey].length : 0;
        console.log(`�?${api.name}: ${count} 条数据`);
      } else {
        console.log(`�?${api.name}: HTTP ${response.status}`);
      }
    } catch (err) {
      console.log(`�?${api.name}: ${err.message}`);
    }
  }
}

// 2. 测试 WebSocket 连接和事�?async function testWebSocketConnection() {
  console.log('\n步骤 2: 测试 IM WebSocket 连接...\n');

  return new Promise((resolve) => {
    const socket = io('ws://localhost:3000', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 3,
      transports: ['websocket', 'polling']
    });

    let connected = false;
    let registered = false;
    let receivedChannels = false;

    // 连接成功
    socket.on('connect', () => {
      console.log(`�?WebSocket 连接成功! Socket ID: ${socket.id}`);
      connected = true;

      // 注册监控客户�?      const clientId = `test_${Date.now()}`;
      console.log(`\n正在注册监控客户�? ${clientId}...`);
      socket.emit('monitor:register', {
        clientType: 'monitor',
        clientId: clientId
      });
    });

    // 注册确认
    socket.on('monitor:registered', (data) => {
      console.log(`�?注册确认:`, data);
      registered = true;
    });

    // 接收频道列表
    socket.on('monitor:channels', (data) => {
      console.log(`�?收到频道列表: ${data.channels.length} 个频道`);
      receivedChannels = true;

      if (data.channels.length > 0) {
        console.log('\n频道详情:');
        data.channels.slice(0, 3).forEach((ch, i) => {
          console.log(`  [${i + 1}] ${ch.name} (${ch.id})`);
          console.log(`      - 未读: ${ch.unreadCount}, 消息�? ${ch.messageCount}`);
          console.log(`      - 最后消�? ${ch.lastMessage || '�?}`);
        });

        // 请求第一个频道的主题
        const firstChannel = data.channels[0];
        console.log(`\n请求频道 "${firstChannel.name}" 的主题列�?..`);
        socket.emit('monitor:request_topics', { channelId: firstChannel.id });
      } else {
        console.log('⚠️ 频道列表为空! DataStore 可能没有数据');
      }
    });

    // 接收主题列表
    socket.on('monitor:topics', (data) => {
      console.log(`�?收到主题列表: ${data.topics.length} 个主题`);

      if (data.topics.length > 0) {
        console.log('\n主题详情:');
        data.topics.slice(0, 3).forEach((topic, i) => {
          console.log(`  [${i + 1}] ${topic.title} (${topic.id})`);
          console.log(`      - 未读: ${topic.unreadCount}, 消息�? ${topic.messageCount}`);
        });

        // 请求第一个主题的消息
        const firstTopic = data.topics[0];
        console.log(`\n请求主题 "${firstTopic.title}" 的消息列�?..`);
        socket.emit('monitor:request_messages', { topicId: firstTopic.id });
      } else {
        console.log('⚠️ 主题列表为空!');
      }
    });

    // 接收消息列表
    socket.on('monitor:messages', (data) => {
      console.log(`�?收到消息列表: ${data.messages.length} 条消息`);

      if (data.messages.length > 0) {
        console.log('\n消息详情 (�?3 �?:');
        data.messages.slice(0, 3).forEach((msg, i) => {
          console.log(`  [${i + 1}] ${msg.fromName}: ${msg.content.substring(0, 50)}...`);
        });
      }

      // 测试完成
      console.log('\n==================================================');
      console.log('测试结果总结:');
      console.log('==================================================');
      console.log(`连接状�? ${connected ? '�?成功' : '�?失败'}`);
      console.log(`注册状�? ${registered ? '�?成功' : '�?失败'}`);
      console.log(`接收数据: ${receivedChannels ? '�?成功' : '�?失败'}`);
      console.log('==================================================\n');

      socket.disconnect();
      resolve();
    });

    // 连接错误
    socket.on('connect_error', (error) => {
      console.log(`�?连接错误: ${error.message}`);
      resolve();
    });

    // 超时
    setTimeout(() => {
      if (!connected) {
        console.log('�?连接超时 (10�?');
      } else if (!registered) {
        console.log('�?注册超时 (10�?');
      } else if (!receivedChannels) {
        console.log('�?数据接收超时 (10�?');
      }
      socket.disconnect();
      resolve();
    }, 10000);
  });
}

// 主流�?async function main() {
  try {
    await checkDataStore();
    await testWebSocketConnection();
  } catch (error) {
    console.error('测试出错:', error);
  }
}

main();
