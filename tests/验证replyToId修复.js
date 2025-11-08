/**
 * 验证 replyToId 修复效果
 * 检�?Master 返回的数据中 replyToId 是否已正确转换为 null
 */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';
const ACCOUNT_ID = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('='.repeat(80));
console.log('验证 replyToId 修复效果');
console.log('='.repeat(80));
console.log(`Master URL: ${MASTER_URL}`);
console.log(`账户 ID: ${ACCOUNT_ID}`);
console.log('='.repeat(80));

const socket = io(MASTER_URL, {
  transports: ['websocket', 'polling']
});

let hasCommentData = false;

socket.on('connect', () => {
  console.log('\n�?连接成功');

  // 注册为监控客户端
  socket.emit('monitor:register', {
    clientType: 'monitor',
    clientId: `test_${Date.now()}`
  });
});

socket.on('monitor:registered', (data) => {
  console.log('�?注册成功');

  // 请求频道列表
  socket.emit('monitor:request_channels');
});

socket.on('monitor:channels', (data) => {
  console.log(`�?收到频道列表: ${data.channels?.length || 0} 个频道`);

  const channel = data.channels?.find(ch => ch.id === ACCOUNT_ID);
  if (channel) {
    // 请求主题列表
    socket.emit('monitor:request_topics', { channelId: ACCOUNT_ID });
  } else {
    console.log('\n�?没有找到目标频道');
    process.exit(1);
  }
});

socket.on('monitor:topics', (data) => {
  console.log(`�?收到主题列表: ${data.topics?.length || 0} 个主题`);

  if (!data.topics || data.topics.length === 0) {
    console.log('\n⚠️  没有主题数据');
    process.exit(0);
  }

  // 找到有消息的主题
  const topicsWithMessages = data.topics.filter(t => t.messageCount > 0);
  console.log(`\n有消息的主题: ${topicsWithMessages.length} 个`);

  if (topicsWithMessages.length > 0) {
    // 测试第一个有消息的主�?    const testTopic = topicsWithMessages[0];
    console.log(`\n测试主题: ${testTopic.title || testTopic.id}`);
    console.log(`消息数量: ${testTopic.messageCount}`);

    // 请求消息列表
    socket.emit('monitor:request_messages', { topicId: testTopic.id });
  } else {
    console.log('\n⚠️  所有主题都没有消息');
    process.exit(0);
  }
});

socket.on('monitor:messages', (data) => {
  console.log(`\n�?收到消息列表: ${data.messages?.length || 0} 条消息`);

  if (!data.messages || data.messages.length === 0) {
    console.log('\n⚠️  消息列表为空');
    process.exit(0);
  }

  hasCommentData = true;

  console.log('\n' + '='.repeat(80));
  console.log('📊 数据格式验证');
  console.log('='.repeat(80));

  let passCount = 0;
  let failCount = 0;

  data.messages.forEach((msg, index) => {
    const hasReplyToId = 'replyToId' in msg;
    const isNullOrString = msg.replyToId === null || typeof msg.replyToId === 'string';
    const isNotZeroString = msg.replyToId !== '0';

    const isPassed = hasReplyToId && isNullOrString && isNotZeroString;

    if (isPassed) {
      passCount++;
    } else {
      failCount++;
    }

    console.log(`\n消息 ${index + 1}:`);
    console.log(`  ID: ${msg.id}`);
    console.log(`  发送�? ${msg.fromName}`);
    console.log(`  内容: ${msg.content?.substring(0, 30)}...`);
    console.log(`  类型: ${msg.type}`);
    console.log(`  消息分类: ${msg.messageCategory || '(�?'}`);
    console.log(`  replyToId: ${JSON.stringify(msg.replyToId)} (类型: ${typeof msg.replyToId})`);
    console.log(`  验证结果: ${isPassed ? '�?通过' : '�?失败'}`);

    if (!isPassed) {
      console.log('  失败原因:');
      if (!hasReplyToId) console.log('    - 缺少 replyToId 字段');
      if (!isNullOrString) console.log('    - replyToId 不是 null 或字符串');
      if (!isNotZeroString) console.log('    - replyToId 是字符串 "0"（应该转换为 null�?);
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('📈 验证统计');
  console.log('='.repeat(80));
  console.log(`总消息数: ${data.messages.length}`);
  console.log(`�?通过: ${passCount} 条`);
  console.log(`�?失败: ${failCount} 条`);

  if (failCount === 0) {
    console.log('\n🎉 所有消息的 replyToId 格式都正确！');
    console.log('�?修复验证成功 - 没有发现 "0" 字符串，所有顶级消息都使用 null');
  } else {
    console.log('\n⚠️  发现格式问题，需要进一步检�?);
  }

  console.log('\n' + '='.repeat(80));
  console.log('🔍 PC IM 过滤逻辑测试');
  console.log('='.repeat(80));

  // 模拟 PC IM 的过滤逻辑
  const mainMessages = data.messages.filter(msg => !msg.replyToId);
  const discussions = data.messages.filter(msg => msg.replyToId);

  console.log(`主消息（!msg.replyToId�? ${mainMessages.length} 条`);
  console.log(`讨论回复（msg.replyToId�? ${discussions.length} 条`);

  if (mainMessages.length === 0 && data.messages.length > 0) {
    console.log('\n�?警告：所有消息都被过滤掉了！');
    console.log('这意味着所有消息的 replyToId 都是 truthy 值（�?"0"�?);
    console.log('修复可能没有生效');
  } else if (mainMessages.length > 0) {
    console.log('\n�?PC IM 能够正确显示主消�?);
  }

  process.exit(failCount === 0 ? 0 : 1);
});

socket.on('disconnect', () => {
  console.log('\n�?连接断开');
  if (!hasCommentData) {
    process.exit(1);
  }
});

socket.on('error', (error) => {
  console.error('\n�?错误:', error);
  process.exit(1);
});

// 20 秒超�?setTimeout(() => {
  console.log('\n⏱️  超时 - 20秒内没有完成验证');
  process.exit(1);
}, 20000);
