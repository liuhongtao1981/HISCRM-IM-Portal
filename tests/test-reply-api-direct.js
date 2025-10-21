const http = require('http');

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  try {
    console.log('Testing comment reply endpoint...\n');

    const replyPayload = {
      request_id: 'test-comment-reply-direct-' + Date.now(),
      account_id: 'acc-40dab768-fee1-4718-b64b-eb3a7c23beac',
      target_type: 'comment',
      target_id: '@j/du7rRFQE76t8pb8rzov81/qyyUYCj+J6spN6Rgi65hkia+W5A7RJEoPQpq6PZlDYg5SHKaINpmyfOJ84Gvsw==',
      reply_content: 'API 直接测试 - 验证回复提交端点',
      context: {
        video_id: 'test_video_id'
      }
    };

    console.log('Sending POST request to /api/v1/replies');
    console.log('Payload:', JSON.stringify(replyPayload, null, 2));
    console.log('');

    const response = await makeRequest('POST', '/api/v1/replies', replyPayload);
    
    console.log('Response Status:', response.status);
    console.log('Response Body:', JSON.stringify(response.body, null, 2));
    
    if (response.body.success && response.body.reply_id) {
      console.log('\n✅ Reply created successfully!');
      console.log('Reply ID:', response.body.reply_id);
      
      // Check if reply was saved to database
      setTimeout(async () => {
        console.log('\nQuerying database for reply...');
        const getResponse = await makeRequest('GET', `/api/v1/replies/${response.body.reply_id}`, null);
        console.log('GET Reply Status:', getResponse.status);
        console.log('GET Reply Body:', JSON.stringify(getResponse.body, null, 2));
      }, 1000);
    } else {
      console.log('\n❌ Reply creation failed');
    }
  } catch (error) {
    console.error('Error:', error);
  }
})();
