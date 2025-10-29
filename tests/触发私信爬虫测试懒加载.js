/**
 * 触发私信爬虫测试懒加载
 *
 * 通过 API 手动触发一次私信爬虫，验证 DataManager 懒加载
 */

const http = require('http');

console.log('═══════════════════════════════════════════════════════');
console.log('  触发私信爬虫测试懒加载');
console.log('═══════════════════════════════════════════════════════\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log(`📋 目标账户: ${accountId}`);
console.log(`🎯 目标: 触发私信爬虫，验证 DataManager 懒加载\n`);

// 构造请求数据
const postData = JSON.stringify({
  accountId: accountId,
  taskType: 'crawl_direct_messages'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/worker/trigger-task',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('📤 发送请求到 Master...');
console.log(`   POST http://localhost:3000/api/worker/trigger-task`);
console.log(`   Body: ${postData}\n`);

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`📥 响应状态: ${res.statusCode}`);
    console.log(`📥 响应数据: ${data}\n`);

    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('✅ 私信爬虫任务已触发！');
      console.log('\n下一步：');
      console.log('  1. 等待 10-15 秒让爬虫执行');
      console.log('  2. 运行: node tests/测试懒加载DataManager.js');
      console.log('  3. 检查是否出现 "Auto-creating DataManager" 日志\n');
    } else {
      console.log('❌ 触发失败，请检查：');
      console.log('  1. Master 服务器是否运行在端口 3000');
      console.log('  2. Worker 是否已连接');
      console.log('  3. 账户 ID 是否正确\n');
    }

    console.log('═══════════════════════════════════════════════════════');
  });
});

req.on('error', (error) => {
  console.error(`❌ 请求失败: ${error.message}`);
  console.error('\n请确保：');
  console.error('  1. Master 服务器正在运行');
  console.error('  2. Master 监听在 localhost:3000\n');
  console.log('═══════════════════════════════════════════════════════');
  process.exit(1);
});

req.write(postData);
req.end();
