/**
 * 验证昵称修复 - 检查 Worker 是否正确提取并存储了发送者昵称
 *
 * 修复内容:
 * - crawl-direct-messages-v2.js:191 从强制 'Unknown' 改为使用 React Fiber 提取的名称
 *
 * 预期结果:
 * - Worker DataStore 中的消息应包含真实的 senderName (如 "苏苏", "金伟")
 * - IM 客户端显示的消息发送者不再是 "Unknown"
 */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

async function testNicknamesFix() {
  console.log('========================================');
  console.log('验证昵称修复');
  console.log('========================================\n');

  return new Promise((resolve, reject) => {
    const socket = io(MASTER_URL, {
      transports: ['websocket'],
      reconnection: false,
    });

    let testResults = {
      totalMessages: 0,
      messagesWithRealNames: 0,
      messagesWithUnknown: 0,
      uniqueNames: new Set(),
      sampleMessages: [],
    };

    socket.on('connect', () => {
      console.log('✓ 已连接到 Master IM WebSocket\n');

      socket.emit('monitor:register', {
        clientId: 'test-nicknames-fix',
        clientType: 'monitor',
      });
    });

    socket.on('monitor:registered', (data) => {
      console.log(`✓ 监控客户端注册成功，频道数: ${data.channelCount}\n`);
      socket.emit('monitor:request_channels');
    });

    socket.on('monitor:channels', (data) => {
      const { channels } = data;
      console.log(`✓ 收到 ${channels.length} 个频道\n`);

      if (channels.length > 0) {
        const channelId = channels[0].id;
        console.log(`正在请求频道 "${channelId}" 的主题...\n`);
        socket.emit('monitor:request_topics', { channelId });
      } else {
        console.log('⚠️  没有找到频道\n');
        socket.disconnect();
        resolve(testResults);
      }
    });

    socket.on('monitor:topics', (data) => {
      const { topics } = data;
      console.log(`✓ 收到 ${topics.length} 个主题\n`);

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
        console.log(`正在请求主题 "${topic.title.substring(0, 50)}..." 的消息...`);
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

      console.log(`✓ 收到 ${messages.length} 条消息\n`);

      if (messages.length > 0) {
        console.log('昵称分析:\n');
        console.log('=' .repeat(80) + '\n');

        messages.forEach((msg, index) => {
          // 统计昵称
          if (msg.fromName && msg.fromName !== 'Unknown' && msg.fromName !== '未知用户' && msg.fromName !== '客服') {
            testResults.messagesWithRealNames++;
            testResults.uniqueNames.add(msg.fromName);
          } else if (msg.fromName === 'Unknown' || msg.fromName === '未知用户') {
            testResults.messagesWithUnknown++;
          }

          // 收集样本（前10条）
          if (index < 10) {
            testResults.sampleMessages.push({
              index: index + 1,
              fromName: msg.fromName,
              fromId: msg.fromId,
              content: msg.content.substring(0, 30),
              timestamp: new Date(msg.timestamp).toLocaleString('zh-CN'),
            });
          }
        });

        // 打印样本消息
        console.log('样本消息（前10条）:\n');
        testResults.sampleMessages.forEach((msg) => {
          const status = msg.fromName === 'Unknown' || msg.fromName === '未知用户' ? '❌' : '✅';
          console.log(`${status} [${msg.index}] ${msg.fromName}`);
          console.log(`    内容: ${msg.content}${msg.content.length >= 30 ? '...' : ''}`);
          console.log(`    时间: ${msg.timestamp}`);
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
      console.log('验证结果汇总');
      console.log('========================================\n');

      console.log('✅ 消息统计:');
      console.log(`   总消息数: ${testResults.totalMessages}`);
      console.log(`   有真实昵称: ${testResults.messagesWithRealNames} (${((testResults.messagesWithRealNames / testResults.totalMessages) * 100).toFixed(1)}%)`);
      console.log(`   显示"Unknown": ${testResults.messagesWithUnknown} (${((testResults.messagesWithUnknown / testResults.totalMessages) * 100).toFixed(1)}%)`);

      console.log('\n✅ 唯一昵称列表:');
      const uniqueNamesArray = Array.from(testResults.uniqueNames);
      if (uniqueNamesArray.length > 0) {
        uniqueNamesArray.forEach((name, idx) => {
          console.log(`   ${idx + 1}. ${name}`);
        });
      } else {
        console.log('   (无真实昵称)');
      }

      console.log('\n✅ 修复验证:');

      if (testResults.messagesWithUnknown === 0 && testResults.messagesWithRealNames > 0) {
        console.log('   ✅✅✅ 昵称修复成功 - 所有消息都有真实昵称!');
      } else if (testResults.messagesWithUnknown < testResults.totalMessages * 0.5) {
        console.log(`   ⚠️  昵称部分修复 - 还有 ${testResults.messagesWithUnknown} 条消息显示"Unknown" (${((testResults.messagesWithUnknown / testResults.totalMessages) * 100).toFixed(1)}%)`);
      } else {
        console.log(`   ❌ 昵称修复失败 - 大部分消息仍显示"Unknown" (${testResults.messagesWithUnknown}/${testResults.totalMessages})`);
      }

      console.log('\n========================================');
      console.log('验证完成！');
      console.log('========================================\n');
    }

    socket.on('disconnect', () => {
      console.log('✓ 已断开连接\n');
    });

    socket.on('error', (error) => {
      console.error('❌ Socket 连接错误:', error);
      reject(error);
    });

    // 超时处理
    setTimeout(() => {
      console.log('\n⚠️  测试超时（20秒）\n');
      socket.disconnect();
      reject(new Error('Test timeout'));
    }, 20000);
  });
}

// 运行测试
testNicknamesFix()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  });
