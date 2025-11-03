/**
 * 检查 Master 内存中的会话数据
 */

const http = require('http');

const API_URL = 'http://localhost:3000/api/v1/cache/conversations?account_id=acc-98296c87-2e42-447a-9d8b-8be008ddb6e4&limit=50';

http.get(API_URL, (res) => {
  let rawData = '';

  res.on('data', (chunk) => {
    rawData += chunk;
  });

  res.on('end', () => {
    try {
      const data = JSON.parse(rawData);

      if (!data.success || !data.data) {
        console.error('获取失败:', data);
        process.exit(1);
      }

      console.log('\n╔═══════════════════════════════════════════════════════╗');
      console.log('║  Master 内存中的会话数据（Cache Conversations）       ║');
      console.log('╚═══════════════════════════════════════════════════════╝\n');

      console.log(`总计: ${data.pagination.total} 个会话\n`);

      data.data.forEach((conv, index) => {
        const date = new Date(conv.last_message_time * 1000);
        const formattedTime = `${date.getMonth() + 1}/${date.getDate()}`;

        console.log(`${index + 1}. ${conv.user_name || conv.user_id.substring(0, 30)}`);
        console.log(`   用户ID: ${conv.user_id.substring(0, 40)}...`);
        console.log(`   最后消息: ${formattedTime} (${date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })})`);
        console.log(`   时间戳: ${conv.last_message_time}`);
        console.log(`   未读数: ${conv.unread_count || 0}`);
        console.log('');
      });

      console.log('═══════════════════════════════════════════════════════\n');

      // 检查消息数据
      console.log('正在检查消息数据...\n');

      const messagesUrl = 'http://localhost:3000/api/v1/cache/messages?account_id=acc-98296c87-2e42-447a-9d8b-8be008ddb6e4&limit=50';

      http.get(messagesUrl, (res) => {
        let rawData = '';

        res.on('data', (chunk) => {
          rawData += chunk;
        });

        res.on('end', () => {
          try {
            const messagesData = JSON.parse(rawData);

            console.log('╔═══════════════════════════════════════════════════════╗');
            console.log('║  Master 内存中的消息数据（Cache Messages）            ║');
            console.log('╚═══════════════════════════════════════════════════════╝\n');

            console.log(`总计: ${messagesData.pagination.total} 条消息\n`);

            // 按会话分组统计
            const messagesByConv = {};
            messagesData.data.forEach(msg => {
              if (!messagesByConv[msg.conversation_id]) {
                messagesByConv[msg.conversation_id] = [];
              }
              messagesByConv[msg.conversation_id].push(msg);
            });

            console.log(`涉及会话数: ${Object.keys(messagesByConv).length} 个\n`);

            // 显示每个会话的消息数
            Object.keys(messagesByConv).forEach((convId, index) => {
              const messages = messagesByConv[convId];
              const conv = data.data.find(c => c.conversation_id === convId);

              console.log(`${index + 1}. ${conv ? conv.user_name : convId.substring(0, 30)}`);
              console.log(`   消息数: ${messages.length}`);
              console.log(`   最新消息: ${new Date(messages[0].created_at * 1000).toLocaleString('zh-CN')}`);
              console.log('');
            });

            console.log('═══════════════════════════════════════════════════════\n');
          } catch (error) {
            console.error('解析消息数据失败:', error.message);
          }
        });
      }).on('error', (error) => {
        console.error('请求消息数据失败:', error.message);
      });

    } catch (error) {
      console.error('解析失败:', error.message);
      process.exit(1);
    }
  });
}).on('error', (error) => {
  console.error('请求失败:', error.message);
  process.exit(1);
});
