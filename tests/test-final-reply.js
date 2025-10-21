const http = require('http');

function makeRequest(body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/replies',
      method: 'POST',
      headers: {'Content-Type': 'application/json'}
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(JSON.parse('{}')) }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  const ts = Date.now();
  const res = await makeRequest({
    request_id: 'verify-api-capture-' + ts,
    account_id: 'acc-40dab768-fee1-4718-b64b-eb3a7c23beac',
    target_type: 'comment',
    target_id: '@j/du7rRFQE76t8pb8rzov81/qyyUYCj+J6spN6Rgi65hkia+W5A7RJEoPQpq6PZlDYg5SHKaINpmyvOJ84Gvsw==',
    reply_content: '验证 API 拦截器是否成功捕获回复响应'
  });
  console.log('Reply ID:', res.reply_id);
  console.log('Status:', res.status);
  console.log('\n等待 Worker 处理...\n');
})();
