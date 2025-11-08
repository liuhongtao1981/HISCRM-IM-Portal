/**
 * 检查内存中的会话数�? */

const https = require('http');

const API_URL = 'http://localhost:3000/api/v1/cache/conversations?account_id=acc-98296c87-2e42-447a-9d8b-8be008ddb6e4&limit=50';

https.get(API_URL, (res) => {
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

      console.log('\n╔═══════════════════════════════════════════════════════�?);
      console.log('�? 内存中的会话数据（Cache Conversations�?             �?);
      console.log('╚═══════════════════════════════════════════════════════╝\n');

      console.log(`总计: ${data.pagination.total} 个会话\n`);

      data.data.forEach((conv, index) => {
        const time = new Date(conv.last_message_time * 1000);
        const formattedTime = `${time.getMonth() + 1}/${time.getDate()}`;

        console.log(`${index + 1}. ${conv.nickname || conv.user_id}`);
        console.log(`   用户ID: ${conv.user_id}`);
        console.log(`   最后消息时�? ${formattedTime} (${conv.last_message_time})`);
        console.log(`   未读�? ${conv.unread_count || 0}`);
        console.log('');
      });

      console.log('═══════════════════════════════════════════════════════\n');
    } catch (error) {
      console.error('解析失败:', error.message);
      process.exit(1);
    }
  });
}).on('error', (error) => {
  console.error('请求失败:', error.message);
  process.exit(1);
});
