/**
 * 测试标记已读功能
 *
 * 功能�?
 * 1. 连接 Master IM WebSocket 服务
 * 2. 注册监控客户�?
 * 3. 获取频道�?topics
 * 4. 测试标记评论已读
 * 5. 测试标记私信已读
 * 6. 验证未读数是否正确更�?
 */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

async function testMarkAsRead() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 测试标记已读功能');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 连接�?Master
  const socket = io(MASTER_URL, {
    transports: ['websocket', 'polling']
  });

  return new Promise((resolve, reject) => {
    let channels = [];
    let testChannelId = null;
    let commentTopicId = null;
    let privateTopicId = null;

    socket.on('connect', () => {
      console.log('�?已连接到 Master IM WebSocket:', MASTER_URL);

      // 注册监控客户�?
      socket.emit('monitor:register', {
        clientId: 'test-client-mark-read',
        clientType: 'monitor'
      });
    });

    socket.on('monitor:registered', (data) => {
      console.log('�?监控客户端注册成�?);
      console.log(`   客户端ID: ${data.clientId}`);
      console.log(`   频道数量: ${data.channelCount}\n`);
    });

    socket.on('monitor:channels', (data) => {
      channels = data.channels;
      console.log(`📡 收到频道列表: ${channels.length} 个频道`);

      if (channels.length === 0) {
        console.log('⚠️  没有可用的频�?);
        socket.disconnect();
        resolve();
        return;
      }

      // 选择第一个频道进行测�?
      testChannelId = channels[0].id;
      console.log(`\n🎯 选择测试频道: ${channels[0].accountName} (${testChannelId})`);
      console.log(`   未读�? ${channels[0].unreadCount}\n`);

      // 请求 topics
      socket.emit('monitor:request_topics', { channelId: testChannelId });
    });

    socket.on('monitor:topics', (data) => {
      console.log(`📡 收到 topics: ${data.topics.length} 个\n`);

      // 分类 topics
      const commentTopics = data.topics.filter(t => !t.isPrivate);
      const privateTopics = data.topics.filter(t => t.isPrivate);

      console.log(`   作品评论: ${commentTopics.length} 个`);
      console.log(`   私信会话: ${privateTopics.length} 个\n`);

      // 找到有未读的作品和私�?
      const unreadCommentTopic = commentTopics.find(t => t.unreadCount > 0);
      const unreadPrivateTopic = privateTopics.find(t => t.unreadCount > 0);

      if (unreadCommentTopic) {
        commentTopicId = unreadCommentTopic.id;
        console.log(`🔍 找到未读评论作品: ${unreadCommentTopic.title}`);
        console.log(`   未读�? ${unreadCommentTopic.unreadCount}`);
        console.log(`   作品ID: ${commentTopicId}\n`);
      }

      if (unreadPrivateTopic) {
        privateTopicId = unreadPrivateTopic.id;
        console.log(`🔍 找到未读私信会话: ${unreadPrivateTopic.title}`);
        console.log(`   未读�? ${unreadPrivateTopic.unreadCount}`);
        console.log(`   会话ID: ${privateTopicId}\n`);
      }

      // 开始测试标记已�?
      if (commentTopicId) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📝 测试 1: 标记作品评论已读');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        socket.emit('monitor:mark_topic_as_read', {
          channelId: testChannelId,
          topicId: commentTopicId
        });
      } else if (privateTopicId) {
        // 如果没有未读评论，直接测试私�?
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📝 测试 2: 标记私信会话已读');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        socket.emit('monitor:mark_conversation_as_read', {
          channelId: testChannelId,
          conversationId: privateTopicId
        });
      } else {
        console.log('⚠️  没有未读消息可测�?);
        socket.disconnect();
        resolve();
      }
    });

    // 监听标记已读响应
    socket.on('monitor:mark_topic_as_read_response', (data) => {
      console.log('�?标记作品评论已读 - 响应:');
      console.log(`   成功: ${data.success}`);
      console.log(`   标记数量: ${data.count}`);
      console.log(`   作品ID: ${data.topicId}`);
      console.log(`   频道ID: ${data.channelId}`);
      console.log(`   已读时间: ${new Date(data.read_at * 1000).toLocaleString()}\n`);

      // 如果有私信，继续测试私信标记已读
      if (privateTopicId) {
        setTimeout(() => {
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('📝 测试 2: 标记私信会话已读');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

          socket.emit('monitor:mark_conversation_as_read', {
            channelId: testChannelId,
            conversationId: privateTopicId
          });
        }, 1000);
      } else {
        // 等待一下，看是否收到更新的 topics
        setTimeout(() => {
          socket.disconnect();
          resolve();
        }, 2000);
      }
    });

    socket.on('monitor:mark_conversation_as_read_response', (data) => {
      console.log('�?标记私信会话已读 - 响应:');
      console.log(`   成功: ${data.success}`);
      console.log(`   标记数量: ${data.count}`);
      console.log(`   会话ID: ${data.conversationId}`);
      console.log(`   频道ID: ${data.channelId}`);
      console.log(`   已读时间: ${new Date(data.read_at * 1000).toLocaleString()}\n`);

      // 等待一下，看是否收到更新的 topics
      setTimeout(() => {
        socket.disconnect();
        resolve();
      }, 2000);
    });

    // 监听广播�?topics 更新
    socket.on('monitor:topics', (data) => {
      if (data.channelId === testChannelId) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📡 收到更新后的 topics');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // 统计未读�?
        let totalUnread = 0;
        let commentUnread = 0;
        let privateUnread = 0;

        data.topics.forEach(topic => {
          totalUnread += topic.unreadCount || 0;
          if (topic.isPrivate) {
            privateUnread += topic.unreadCount || 0;
          } else {
            commentUnread += topic.unreadCount || 0;
          }

          // 如果是刚刚标记已读的 topic，显示详�?
          if (topic.id === commentTopicId || topic.id === privateTopicId) {
            console.log(`�?${topic.isPrivate ? '私信会话' : '作品'}: ${topic.title}`);
            console.log(`   未读�? ${topic.unreadCount} (应该�?0)`);
          }
        });

        console.log(`\n📊 更新后的总未读数:`);
        console.log(`   作品评论: ${commentUnread}`);
        console.log(`   私信: ${privateUnread}`);
        console.log(`   总计: ${totalUnread}\n`);
      }
    });

    socket.on('error', (error) => {
      console.error('�?WebSocket 错误:', error);
      socket.disconnect();
      reject(error);
    });

    socket.on('disconnect', () => {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🏁 测试完成，连接已断开');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    });

    // 超时处理
    setTimeout(() => {
      console.log('\n⏱️  测试超时�?0秒）');
      socket.disconnect();
      resolve();
    }, 30000);
  });
}

// 运行测试
testMarkAsRead()
  .then(() => {
    console.log('�?测试脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('�?测试脚本执行失败:', error);
    process.exit(1);
  });
