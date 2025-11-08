/**
 * 检查私信会�?ID 映射是否正确
 * 验证每条私信消息的会�?ID 是否正确对应到发送�? */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';
const ACCOUNT_ID = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('='.repeat(80));
console.log('检查私信会�?ID 映射');
console.log('='.repeat(80));

const socket = io(MASTER_URL, {
  transports: ['websocket', 'polling']
});

// 存储所有私信主�?const privateTopics = [];

socket.on('connect', () => {
  console.log('\n�?连接成功');
  socket.emit('monitor:register', {
    clientType: 'monitor',
    clientId: `test_${Date.now()}`
  });
});

socket.on('monitor:registered', () => {
  console.log('�?注册成功');
  socket.emit('monitor:request_channels');
});

socket.on('monitor:channels', (data) => {
  console.log(`�?收到频道列表`);
  socket.emit('monitor:request_topics', { channelId: ACCOUNT_ID });
});

socket.on('monitor:topics', (data) => {
  console.log(`\n�?收到主题列表: ${data.topics?.length || 0} 个主题`);

  // 筛选出私信主题
  const privateTops = data.topics.filter(t => t.isPrivate && t.messageCount > 0);
  console.log(`私信主题（有消息�? ${privateTops.length} 个`);

  if (privateTops.length === 0) {
    console.log('\n⚠️  没有私信主题');
    process.exit(0);
  }

  console.log('\n' + '='.repeat(80));
  console.log('私信主题列表');
  console.log('='.repeat(80));

  privateTops.forEach((topic, index) => {
    console.log(`\n${index + 1}. ${topic.title}`);
    console.log(`   主题 ID (conversationId): ${topic.id}`);
    console.log(`   消息�? ${topic.messageCount}`);
    privateTopics.push(topic);
  });

  // 请求第一个私信主题的消息
  if (privateTops.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('开始检查每个私信主题的消息...');
    console.log('='.repeat(80));

    // 递归请求所有私信主题的消息
    let currentIndex = 0;

    const requestNextTopic = () => {
      if (currentIndex >= privateTops.length) {
        console.log('\n' + '='.repeat(80));
        console.log('�?所有私信主题检查完�?);
        console.log('='.repeat(80));
        process.exit(0);
        return;
      }

      const topic = privateTops[currentIndex];
      console.log(`\n检查主�?${currentIndex + 1}/${privateTops.length}: ${topic.title}`);
      console.log(`主题 ID: ${topic.id}`);

      socket.emit('monitor:request_messages', { topicId: topic.id });
    };

    // 处理消息响应
    socket.on('monitor:messages', (data) => {
      const topic = privateTops[currentIndex];
      console.log(`\n收到 ${data.messages?.length || 0} 条消息`);

      if (data.messages && data.messages.length > 0) {
        // 分析消息的发送�?        const senderSet = new Set();
        let hasIdMismatch = false;

        data.messages.forEach((msg, index) => {
          senderSet.add(msg.fromName);

          // 检�?topicId 是否匹配
          if (msg.topicId !== topic.id) {
            if (!hasIdMismatch) {
              console.log(`\n�?发现主题 ID 不匹配问题！`);
              hasIdMismatch = true;
            }
            console.log(`  消息 ${index + 1}: fromName="${msg.fromName}", topicId="${msg.topicId}" (应该�?"${topic.id}")`);
          }
        });

        // 统计发送�?        console.log(`\n发送者统计（�?${senderSet.size} 个不同发送者）:`);
        senderSet.forEach(sender => {
          const count = data.messages.filter(m => m.fromName === sender).length;
          console.log(`  - ${sender}: ${count} 条消息`);
        });

        // 警告：如果一个私信会话中有多个非客服的发送者，说明消息混乱�?        const nonClientSenders = Array.from(senderSet).filter(s => s !== '客服' && s !== 'Me');
        if (nonClientSenders.length > 1) {
          console.log(`\n⚠️  警告：此私信会话中有 ${nonClientSenders.length} 个不同的用户发送者！`);
          console.log(`   主题名称: ${topic.title}`);
          console.log(`   主题 ID: ${topic.id}`);
          console.log(`   发送者列�? ${nonClientSenders.join(', ')}`);
          console.log(`   这表明不同用户的消息被错误地归到了同一个会话中！`);
        } else if (nonClientSenders.length === 1) {
          console.log(`\n�?此会话的发送者正确（只有一个用�? ${nonClientSenders[0]}）`);

          // 检查主题名称是否与发送者匹�?          if (!topic.title.includes(nonClientSenders[0])) {
            console.log(`\n⚠️  警告：主题名�?"${topic.title}" 与发送�?"${nonClientSenders[0]}" 不匹配`);
          }
        }

        // 显示�?条消息的详细信息
        console.log(`\n�?3 条消息详�?`);
        data.messages.slice(0, 3).forEach((msg, index) => {
          console.log(`\n  消息 ${index + 1}:`);
          console.log(`    ID: ${msg.id}`);
          console.log(`    发送�? ${msg.fromName}`);
          console.log(`    内容: ${msg.content?.substring(0, 30)}...`);
          console.log(`    主题 ID: ${msg.topicId}`);
          console.log(`    频道 ID: ${msg.channelId}`);
        });
      }

      // 请求下一个主�?      currentIndex++;
      setTimeout(requestNextTopic, 500);
    });

    // 开始请求第一个主�?    requestNextTopic();
  }
});

socket.on('disconnect', () => {
  console.log('\n�?连接断开');
});

socket.on('error', (error) => {
  console.error('\n�?错误:', error);
  process.exit(1);
});

setTimeout(() => {
  console.log('\n⏱️  超时');
  process.exit(1);
}, 60000);
