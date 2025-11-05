/**
 * 检查 Master 内存中 DataStore 的账户数据
 */
const axios = require('axios');

const MASTER_URL = 'http://localhost:3000';

async function checkDataStore() {
  console.log('=== 检查 Master DataStore 中的账户数据 ===\n');

  try {
    // 获取 DataStore 状态
    const response = await axios.get(`${MASTER_URL}/api/datastore/status`);

    console.log('DataStore 状态:');
    console.log(`  账户数量: ${response.data.accountCount || 0}`);
    console.log(`  总消息数: ${response.data.totalMessages || 0}`);
    console.log(`  总评论数: ${response.data.totalComments || 0}`);
    console.log('');

    if (response.data.accounts) {
      console.log('账户列表:');
      response.data.accounts.forEach((acc, index) => {
        console.log(`  ${index + 1}. ${acc.accountId || acc.id}`);
        console.log(`     平台: ${acc.platform || 'unknown'}`);
        console.log(`     最后更新: ${acc.lastUpdate ? new Date(acc.lastUpdate).toLocaleString('zh-CN') : 'null'}`);
        console.log('');
      });
    }

  } catch (error) {
    if (error.response) {
      console.error(`❌ API 错误 (${error.response.status}): ${error.response.data?.error || error.message}`);
    } else if (error.request) {
      console.error('❌ 无法连接到 Master 服务器');
      console.error('   请确保 Master 正在运行在 http://localhost:3000');
    } else {
      console.error('❌ 错误:', error.message);
    }
  }
}

checkDataStore();
