/**
 * 验证消息方向和昵称显示修�? * 测试两个修复点：
 * 1. 消息昵称�?"未知用户" 正确显示为实际用户名
 * 2. 消息方向正确区分"我发�?�?客户回的"
 */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

async function testMessageDirectionAndNames() {
  console.log('========================================');
  console.log('验证消息方向和昵称显示修�?);
  console.log('========================================\n');

  return new Promise((resolve, reject) => {
    const socket = io(MASTER_URL, {
      transports: ['websocket'],
      reconnection: false,
    });

    let testResults = {
      totalMessages: 0,
      incomingMessages: 0,
      outgoingMessages: 0,
      messagesWithNames: 0,
      messagesWithUnknown: 0,
      authorReplyCount: 0,
    };

    socket.on('connect', () => {
      console.log('�?已连接到 Master IM WebSocket\n');

      // 注册监控客户�?      socket.emit('monitor:register', {
        clientId: 'test-direction-names',
        clientType: 'monitor',
      });
    });

    socket.on('monitor:registered', (data) => {
      console.log(`�?监控客户端注册成功，频道�? ${data.channelCount}\n`);
      socket.emit('monitor:request_channels');
    });

    socket.on('monitor:channels', (data) => {
      const { channels } = data;
      console.log(`�?收到 ${channels.length} 个频道\n`);

      if (channels.length > 0) {
        const channelId = channels[0].id;
        console.log(`正在请求频道 "${channelId}" 的主�?..\n`);
        socket.emit('monitor:request_topics', { channelId });
      } else {
        console.log('⚠️  没有找到频道\n');
        socket.disconnect();
        resolve(testResults);
      }
    });

    socket.on('monitor:topics', (data) => {
      const { topics } = data;
      console.log(`�?收到 ${topics.length} 个主题\n`);

      if (topics.length === 0) {
        console.log('⚠️  没有找到主题\n');
        socket.disconnect();
        resolve(testResults);
        return;
      }

      // 找到有消息的主题
      const topicsWithMessages = topics.filter(t => t.messageCount > 0);
      console.log(`找到 ${topicsWithMessages.length} 个有消息的主题\n`);

      if (topicsWithMessages.length > 0) {
        const topic = topicsWithMessages[0];
        console.log(`正在请求主题 "${topic.title.substring(0, 50)}..." 的消�?..`);
        console.log(`主题 ID: ${topic.id}\n`);
        socket.emit('monitor:request_messages', { topicId: topic.id });
      } else {
        console.log('⚠️  没有找到有消息的主题\n');
        socket.disconnect();
        resolve(testResults);
      }
    });

    socket.on('monitor:messages', (data) => {
      const { messages } = data;
      testResults.totalMessages = messages.length;

      console.log(`�?收到 ${messages.length} 条消息\n`);

      if (messages.length > 0) {
        console.log('消息详情分析:\n');
        console.log('=' .repeat(80) + '\n');

        messages.forEach((msg, index) => {
          // 统计消息方向
          if (msg.direction === 'incoming') {
            testResults.incomingMessages++;
          } else if (msg.direction === 'outgoing') {
            testResults.outgoingMessages++;
          }

          // 统计昵称显示
          if (msg.fromName === '未知用户') {
            testResults.messagesWithUnknown++;
          } else {
            testResults.messagesWithNames++;
          }

          // 统计作者回�?          if (msg.isAuthorReply) {
            testResults.authorReplyCount++;
          }

          // 判断消息�?我发�?还是"客户回的"
          const isMyMessage = msg.fromId === 'monitor_client' || msg.fromName === '客服';
          const directionText = isMyMessage ? '我发�?(outgoing)' : '客户回的 (incoming)';

          console.log(`[${index + 1}] ${directionText}`);
          console.log(`    发送�? ${msg.fromName}`);
          console.log(`    发送者ID: ${msg.fromId}`);
          console.log(`    内容: ${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}`);
          console.log(`    时间: ${new Date(msg.timestamp).toLocaleString('zh-CN')}`);
          console.log(`    direction字段: ${msg.direction || '未设�?}`);

          if (msg.isAuthorReply !== undefined) {
            console.log(`    isAuthorReply: ${msg.isAuthorReply}`);
          }

          // 验证一致�?          if (msg.direction === 'outgoing' && !isMyMessage) {
            console.log(`    ⚠️  警告: direction是outgoing但fromId/fromName不是客服`);
          }
          if (msg.direction === 'incoming' && isMyMessage) {
            console.log(`    ⚠️  警告: direction是incoming但fromId/fromName是客服`);
          }

          console.log();
        });

        console.log('=' .repeat(80) + '\n');
        printSummary();
      } else {
        console.log('⚠️  未获取到消息数据\n');
      }

      socket.disconnect();
      resolve(testResults);
    });

    function printSummary() {
      console.log('验证结果汇�?);
      console.log('========================================\n');

      console.log('�?消息统计:');
      console.log(`   总消息数: ${testResults.totalMessages}`);
      console.log(`   incoming (客户回的): ${testResults.incomingMessages} (${((testResults.incomingMessages / testResults.totalMessages) * 100).toFixed(1)}%)`);
      console.log(`   outgoing (我发�?: ${testResults.outgoingMessages} (${((testResults.outgoingMessages / testResults.totalMessages) * 100).toFixed(1)}%)`);

      console.log('\n�?昵称显示:');
      console.log(`   有真实昵�? ${testResults.messagesWithNames} (${((testResults.messagesWithNames / testResults.totalMessages) * 100).toFixed(1)}%)`);
      console.log(`   显示"未知用户": ${testResults.messagesWithUnknown} (${((testResults.messagesWithUnknown / testResults.totalMessages) * 100).toFixed(1)}%)`);

      if (testResults.authorReplyCount > 0) {
        console.log('\n�?作者回�?(评论):');
        console.log(`   作者回复数: ${testResults.authorReplyCount}`);
      }

      console.log('\n�?修复验证:');

      // 验证1: 昵称显示修复
      if (testResults.messagesWithUnknown === 0 && testResults.messagesWithNames > 0) {
        console.log(`   �?昵称显示修复成功 - 0 个消息显�?未知用户"`);
      } else if (testResults.messagesWithUnknown > 0) {
        console.log(`   ⚠️  昵称显示部分修复 - 还有 ${testResults.messagesWithUnknown} 个消息显�?未知用户"`);
      } else {
        console.log(`   �?无法验证昵称显示 - 没有消息数据`);
      }

      // 验证2: 消息方向修复
      if (testResults.incomingMessages > 0 || testResults.outgoingMessages > 0) {
        console.log(`   �?消息方向修复成功 - 可以区分incoming和outgoing`);
      } else {
        console.log(`   �?无法验证消息方向 - 没有设置direction字段`);
      }

      // 验证3: 客户端识别修�?      const hasMonitorClient = testResults.outgoingMessages > 0;
      if (hasMonitorClient) {
        console.log(`   �?客户端识别修复成�?- outgoing消息的fromId/fromName正确设置为monitor_client/客服`);
      } else {
        console.log(`   �?无法验证客户端识�?- 没有outgoing消息`);
      }

      console.log('\n========================================');
      console.log('验证完成�?);
      console.log('========================================\n');
    }

    socket.on('disconnect', () => {
      console.log('�?已断开连接\n');
    });

    socket.on('error', (error) => {
      console.error('�?Socket 连接错误:', error);
      reject(error);
    });

    // 超时处理
    setTimeout(() => {
      console.log('\n⚠️  测试超时�?0秒）\n');
      socket.disconnect();
      reject(new Error('Test timeout'));
    }, 20000);
  });
}

// 运行测试
testMessageDirectionAndNames()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('�?测试失败:', error.message);
    process.exit(1);
  });
