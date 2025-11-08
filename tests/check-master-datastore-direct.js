/**
 * 直接检�?Master 进程�?DataStore 状�? * 通过读取 Master 日志或使�?HTTP API
 */
const axios = require('axios');

async function checkMaster() {
  console.log('=== 检�?Master 服务器状�?===\n');

  // 检�?Worker 列表
  try {
    const workersRes = await axios.get('http://localhost:3000/api/workers');
    console.log(`�?Workers 数量: ${workersRes.data.data?.length || 0}`);
    if (workersRes.data.data && workersRes.data.data.length > 0) {
      workersRes.data.data.forEach(worker => {
        console.log(`   - ${worker.id}: ${worker.status} (负载: ${worker.assigned_accounts || 0})`);
      });
    }
    console.log('');
  } catch (e) {
    console.log('�?无法获取 Workers 列表:', e.message);
  }

  // 检查账户列�?  try {
    const accountsRes = await axios.get('http://localhost:3000/api/v1/accounts');
    console.log(`�?账户数量: ${accountsRes.data.data?.length || 0}`);
    if (accountsRes.data.data && accountsRes.data.data.length > 0) {
      accountsRes.data.data.forEach(acc => {
        console.log(`   - ${acc.account_name}: ${acc.login_status} (分配�? ${acc.assigned_worker_id || '未分�?})`);
      });
    }
    console.log('');
  } catch (e) {
    console.log('�?无法获取账户列表:', e.message);
  }

  console.log('问题诊断:');
  console.log('如果账户已分配给 Worker �?Worker 不在线，�?DataStore 为空');
  console.log('解决方案: 启动 Worker 进程，或者在 Web Admin 中重新分配账�?);
}

checkMaster();
