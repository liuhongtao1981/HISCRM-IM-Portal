/**
 * 查看 Worker 的快照数据
 * 直接连接到 Worker 命名空间，获取 DataStore 快照，分析私信的会话 ID 映射
 */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';
const ACCOUNT_ID = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('='.repeat(80));
console.log('查看 Worker 快照数据');
console.log('='.repeat(80));
console.log(`Master URL: ${MASTER_URL}`);
console.log(`目标账户: ${ACCOUNT_ID}`);
console.log('='.repeat(80));

// 连接到 Worker 命名空间（模拟 Master 请求 Worker 数据）
const socket = io(`${MASTER_URL}/worker`, {
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('\n✅ 已连接到 Master Worker 命名空间');
  console.log('Socket ID:', socket.id);

  // 请求 Worker 同步数据（这会触发 Worker 发送快照）
  console.log('\n发送 master:request_sync 请求...');
  socket.emit('master:request_sync', {
    accountId: ACCOUNT_ID
  });
});

socket.on('worker:data_sync', (data) => {
  console.log('\n✅ 收到 worker:data_sync 数据');
  console.log('Worker ID:', data.workerId);
  console.log('账户 ID:', data.accountId);

  const snapshot = data.snapshot;

  if (!snapshot || !snapshot.data) {
    console.log('\n❌ 快照数据为空');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(80));
  console.log('📦 快照数据统计');
  console.log('='.repeat(80));
  console.log(`评论数量: ${snapshot.data.comments?.length || 0}`);
  console.log(`作品数量: ${snapshot.data.contents?.length || 0}`);
  console.log(`会话数量: ${snapshot.data.conversations?.length || 0}`);
  console.log(`私信数量: ${snapshot.data.messages?.length || 0}`);

  if (!snapshot.data.messages || snapshot.data.messages.length === 0) {
    console.log('\n⚠️  没有私信数据');
    process.exit(0);
  }

  console.log('\n' + '='.repeat(80));
  console.log('🔍 分析私信会话 ID 映射');
  console.log('='.repeat(80));

  const messages = snapshot.data.messages;

  // 按 conversationId 分组
  const conversationGroups = new Map();

  messages.forEach(msg => {
    const convId = msg.conversationId;
    if (!conversationGroups.has(convId)) {
      conversationGroups.set(convId, []);
    }
    conversationGroups.get(convId).push(msg);
  });

  console.log(`\n总会话数: ${conversationGroups.size}`);
  console.log(`\n逐个检查每个会话的消息发送者...`);

  let problemCount = 0;

  conversationGroups.forEach((msgs, convId) => {
    // 统计发送者
    const senders = new Map();

    msgs.forEach(msg => {
      const senderName = msg.senderName || 'Unknown';
      if (!senders.has(senderName)) {
        senders.set(senderName, 0);
      }
      senders.set(senderName, senders.get(senderName) + 1);
    });

    // 找出非客服的发送者
    const nonClientSenders = Array.from(senders.keys()).filter(s => s !== '客服' && s !== 'Me' && s !== 'Unknown');

    console.log(`\n会话 ID: ${convId.substring(0, 40)}...`);
    console.log(`  消息数: ${msgs.length}`);
    console.log(`  发送者统计:`);
    senders.forEach((count, sender) => {
      console.log(`    - ${sender}: ${count} 条`);
    });

    if (nonClientSenders.length > 1) {
      problemCount++;
      console.log(`  ❌ 问题：有 ${nonClientSenders.length} 个不同的用户发送者！`);
      console.log(`  发送者列表: ${nonClientSenders.join(', ')}`);

      // 显示前 3 条消息的详细信息
      console.log(`\n  前 3 条消息详情:`);
      msgs.slice(0, 3).forEach((msg, index) => {
        console.log(`    消息 ${index + 1}:`);
        console.log(`      messageId: ${msg.messageId}`);
        console.log(`      conversationId: ${msg.conversationId}`);
        console.log(`      senderId: ${msg.senderId}`);
        console.log(`      senderName: ${msg.senderName}`);
        console.log(`      recipientId: ${msg.recipientId || '(无)'}`);
        console.log(`      recipientName: ${msg.recipientName || '(无)'}`);
        console.log(`      direction: ${msg.direction}`);
        console.log(`      content: ${msg.content?.substring(0, 30)}...`);
      });
    } else if (nonClientSenders.length === 1) {
      console.log(`  ✅ 正确：只有一个用户发送者（${nonClientSenders[0]}）`);
    } else {
      console.log(`  ⚠️  警告：没有非客服发送者（可能是测试数据）`);
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('📊 分析总结');
  console.log('='.repeat(80));
  console.log(`总会话数: ${conversationGroups.size}`);
  console.log(`有问题的会话数: ${problemCount}`);
  console.log(`正确率: ${((conversationGroups.size - problemCount) / conversationGroups.size * 100).toFixed(1)}%`);

  if (problemCount > 0) {
    console.log('\n❌ Worker 快照数据中的会话 ID 映射有问题！');
    console.log('这说明 Worker 爬取的数据本身就是错的，或者 mapMessageData() 没有正确处理。');
  } else {
    console.log('\n✅ Worker 快照数据中的会话 ID 映射正确！');
    console.log('问题可能在 Master 的转换层或 IM WebSocket Server。');
  }

  process.exit(problemCount > 0 ? 1 : 0);
});

socket.on('disconnect', () => {
  console.log('\n❌ 连接断开');
});

socket.on('error', (error) => {
  console.error('\n❌ 错误:', error);
  process.exit(1);
});

socket.on('connect_error', (error) => {
  console.error('\n❌ 连接错误:', error.message);
  process.exit(1);
});

// 30 秒超时
setTimeout(() => {
  console.log('\n⏱️  超时 - 30秒内没有收到 Worker 数据');
  console.log('\n可能的原因:');
  console.log('1. Worker 没有连接到 Master');
  console.log('2. Worker 没有响应 master:request_sync 请求');
  console.log('3. Worker 没有该账户的数据');
  process.exit(1);
}, 30000);
