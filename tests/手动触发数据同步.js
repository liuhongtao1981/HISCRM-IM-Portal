/**
 * 手动触发 Worker 数据同步测试
 * 通过 HTTP API 触发 Worker 执行数据同步
 */

const http = require('http');

console.log('📡 手动触发 Worker 数据同步...\n');

// 调用 Master API 查询 DataStore 状�?
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/status',
  method: 'GET',
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const status = JSON.parse(data);

      console.log('Master 状态：');
      console.log('  在线 Worker �?', status.data.workers?.online || 0);
      console.log('  �?Worker �?', status.data.workers?.total || 0);
      console.log('\nDataStore 状态：');
      console.log('  总账户数:', status.data.dataStore?.totalAccounts || 0);
      console.log('  总评论数:', status.data.dataStore?.totalComments || 0);
      console.log('  总作品数:', status.data.dataStore?.totalContents || 0);
      console.log('  总会话数:', status.data.dataStore?.totalConversations || 0);
      console.log('  总私信数:', status.data.dataStore?.totalMessages || 0);
      console.log('  最后更�?', status.data.dataStore?.lastUpdate ? new Date(status.data.dataStore.lastUpdate).toLocaleString() : 'N/A');

      console.log('\nDataSync 状态：');
      console.log('  总接收次�?', status.data.dataSync?.totalReceived || 0);
      console.log('  最后接收时�?', status.data.dataSync?.lastReceiveTime ? new Date(status.data.dataSync.lastReceiveTime).toLocaleString() : 'N/A');

      if (status.data.dataSync?.totalReceived > 0) {
        console.log('\n�?Worker 已经推送过数据�?Master�?);
      } else {
        console.log('\n⚠️ Worker 还没有推送数据到 Master');
        console.log('   请等�?Worker 的下一个数据快照周期（�?0秒）');
      }
    } catch (error) {
      console.error('解析响应失败:', error.message);
    }
  });
});

req.on('error', (error) => {
  console.error('请求失败:', error.message);
  console.log('\n请确�?Master 服务器正在运行（端口 3000�?);
});

req.end();
