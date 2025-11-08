/**
 * 直接查看 Master DataStore 中的数据
 * 通过监控客户端接口获取数据，然后分析会话 ID 映射
 */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';
const ACCOUNT_ID = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('='.repeat(80));
console.log('直接查看 Master DataStore 数据');
console.log('='.repeat(80));
console.log(`Master URL: ${MASTER_URL}`);
console.log(`目标账户: ${ACCOUNT_ID}`);
console.log('='.repeat(80));

const socket = io(MASTER_URL, {
  transports: ['websocket', 'polling']
});

// 存储所有私�?let allMessages = [];

socket.on('connect', () => {
  console.log('\n�?已连接到 Master');

  socket.emit('monitor:register', {
    clientType: 'monitor',
    clientId: `test_${Date.now()}`
  });
});

socket.on('monitor:registered', () => {
  console.log('�?注册成功');

  // 请求主题列表（包含私信会话）
  socket.emit('monitor:request_topics', { channelId: ACCOUNT_ID });
});

socket.on('monitor:topics', (data) => {
  console.log(`\n�?收到主题列表: ${data.topics?.length || 0} 个主题`);

  if (!data.topics || data.topics.length === 0) {
    console.log('\n⚠️  没有主题数据');
    process.exit(0);
  }

  // 筛选出私信主题
  const privateTopics = data.topics.filter(t => t.isPrivate && t.messageCount > 0);
  console.log(`私信主题（有消息�? ${privateTopics.length} 个`);

  if (privateTopics.length === 0) {
    console.log('\n⚠️  没有私信主题');
    process.exit(0);
  }

  // 请求所有私信主题的消息
  let requestedCount = 0;
  let receivedCount = 0;

  const requestNextTopic = (index) => {
    if (index >= privateTopics.length) {
      return;
    }

    const topic = privateTopics[index];
    console.log(`\n请求主题 ${index + 1}/${privateTopics.length}: ${topic.title}`);
    requestedCount++;

    socket.emit('monitor:request_messages', { topicId: topic.id });
  };

  // 处理消息响应
  socket.on('monitor:messages', (data) => {
    receivedCount++;

    if (data.messages && data.messages.length > 0) {
      console.log(`  收到 ${data.messages.length} 条消息`);
      allMessages = allMessages.concat(data.messages);
    }

    // 继续请求下一个主�?    if (receivedCount < privateTopics.length) {
      setTimeout(() => requestNextTopic(receivedCount), 200);
    } else {
      // 所有消息都收到了，开始分�?      setTimeout(() => analyzeMessages(), 500);
    }
  });

  // 开始请求第一个主�?  requestNextTopic(0);
});

function analyzeMessages() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 分析 Master DataStore 中的私信数据');
  console.log('='.repeat(80));
  console.log(`总私信数: ${allMessages.length}`);

  if (allMessages.length === 0) {
    console.log('\n⚠️  没有私信数据');
    process.exit(0);
  }

  // �?topicId (�?conversationId) 分组
  const conversationGroups = new Map();

  allMessages.forEach(msg => {
    const convId = msg.topicId; // Master 返回的是 topicId
    if (!conversationGroups.has(convId)) {
      conversationGroups.set(convId, []);
    }
    conversationGroups.get(convId).push(msg);
  });

  console.log(`\n按会话分�? ${conversationGroups.size} 个会话`);
  console.log(`\n逐个检查每个会话的消息发送�?..`);

  let problemCount = 0;

  conversationGroups.forEach((msgs, convId) => {
    // 统计发送�?    const senders = new Map();

    msgs.forEach(msg => {
      const senderName = msg.fromName || 'Unknown';
      if (!senders.has(senderName)) {
        senders.set(senderName, 0);
      }
      senders.set(senderName, senders.get(senderName) + 1);
    });

    // 找出非客服的发送�?    const nonClientSenders = Array.from(senders.keys()).filter(s => s !== '客服' && s !== 'Me' && s !== 'Unknown');

    console.log(`\n会话 ID: ${convId.substring(0, 40)}...`);
    console.log(`  消息�? ${msgs.length}`);
    console.log(`  发送者统�?`);
    senders.forEach((count, sender) => {
      console.log(`    - ${sender}: ${count} 条`);
    });

    if (nonClientSenders.length > 1) {
      problemCount++;
      console.log(`  �?问题：有 ${nonClientSenders.length} 个不同的用户发送者！`);
      console.log(`  发送者列�? ${nonClientSenders.join(', ')}`);

      // 显示�?3 条消息的详细信息
      console.log(`\n  �?3 条消息详�?`);
      msgs.slice(0, 3).forEach((msg, index) => {
        console.log(`    消息 ${index + 1}:`);
        console.log(`      id: ${msg.id}`);
        console.log(`      topicId (conversationId): ${msg.topicId}`);
        console.log(`      fromId: ${msg.fromId}`);
        console.log(`      fromName: ${msg.fromName}`);
        console.log(`      toId: ${msg.toId || '(�?'}`);
        console.log(`      direction: ${msg.direction}`);
        console.log(`      content: ${msg.content?.substring(0, 30)}...`);
      });
    } else if (nonClientSenders.length === 1) {
      console.log(`  �?正确：只有一个用户发送者（${nonClientSenders[0]}）`);
    } else {
      console.log(`  ⚠️  警告：没有非客服发送者（可能是测试数据）`);
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('📊 分析总结');
  console.log('='.repeat(80));
  console.log(`总会话数: ${conversationGroups.size}`);
  console.log(`有问题的会话�? ${problemCount}`);
  console.log(`正确�? ${((conversationGroups.size - problemCount) / conversationGroups.size * 100).toFixed(1)}%`);

  if (problemCount > 0) {
    console.log('\n�?Master DataStore 中的会话 ID 映射有问题！');
    console.log('这可能是因为:');
    console.log('1. Worker 发送给 Master 的数据本身就有问题（conversationId 不正确）');
    console.log('2. Master 在转换数据时出错');
    console.log('\n建议检查:');
    console.log('- Worker 的 data-manager.js 中的 mapMessageData() 方法');
    console.log('- Master 的 im-websocket-server.js 中的数据转换逻辑');
  } else {
    console.log('\n�?Master DataStore 中的会话 ID 映射正确�?);
  }

  process.exit(problemCount > 0 ? 1 : 0);
}

socket.on('disconnect', () => {
  console.log('\n�?连接断开');
});

socket.on('error', (error) => {
  console.error('\n�?错误:', error);
  process.exit(1);
});

// 60 秒超�?setTimeout(() => {
  console.log('\n⏱️  超时 - 60秒内没有完成分析');
  process.exit(1);
}, 60000);
