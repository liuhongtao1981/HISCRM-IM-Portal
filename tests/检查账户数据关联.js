/**
 * 检查账户数据关联是否正确
 * 验证 DataStore 中的数据是否正确关联到对应账户
 */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';
const ACCOUNT_ID = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('='.repeat(80));
console.log('检查账户数据关联');
console.log('='.repeat(80));
console.log(`账户 ID: ${ACCOUNT_ID}`);
console.log('='.repeat(80));

const socket = io(MASTER_URL, {
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('\n✅ 连接成功');

  socket.emit('monitor:register', {
    clientType: 'monitor',
    clientId: `test_${Date.now()}`
  });
});

socket.on('monitor:registered', () => {
  console.log('✅ 注册成功');
  socket.emit('monitor:request_channels');
});

socket.on('monitor:channels', (data) => {
  console.log(`\n✅ 收到频道列表: ${data.channels?.length || 0} 个频道`);

  if (data.channels && data.channels.length > 0) {
    data.channels.forEach((ch, index) => {
      console.log(`\n频道 ${index + 1}:`);
      console.log(`  ID: ${ch.id}`);
      console.log(`  名称: ${ch.name}`);
      console.log(`  平台: ${ch.platform || '(无)'}`);
      console.log(`  主题数: ${ch.topicCount || 0}`);
    });

    const targetChannel = data.channels.find(ch => ch.id === ACCOUNT_ID);
    if (targetChannel) {
      console.log('\n' + '='.repeat(80));
      console.log('目标账户详情');
      console.log('='.repeat(80));
      console.log(JSON.stringify(targetChannel, null, 2));

      // 请求主题列表
      console.log('\n请求主题列表...');
      socket.emit('monitor:request_topics', { channelId: ACCOUNT_ID });
    } else {
      console.log('\n❌ 未找到目标账户');
      process.exit(1);
    }
  }
});

socket.on('monitor:topics', (data) => {
  console.log(`\n✅ 收到主题列表: ${data.topics?.length || 0} 个主题`);
  console.log(`频道 ID: ${data.channelId}`);

  if (data.topics && data.topics.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('主题详情（前 10 个）');
    console.log('='.repeat(80));

    // 分类统计
    let privateTopics = 0;
    let workTopics = 0;

    data.topics.forEach((topic, index) => {
      if (topic.isPrivate) {
        privateTopics++;
      } else {
        workTopics++;
      }

      if (index < 10) {
        console.log(`\n主题 ${index + 1}:`);
        console.log(`  ID: ${topic.id}`);
        console.log(`  标题: ${topic.title?.substring(0, 40)}...`);
        console.log(`  类型: ${topic.isPrivate ? '私信' : '作品评论'}`);
        console.log(`  消息数: ${topic.messageCount || 0}`);
        console.log(`  频道 ID: ${topic.channelId}`);

        if (topic.channelId !== data.channelId) {
          console.log(`  ⚠️  警告: 主题的 channelId (${topic.channelId}) 与请求的 channelId (${data.channelId}) 不匹配!`);
        }
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('主题统计');
    console.log('='.repeat(80));
    console.log(`总主题数: ${data.topics.length}`);
    console.log(`私信主题: ${privateTopics}`);
    console.log(`作品主题: ${workTopics}`);

    // 检查是否有消息数据不匹配
    const mismatchedTopics = data.topics.filter(t => t.channelId !== data.channelId);
    if (mismatchedTopics.length > 0) {
      console.log('\n❌ 发现数据不匹配问题！');
      console.log(`有 ${mismatchedTopics.length} 个主题的 channelId 与请求的不一致`);
      console.log('\n不匹配的主题:');
      mismatchedTopics.forEach((topic, index) => {
        console.log(`\n${index + 1}. ${topic.title?.substring(0, 30)}`);
        console.log(`   主题的 channelId: ${topic.channelId}`);
        console.log(`   请求的 channelId: ${data.channelId}`);
      });
    } else {
      console.log('\n✅ 所有主题的 channelId 都正确匹配');
    }

    // 测试获取一个私信主题的消息
    const testPrivateTopic = data.topics.find(t => t.isPrivate && t.messageCount > 0);
    if (testPrivateTopic) {
      console.log('\n' + '='.repeat(80));
      console.log('测试私信消息');
      console.log('='.repeat(80));
      console.log(`测试主题: ${testPrivateTopic.title}`);
      console.log(`主题 ID: ${testPrivateTopic.id}`);
      console.log(`消息数: ${testPrivateTopic.messageCount}`);

      socket.emit('monitor:request_messages', { topicId: testPrivateTopic.id });
    } else {
      console.log('\n⚠️  没有找到有消息的私信主题');
      process.exit(0);
    }
  }
});

socket.on('monitor:messages', (data) => {
  console.log(`\n✅ 收到消息列表: ${data.messages?.length || 0} 条消息`);
  console.log(`主题 ID: ${data.topicId}`);

  if (data.messages && data.messages.length > 0) {
    console.log('\n消息详情（前 5 条）:');
    data.messages.slice(0, 5).forEach((msg, index) => {
      console.log(`\n消息 ${index + 1}:`);
      console.log(`  ID: ${msg.id}`);
      console.log(`  发送者: ${msg.fromName}`);
      console.log(`  内容: ${msg.content?.substring(0, 30)}...`);
      console.log(`  类型: ${msg.type}`);
      console.log(`  消息分类: ${msg.messageCategory}`);
      console.log(`  频道 ID: ${msg.channelId}`);
      console.log(`  主题 ID: ${msg.topicId}`);

      if (msg.topicId !== data.topicId) {
        console.log(`  ⚠️  警告: 消息的 topicId (${msg.topicId}) 与请求的 topicId (${data.topicId}) 不匹配!`);
      }
    });

    // 检查消息关联
    const mismatchedMessages = data.messages.filter(m => m.topicId !== data.topicId);
    if (mismatchedMessages.length > 0) {
      console.log('\n❌ 发现消息数据不匹配问题！');
      console.log(`有 ${mismatchedMessages.length} 条消息的 topicId 与请求的不一致`);
    } else {
      console.log('\n✅ 所有消息的 topicId 都正确匹配');
    }
  }

  process.exit(0);
});

socket.on('disconnect', () => {
  console.log('\n❌ 连接断开');
});

socket.on('error', (error) => {
  console.error('\n❌ 错误:', error);
  process.exit(1);
});

setTimeout(() => {
  console.log('\n⏱️  超时');
  process.exit(1);
}, 20000);
