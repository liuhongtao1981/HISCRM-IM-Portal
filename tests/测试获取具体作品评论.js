/**
 * 测试获取具体作品的评论消�? * 验证字段名修复后，能否正确获取评论数�? */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

async function testGetComments() {
  console.log('========================================');
  console.log('测试获取具体作品评论');
  console.log('========================================\n');

  return new Promise((resolve, reject) => {
    const socket = io(MASTER_URL, {
      transports: ['websocket'],
      reconnection: false,
    });

    socket.on('connect', () => {
      console.log('�?已连接到 Master IM WebSocket\n');

      // 注册监控客户�?      socket.emit('monitor:register', {
        clientId: 'test-comment-fetcher',
        clientType: 'monitor',
      });
    });

    socket.on('monitor:registered', (data) => {
      console.log(`�?监控客户端注册成功，频道�? ${data.channelCount}\n`);

      // 请求频道列表
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
        resolve();
      }
    });

    socket.on('monitor:topics', (data) => {
      const { topics } = data;
      console.log(`�?收到 ${topics.length} 个主题\n`);

      // 找到有评论的作品主题
      const topicsWithComments = topics.filter(t =>
        t.description !== '私信会话' && t.messageCount > 0
      );

      console.log(`找到 ${topicsWithComments.length} 个有评论的作品主�?\n`);

      if (topicsWithComments.length > 0) {
        // 显示所有有评论的主�?        topicsWithComments.forEach((topic, index) => {
          console.log(`[${index + 1}] ${topic.title.substring(0, 50)}...`);
          console.log(`    ID: ${topic.id}`);
          console.log(`    评论�? ${topic.messageCount}`);
          console.log(`    未读�? ${topic.unreadCount}`);
        });
        console.log();

        // 请求第一个有评论的作品的消息
        const topic = topicsWithComments[0];
        console.log(`正在请求作品 "${topic.title.substring(0, 50)}..." 的评�?..\n`);
        console.log(`主题 ID: ${topic.id}\n`);
        socket.emit('monitor:request_messages', { topicId: topic.id });
      } else {
        console.log('⚠️  没有找到有评论的作品主题\n');
        socket.disconnect();
        resolve();
      }
    });

    socket.on('monitor:messages', (data) => {
      const { topicId, messages } = data;
      console.log(`�?收到 ${messages.length} 条消息\n`);

      if (messages.length > 0) {
        console.log('评论详情:\n');
        messages.forEach((msg, index) => {
          console.log(`[${index + 1}] ${msg.fromName}: ${msg.content}`);
          console.log(`    消息ID: ${msg.id}`);
          console.log(`    发送者ID: ${msg.fromId}`);
          console.log(`    时间: ${new Date(msg.timestamp).toLocaleString('zh-CN')}`);
          if (msg.replyToId) {
            console.log(`    回复评论ID: ${msg.replyToId}`);
          }
          console.log();
        });

        console.log('========================================');
        console.log('�?成功获取评论数据�?);
        console.log('========================================\n');
      } else {
        console.log('========================================');
        console.log('⚠️  未获取到评论数据');
        console.log('可能原因:');
        console.log('1. 评论数据字段名不匹配');
        console.log('2. DataStore 中确实没有该作品的评�?);
        console.log('========================================\n');
      }

      socket.disconnect();
      resolve();
    });

    socket.on('disconnect', () => {
      console.log('�?已断开连接\n');
    });

    socket.on('error', (error) => {
      console.error('�?Socket 连接错误:', error);
      reject(error);
    });

    // 超时处理
    setTimeout(() => {
      console.log('\n⚠️  测试超时�?5秒）\n');
      socket.disconnect();
      reject(new Error('Test timeout'));
    }, 15000);
  });
}

// 运行测试
testGetComments()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('�?测试失败:', error.message);
    process.exit(1);
  });
