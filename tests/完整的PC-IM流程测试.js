/**
 * 完整�?PC IM 流程测试
 * 模拟用户�?PC IM 中的完整操作流程
 */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';
const ACCOUNT_ID = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';
const TOPIC_ID = '7566840303458569498'; // 大白们晨会交�?
console.log('='.repeat(80));
console.log('完整�?PC IM 流程测试');
console.log('='.repeat(80));
console.log(`Master URL: ${MASTER_URL}`);
console.log(`账户 ID: ${ACCOUNT_ID}`);
console.log(`作品 ID: ${TOPIC_ID}`);
console.log('='.repeat(80));

// 连接�?Master
const socket = io(MASTER_URL, {
  transports: ['websocket', 'polling']
});

let receivedChannels = false;
let receivedTopics = false;
let receivedMessages = false;

socket.on('connect', () => {
  console.log('\n�?步骤 1: 连接成功');
  console.log(`Socket ID: ${socket.id}`);

  // 注册为监控客户端
  console.log('\n📝 步骤 2: 发送注册请�?);
  socket.emit('monitor:register', {
    clientType: 'monitor',
    clientId: `pc_im_test_${Date.now()}`
  });
});

socket.on('monitor:registered', (data) => {
  console.log('\n�?步骤 3: 注册成功');
  console.log('响应:', JSON.stringify(data, null, 2));

  // 请求频道列表
  console.log('\n📝 步骤 4: 请求频道列表');
  socket.emit('monitor:request_channels');
});

socket.on('monitor:channels', (data) => {
  receivedChannels = true;
  console.log('\n�?步骤 5: 收到频道列表');
  console.log(`频道数量: ${data.channels?.length || 0}`);

  if (data.channels && data.channels.length > 0) {
    const channel = data.channels.find(ch => ch.id === ACCOUNT_ID);
    if (channel) {
      console.log('\n目标频道信息:');
      console.log(JSON.stringify(channel, null, 2));

      // 请求该频道的主题列表
      console.log('\n📝 步骤 6: 请求主题列表');
      console.log(`参数: { channelId: "${ACCOUNT_ID}" }`);
      socket.emit('monitor:request_topics', { channelId: ACCOUNT_ID });
    } else {
      console.log(`\n�?没有找到频道 ${ACCOUNT_ID}`);
      process.exit(1);
    }
  } else {
    console.log('\n�?频道列表为空');
    process.exit(1);
  }
});

socket.on('monitor:topics', (data) => {
  receivedTopics = true;
  console.log('\n�?步骤 7: 收到主题列表');
  console.log(`主题数量: ${data.topics?.length || 0}`);
  console.log(`频道 ID: ${data.channelId}`);

  if (data.topics && data.topics.length > 0) {
    // 查找目标主题
    const topic = data.topics.find(t => t.id === TOPIC_ID);

    if (topic) {
      console.log('\n目标主题信息:');
      console.log(JSON.stringify(topic, null, 2));

      // 请求该主题的消息列表
      console.log('\n📝 步骤 8: 请求消息列表');
      console.log(`参数: { topicId: "${TOPIC_ID}" }`);
      socket.emit('monitor:request_messages', { topicId: TOPIC_ID });
    } else {
      console.log(`\n⚠️  没有找到主题 ${TOPIC_ID}`);
      console.log('\n可用的主�?');
      data.topics.slice(0, 5).forEach((t, i) => {
        console.log(`\n主题 ${i + 1}:`);
        console.log(`  ID: ${t.id}`);
        console.log(`  标题: ${t.title?.substring(0, 50)}...`);
        console.log(`  消息�? ${t.messageCount || 0}`);
      });
      process.exit(0);
    }
  } else {
    console.log('\n�?主题列表为空');
    process.exit(0);
  }
});

socket.on('monitor:messages', (data) => {
  receivedMessages = true;
  console.log('\n�?步骤 9: 收到消息列表');
  console.log(`主题 ID: ${data.topicId}`);
  console.log(`消息数量: ${data.messages?.length || 0}`);

  if (data.messages && data.messages.length > 0) {
    console.log('\n消息详情:');
    console.log(JSON.stringify(data.messages, null, 2));

    console.log('\n' + '='.repeat(80));
    console.log('�?测试成功 - 完整流程正常');
    console.log('='.repeat(80));
    console.log('\n检查清�?');
    console.log(`�?连接成功`);
    console.log(`�?注册成功`);
    console.log(`�?收到频道列表 (${receivedChannels ? '�? : '�?})`);
    console.log(`�?收到主题列表 (${receivedTopics ? '�? : '�?})`);
    console.log(`�?收到消息列表 (${receivedMessages ? '�? : '�?})`);
    console.log(`�?消息包含 messageCategory 字段: ${data.messages[0].messageCategory ? '�? : '�?}`);
    console.log(`�?消息包含 isHandled 字段: ${data.messages[0].isHandled !== undefined ? '�? : '�?}`);
  } else {
    console.log('\n⚠️  消息列表为空');
    console.log('\n可能原因:');
    console.log('1. 该主题确实没有消�?);
    console.log('2. Master DataStore 中没有该主题的数�?);
    console.log('3. Worker 还没有同步数据到 Master');
  }

  process.exit(0);
});

socket.on('disconnect', () => {
  console.log('\n�?连接断开');
});

socket.on('error', (error) => {
  console.error('\n�?错误:', error);
  process.exit(1);
});

// 监听所有事件用于调�?socket.onAny((eventName, ...args) => {
  if (!['monitor:registered', 'monitor:channels', 'monitor:topics', 'monitor:messages'].includes(eventName)) {
    console.log(`\n[DEBUG] 收到事件: ${eventName}`, args);
  }
});

// 15 秒超�?setTimeout(() => {
  console.log('\n⏱️  超时 - 15秒内没有完成所有步�?);
  console.log('\n检查清�?');
  console.log(`${receivedChannels ? '�? : '�?} 收到频道列表`);
  console.log(`${receivedTopics ? '�? : '�?} 收到主题列表`);
  console.log(`${receivedMessages ? '�? : '�?} 收到消息列表`);
  process.exit(1);
}, 15000);
