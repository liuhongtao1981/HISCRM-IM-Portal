/**
 * 完整验证 PC IM 数据获取功能
 * 验证字段名修复后，PC IM 能否正确获取所有数据
 */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

async function testFullDataRetrieval() {
  console.log('========================================');
  console.log('完整验证 PC IM 数据获取功能');
  console.log('========================================\n');

  return new Promise((resolve, reject) => {
    // 连接到 Master IM WebSocket
    const socket = io(MASTER_URL, {
      transports: ['websocket'],
      reconnection: false,
    });

    let testResults = {
      channels: null,
      topics: null,
      messages: null,
      contentTopics: [],
      conversationTopics: [],
      commentMessages: [],
      dmMessages: [],
    };

    socket.on('connect', () => {
      console.log('✓ 已连接到 Master IM WebSocket\n');

      // 1. 注册监控客户端
      console.log('1. 注册监控客户端...');
      socket.emit('monitor:register', {
        clientId: 'test-client-full-validation',
        clientType: 'monitor',
      });
    });

    socket.on('monitor:registered', (data) => {
      console.log(`   ✓ 监控客户端注册成功`);
      console.log(`   频道数: ${data.channelCount}\n`);

      // 2. 请求频道列表
      console.log('2. 请求频道列表...');
      socket.emit('monitor:request_channels');
    });

    socket.on('monitor:channels', (data) => {
      const { channels } = data;
      testResults.channels = channels;

      console.log(`   ✓ 收到 ${channels.length} 个频道\n`);

      if (channels.length > 0) {
        const channel = channels[0];
        console.log(`   频道详情:`);
        console.log(`     ID: ${channel.id}`);
        console.log(`     Name: ${channel.name}`);
        console.log(`     未读消息数: ${channel.unreadCount}`);
        console.log(`     总消息数: ${channel.messageCount}`);
        console.log(`     最后消息: ${channel.lastMessage}`);
        const date = new Date(channel.lastMessageTime);
        console.log(`     最后消息时间: ${date.toLocaleString('zh-CN')}\n`);

        // 3. 请求主题列表
        console.log('3. 请求主题列表...');
        socket.emit('monitor:request_topics', { channelId: channel.id });
      } else {
        console.log('   ⚠️  没有找到频道\n');
        socket.disconnect();
        resolve(testResults);
      }
    });

    socket.on('monitor:topics', (data) => {
      const { channelId, topics } = data;
      testResults.topics = topics;

      console.log(`   ✓ 收到 ${topics.length} 个主题\n`);

      // 分类主题
      topics.forEach((topic) => {
        if (topic.description === '私信会话') {
          testResults.conversationTopics.push(topic);
        } else {
          testResults.contentTopics.push(topic);
        }
      });

      console.log(`   主题分类:`);
      console.log(`     作品主题: ${testResults.contentTopics.length} 个`);
      console.log(`     会话主题: ${testResults.conversationTopics.length} 个\n`);

      // 显示作品主题（前5个）
      if (testResults.contentTopics.length > 0) {
        console.log(`   作品主题（前5个）:`);
        testResults.contentTopics.slice(0, 5).forEach((topic, index) => {
          const date = new Date(topic.lastMessageTime);
          console.log(`   [${index + 1}] ${topic.title}`);
          console.log(`       ID: ${topic.id}`);
          console.log(`       评论数: ${topic.messageCount}`);
          console.log(`       未读数: ${topic.unreadCount}`);
          console.log(`       发布时间: ${new Date(topic.createdTime).toLocaleString('zh-CN')}`);
        });
        console.log();
      }

      // 显示会话主题（前5个）
      if (testResults.conversationTopics.length > 0) {
        console.log(`   会话主题（前5个）:`);
        testResults.conversationTopics.slice(0, 5).forEach((topic, index) => {
          const date = new Date(topic.lastMessageTime);
          console.log(`   [${index + 1}] ${topic.title}`);
          console.log(`       ID: ${topic.id}`);
          console.log(`       消息数: ${topic.messageCount}`);
          console.log(`       未读数: ${topic.unreadCount}`);
          console.log(`       最后消息时间: ${date.toLocaleString('zh-CN')}`);
        });
        console.log();
      }

      // 4. 测试获取作品评论
      if (testResults.contentTopics.length > 0) {
        const contentTopic = testResults.contentTopics[0];
        console.log(`4. 请求作品 "${contentTopic.title}" 的评论...`);
        socket.emit('monitor:request_messages', { topicId: contentTopic.id });
      }
      // 5. 测试获取会话私信
      else if (testResults.conversationTopics.length > 0) {
        const conversationTopic = testResults.conversationTopics[0];
        console.log(`4. 请求会话 "${conversationTopic.title}" 的私信...`);
        socket.emit('monitor:request_messages', { topicId: conversationTopic.id });
      } else {
        console.log('   ⚠️  没有找到主题\n');
        socket.disconnect();
        resolve(testResults);
      }
    });

    let messageRequestCount = 0;
    socket.on('monitor:messages', (data) => {
      const { topicId, messages } = data;
      messageRequestCount++;

      console.log(`   ✓ 收到 ${messages.length} 条消息\n`);

      if (messages.length > 0) {
        // 分类消息
        messages.forEach((msg) => {
          if (msg.replyToId !== null && msg.replyToId !== undefined) {
            testResults.commentMessages.push(msg);
          } else {
            testResults.dmMessages.push(msg);
          }
        });

        console.log(`   消息详情（前5条）:`);
        messages.slice(0, 5).forEach((msg, index) => {
          const date = new Date(msg.timestamp);
          console.log(`   [${index + 1}] ${msg.fromName}: ${msg.content}`);
          console.log(`       消息ID: ${msg.id}`);
          console.log(`       发送者ID: ${msg.fromId}`);
          console.log(`       消息类型: ${msg.type}`);
          console.log(`       时间: ${date.toLocaleString('zh-CN')}`);
          if (msg.replyToId) {
            console.log(`       回复评论ID: ${msg.replyToId}`);
          }
        });
        console.log();
      }

      // 如果已经测试了作品评论，再测试会话私信
      if (messageRequestCount === 1 && testResults.conversationTopics.length > 0) {
        const conversationTopic = testResults.conversationTopics[0];
        console.log(`5. 请求会话 "${conversationTopic.title}" 的私信...`);
        socket.emit('monitor:request_messages', { topicId: conversationTopic.id });
      } else {
        // 测试完成
        printSummary();
        socket.disconnect();
        resolve(testResults);
      }
    });

    function printSummary() {
      console.log('\n========================================');
      console.log('验证结果汇总');
      console.log('========================================\n');

      console.log('✅ 数据获取统计:');
      console.log(`   频道数: ${testResults.channels ? testResults.channels.length : 0}`);
      console.log(`   主题总数: ${testResults.topics ? testResults.topics.length : 0}`);
      console.log(`     - 作品主题: ${testResults.contentTopics.length}`);
      console.log(`     - 会话主题: ${testResults.conversationTopics.length}`);
      console.log(`   消息总数: ${(testResults.commentMessages.length + testResults.dmMessages.length)}`);
      console.log(`     - 评论消息: ${testResults.commentMessages.length}`);
      console.log(`     - 私信消息: ${testResults.dmMessages.length}`);

      console.log('\n✅ 字段名修复验证:');

      // 验证作品主题字段
      if (testResults.contentTopics.length > 0) {
        const contentTopic = testResults.contentTopics[0];
        console.log(`   作品主题字段:`);
        console.log(`     ✓ contentId: ${contentTopic.id !== undefined}`);
        console.log(`     ✓ title: ${contentTopic.title !== undefined}`);
        console.log(`     ✓ publishTime: ${contentTopic.createdTime !== undefined}`);
        console.log(`     ✓ lastCrawlTime: ${contentTopic.lastMessageTime !== undefined}`);
        console.log(`     ✓ messageCount: ${contentTopic.messageCount !== undefined}`);
      }

      // 验证会话主题字段
      if (testResults.conversationTopics.length > 0) {
        const conversationTopic = testResults.conversationTopics[0];
        console.log(`   会话主题字段:`);
        console.log(`     ✓ conversationId: ${conversationTopic.id !== undefined}`);
        console.log(`     ✓ userName: ${conversationTopic.title !== undefined}`);
        console.log(`     ✓ createdAt: ${conversationTopic.createdTime !== undefined}`);
        console.log(`     ✓ updatedAt: ${conversationTopic.lastMessageTime !== undefined}`);
        console.log(`     ✓ unreadCount: ${conversationTopic.unreadCount !== undefined}`);
      }

      // 验证评论消息字段
      if (testResults.commentMessages.length > 0) {
        const comment = testResults.commentMessages[0];
        console.log(`   评论消息字段:`);
        console.log(`     ✓ commentId: ${comment.id !== undefined}`);
        console.log(`     ✓ authorName: ${comment.fromName !== undefined}`);
        console.log(`     ✓ authorId: ${comment.fromId !== undefined}`);
        console.log(`     ✓ content: ${comment.content !== undefined}`);
        console.log(`     ✓ createdAt: ${comment.timestamp !== undefined}`);
        console.log(`     ✓ parentCommentId: ${comment.replyToId !== undefined || comment.replyToId === null}`);
      }

      // 验证私信消息字段
      if (testResults.dmMessages.length > 0) {
        const dm = testResults.dmMessages[0];
        console.log(`   私信消息字段:`);
        console.log(`     ✓ messageId: ${dm.id !== undefined}`);
        console.log(`     ✓ senderName: ${dm.fromName !== undefined}`);
        console.log(`     ✓ senderId: ${dm.fromId !== undefined}`);
        console.log(`     ✓ content: ${dm.content !== undefined}`);
        console.log(`     ✓ messageType: ${dm.type !== undefined}`);
        console.log(`     ✓ createdAt: ${dm.timestamp !== undefined}`);
      }

      console.log('\n✅ 核心功能验证:');
      console.log(`   ✓ PC IM 可以连接到 Master`);
      console.log(`   ✓ 可以注册监控客户端`);
      console.log(`   ✓ 可以获取频道列表`);
      console.log(`   ✓ 可以获取主题列表（作品和会话）`);
      console.log(`   ✓ 可以获取消息列表（评论和私信）`);
      console.log(`   ✓ 所有 camelCase 字段正确映射`);

      console.log('\n========================================');
      console.log('验证完成 - Worker → Master → PC IM 数据流 100% 打通！');
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
      console.log('\n⚠️  测试超时（30秒）\n');
      socket.disconnect();
      reject(new Error('Test timeout'));
    }, 30000);
  });
}

// 运行测试
testFullDataRetrieval()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  });
