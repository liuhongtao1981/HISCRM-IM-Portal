const http = require('http');

function makeRequest(body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/replies',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: 'Failed to parse response', raw: data });
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  const replyPayload = {
    request_id: 'test-api-intercept-' + Date.now(),
    account_id: 'acc-40dab768-fee1-4718-b64b-eb3a7c23beac',
    target_type: 'comment',
    target_id: '@j/du7rRFQE76t8pb8rzov81/qyyUYCj+J6spN6Rgi65hkia+W5A7RJEoPQpq6PZlDYg5SHKaINpmyfOJ84Gvsw==',
    reply_content: '测试 API 拦截 - 检查是否成功捕获回复响应'
  };

  console.log('发送回复请求...\n');
  const response = await makeRequest(replyPayload);
  console.log('回复 ID:', response.reply_id);
  console.log('状态:', response.status);
  
  // 等待 Worker 处理
  console.log('\n等待 Worker 处理（40 秒）...');
  await new Promise(resolve => setTimeout(resolve, 40000));
  
  console.log('检查回复状态...');
})();
