/**
 * 检查评论的 contentId 映射关系
 * 验证评论�?contentId 是否与作品的 contentId 匹配
 */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

async function checkContentIdMapping() {
  console.log('========================================');
  console.log('检查评�?contentId 映射关系');
  console.log('========================================\n');

  return new Promise((resolve, reject) => {
    const socket = io(MASTER_URL, {
      transports: ['websocket'],
      reconnection: false,
    });

    let allTopics = [];
    let topicsWithComments = [];

    socket.on('connect', () => {
      console.log('�?已连接到 Master\n');

      socket.emit('monitor:register', {
        clientId: 'content-id-checker',
        clientType: 'monitor',
      });
    });

    socket.on('monitor:registered', (data) => {
      console.log(`�?注册成功\n`);
      socket.emit('monitor:request_channels');
    });

    socket.on('monitor:channels', (data) => {
      const { channels } = data;
      if (channels.length > 0) {
        const channelId = channels[0].id;
        socket.emit('monitor:request_topics', { channelId });
      }
    });

    socket.on('monitor:topics', (data) => {
      const { topics } = data;
      allTopics = topics;

      console.log(`收到 ${topics.length} 个主题\n`);

      // 找到有评论的主题
      topicsWithComments = topics.filter(t =>
        t.description !== '私信会话' && t.messageCount > 0
      );

      console.log(`找到 ${topicsWithComments.length} 个有评论的主�?\n`);

      topicsWithComments.forEach((topic, index) => {
        console.log(`[${index + 1}] ${topic.title.substring(0, 40)}...`);
        console.log(`    ID: ${topic.id}`);
        console.log(`    类型: ${typeof topic.id}`);
        console.log(`    messageCount: ${topic.messageCount}`);
      });
      console.log();

      // 请求所有有评论主题的消�?      testNextTopic(0);
    });

    let currentTopicIndex = 0;
    const messageResults = [];

    function testNextTopic(index) {
      if (index >= topicsWithComments.length) {
        // 所有测试完�?        printResults();
        socket.disconnect();
        resolve();
        return;
      }

      const topic = topicsWithComments[index];
      console.log(`\n[测试 ${index + 1}/${topicsWithComments.length}] 请求主题 "${topic.title.substring(0, 30)}..." 的消�?..`);
      console.log(`  主题 ID: ${topic.id}`);
      console.log(`  预期评论�? ${topic.messageCount}`);

      currentTopicIndex = index;
      socket.emit('monitor:request_messages', { topicId: topic.id });
    }

    socket.on('monitor:messages', (data) => {
      const { topicId, messages } = data;
      const topic = topicsWithComments[currentTopicIndex];

      console.log(`  实际返回: ${messages.length} 条消息`);

      if (messages.length > 0) {
        console.log(`  �?成功获取评论！`);
        messages.forEach((msg, i) => {
          console.log(`    [${i + 1}] ${msg.fromName}: ${msg.content.substring(0, 20)}`);
          console.log(`        commentId: ${msg.id}`);
        });
      } else {
        console.log(`  �?未获取到评论（但 messageCount = ${topic.messageCount}）`);
      }

      messageResults.push({
        topicId,
        expectedCount: topic.messageCount,
        actualCount: messages.length,
        success: messages.length > 0,
      });

      // 测试下一�?      setTimeout(() => testNextTopic(currentTopicIndex + 1), 100);
    });

    function printResults() {
      console.log('\n========================================');
      console.log('映射关系检查结�?);
      console.log('========================================\n');

      const successCount = messageResults.filter(r => r.success).length;
      const totalCount = messageResults.length;

      console.log(`总测试数: ${totalCount}`);
      console.log(`成功获取: ${successCount}`);
      console.log(`失败获取: ${totalCount - successCount}`);
      console.log(`成功�? ${(successCount / totalCount * 100).toFixed(1)}%\n`);

      console.log('详细结果:');
      messageResults.forEach((result, index) => {
        const status = result.success ? '�? : '�?;
        console.log(`${status} 主题 ${index + 1}: 期望 ${result.expectedCount} 条，实际 ${result.actualCount} 条`);
      });

      if (successCount < totalCount) {
        console.log('\n⚠️  存在映射问题�?);
        console.log('可能原因:');
        console.log('1. comment.contentId �?topic.id 的数据类型不匹配（String vs Number�?);
        console.log('2. comment.contentId 的值与 content.contentId 不一�?);
        console.log('3. DataStore 中的 comments Map �?key �?contentId 不对�?);
      } else {
        console.log('\n�?所有映射关系正确！');
      }
    }

    socket.on('disconnect', () => {
      console.log('\n�?已断开连接\n');
    });

    socket.on('error', (error) => {
      console.error('�?Socket 连接错误:', error);
      reject(error);
    });

    setTimeout(() => {
      console.log('\n⚠️  测试超时�?0秒）\n');
      socket.disconnect();
      reject(new Error('Test timeout'));
    }, 30000);
  });
}

checkContentIdMapping()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('�?测试失败:', error.message);
    process.exit(1);
  });
