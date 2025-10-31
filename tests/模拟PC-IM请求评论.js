/**
 * 模拟 PC IM 请求评论数据
 */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';
const CHANNEL_ID = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';
const TOPIC_ID = '7566840303458569498'; // 大白们晨会交班

console.log('='.repeat(80));
console.log('模拟 PC IM 请求评论数据');
console.log('='.repeat(80));
console.log(`频道 ID: ${CHANNEL_ID}`);
console.log(`主题 ID: ${TOPIC_ID}`);
console.log('='.repeat(80));

const socket = io(MASTER_URL, {
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('\n✅ 已连接');

  // 1. 注册
  console.log('\n📝 步骤 1: 注册为监控客户端');
  socket.emit('monitor:register', {
    clientType: 'monitor',
    clientId: `monitor_${Date.now()}`
  });
});

socket.on('monitor:registered', (data) => {
  console.log('✅ 注册成功:', JSON.stringify(data, null, 2));

  // 2. 请求主题列表
  console.log('\n📝 步骤 2: 请求主题列表');
  socket.emit('monitor:request_topics', { channelId: CHANNEL_ID });
});

socket.on('monitor:topics', (data) => {
  console.log(`✅ 收到 ${data.topics?.length || 0} 个主题`);

  // 找到目标主题
  const targetTopic = data.topics?.find(t => t.id === TOPIC_ID);
  if (targetTopic) {
    console.log('\n目标主题:');
    console.log(JSON.stringify(targetTopic, null, 2));
  } else {
    console.log('\n❌ 没有找到目标主题');
  }

  // 3. 请求消息列表
  console.log('\n📝 步骤 3: 请求消息列表');
  console.log(`请求参数: channelId=${CHANNEL_ID}, topicId=${TOPIC_ID}`);
  socket.emit('monitor:request_messages', {
    channelId: CHANNEL_ID,
    topicId: TOPIC_ID
  });
});

socket.on('monitor:messages', (data) => {
  console.log('\n✅ 收到消息响应:');
  console.log(JSON.stringify(data, null, 2));

  if (data.messages && data.messages.length > 0) {
    console.log(`\n共 ${data.messages.length} 条消息:`);
    data.messages.forEach((msg, index) => {
      console.log(`\n消息 ${index + 1}:`);
      console.log(`  ID: ${msg.id}`);
      console.log(`  发送者: ${msg.fromName}`);
      console.log(`  内容: ${msg.content}`);
      console.log(`  类型: ${msg.type}`);
      console.log(`  分类: ${msg.messageCategory}`);
      console.log(`  已处理: ${msg.isHandled}`);
      console.log(`  channelId: ${msg.channelId}`);
      console.log(`  topicId: ${msg.topicId}`);
    });
  } else {
    console.log('\n⚠️  消息列表为空或未定义');
    console.log('data.messages:', data.messages);
  }

  console.log('\n' + '='.repeat(80));
  console.log('测试完成');
  console.log('='.repeat(80));
  process.exit(0);
});

socket.on('disconnect', () => {
  console.log('\n❌ 连接断开');
});

socket.on('error', (error) => {
  console.error('\n❌ 错误:', error);
  process.exit(1);
});

// 监听所有事件用于调试
socket.onAny((eventName, ...args) => {
  if (!['monitor:registered', 'monitor:topics', 'monitor:messages'].includes(eventName)) {
    console.log(`\n[DEBUG] 收到事件: ${eventName}`, args);
  }
});

setTimeout(() => {
  console.log('\n⏱️  超时');
  process.exit(1);
}, 10000);
