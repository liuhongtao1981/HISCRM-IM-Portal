/**
 * 完整性测试 - Worker → Master → IM API 全流程
 *
 * 测试范围：
 * 1. Master 服务器状态检查
 * 2. Worker 连接状态检查
 * 3. DataStore 数据检查
 * 4. IM API 接口测试（5 个接口）
 * 5. 数据一致性验证
 */

const http = require('http');

console.log('==================================================');
console.log('HisCRM-IM 完整性测试');
console.log('测试时间:', new Date().toLocaleString('zh-CN'));
console.log('==================================================\n');

// 测试账户
const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 测试计数器
let testsPassed = 0;
let testsFailed = 0;
let testsTotal = 0;

// 测试结果存储
const testResults = {
  master: { status: 'pending', message: '' },
  workers: { status: 'pending', message: '', count: 0 },
  dataStore: { status: 'pending', message: '', data: {} },
  imApis: { status: 'pending', message: '', results: [] },
  consistency: { status: 'pending', message: '' },
};

// HTTP 请求辅助函数
function httpGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: result });
        } catch (err) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// 测试 1: Master 服务器状态
async function testMasterStatus() {
  testsTotal++;
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试 1/5: Master 服务器状态检查');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const { statusCode, data } = await httpGet('/api/v1/status');

    if (statusCode === 200 && data.success) {
      testsPassed++;
      testResults.master.status = 'passed';
      testResults.master.message = 'Master 服务器运行正常';

      console.log('✅ Master 服务器: 运行中');
      console.log('   端口:', data.data.port || 3000);
      console.log('   环境:', data.data.environment || 'development');
      console.log('   运行时间:', Math.floor((data.data.uptime || 0) / 1000) + '秒');

      // 存储 Worker 信息
      if (data.data.workers) {
        testResults.workers.count = data.data.workers.length;
        console.log('   已连接 Worker:', data.data.workers.length + '个');
      }

      // 存储 DataStore 信息
      if (data.data.dataStore) {
        testResults.dataStore.data = data.data.dataStore;
        console.log('   DataStore 账户数:', data.data.dataStore.totalAccounts || 0);
      }
    } else {
      testsFailed++;
      testResults.master.status = 'failed';
      testResults.master.message = `HTTP ${statusCode}`;
      console.log('❌ Master 服务器: 响应异常');
      console.log('   状态码:', statusCode);
    }
  } catch (err) {
    testsFailed++;
    testResults.master.status = 'failed';
    testResults.master.message = err.message;
    console.log('❌ Master 服务器: 无法连接');
    console.log('   错误:', err.message);
    console.log('   提示: 请运行 "npm run start:master" 启动服务器');
  }

  console.log();
}

// 测试 2: Worker 连接状态
async function testWorkerStatus() {
  testsTotal++;
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试 2/5: Worker 连接状态检查');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (testResults.workers.count === 0) {
    testsFailed++;
    testResults.workers.status = 'failed';
    testResults.workers.message = '没有 Worker 连接';
    console.log('❌ Worker 连接: 0 个');
    console.log('   提示: 请运行 "npm run start:worker" 启动 Worker');
  } else {
    testsPassed++;
    testResults.workers.status = 'passed';
    testResults.workers.message = `${testResults.workers.count} 个 Worker 已连接`;
    console.log(`✅ Worker 连接: ${testResults.workers.count} 个`);
  }

  console.log();
}

// 测试 3: DataStore 数据检查
async function testDataStore() {
  testsTotal++;
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试 3/5: DataStore 数据检查');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const ds = testResults.dataStore.data;

  console.log('DataStore 统计:');
  console.log('  总账户数:', ds.totalAccounts || 0);
  console.log('  总评论数:', ds.totalComments || 0);
  console.log('  总私信数:', ds.totalMessages || 0);
  console.log('  总会话数:', ds.totalConversations || 0);
  console.log('  总作品数:', ds.totalContents || 0);
  console.log('  总通知数:', ds.totalNotifications || 0);

  const hasData = (ds.totalAccounts || 0) > 0 &&
                  ((ds.totalComments || 0) > 0 ||
                   (ds.totalMessages || 0) > 0 ||
                   (ds.totalConversations || 0) > 0);

  if (hasData) {
    testsPassed++;
    testResults.dataStore.status = 'passed';
    testResults.dataStore.message = 'DataStore 有数据';
    console.log('\n✅ DataStore: 有数据');
  } else {
    testsFailed++;
    testResults.dataStore.status = 'warning';
    testResults.dataStore.message = 'DataStore 为空（可能正在爬取）';
    console.log('\n⚠️  DataStore: 暂无数据');
    console.log('   说明: Worker 正在爬取数据，或账户未登录');
    console.log('   等待 30-60 秒后数据会自动推送到 Master');
  }

  console.log();
}

// 测试 4: IM API 接口测试
async function testIMApis() {
  testsTotal++;
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试 4/5: IM API 接口测试');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const apis = [
    { name: '会话列表', path: `/api/im/conversations?account_id=${accountId}&count=10`, key: 'conversations' },
    { name: '私信列表', path: `/api/im/messages?account_id=${accountId}&count=10`, key: 'messages' },
    { name: '评论列表', path: `/api/im/discussions?account_id=${accountId}&count=10`, key: 'discussions' },
    { name: '作品列表', path: `/api/im/contents?account_id=${accountId}&count=10`, key: 'contents' },
    { name: '统一消息', path: `/api/im/unified-messages?account_id=${accountId}&count=10`, key: 'messages' },
  ];

  let apisPassed = 0;
  let apisFailed = 0;

  for (const api of apis) {
    try {
      const { statusCode, data } = await httpGet(api.path);

      if (statusCode === 200 && data.status_code === 0) {
        apisPassed++;
        const items = data.data[api.key] || [];
        testResults.imApis.results.push({
          name: api.name,
          status: 'passed',
          count: items.length,
        });
        console.log(`✅ ${api.name} API: 正常 (返回 ${items.length} 条数据)`);
      } else {
        apisFailed++;
        testResults.imApis.results.push({
          name: api.name,
          status: 'failed',
          error: `HTTP ${statusCode}`,
        });
        console.log(`❌ ${api.name} API: 失败 (HTTP ${statusCode})`);
      }
    } catch (err) {
      apisFailed++;
      testResults.imApis.results.push({
        name: api.name,
        status: 'failed',
        error: err.message,
      });
      console.log(`❌ ${api.name} API: 错误 (${err.message})`);
    }
  }

  if (apisFailed === 0) {
    testsPassed++;
    testResults.imApis.status = 'passed';
    testResults.imApis.message = '所有 API 正常';
  } else {
    testsFailed++;
    testResults.imApis.status = 'failed';
    testResults.imApis.message = `${apisFailed} 个 API 失败`;
  }

  console.log();
}

// 测试 5: 数据一致性验证
async function testConsistency() {
  testsTotal++;
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试 5/5: 数据一致性验证');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 验证 DataStore 和 IM API 的数据是否一致
  const dsConversations = testResults.dataStore.data.totalConversations || 0;
  const dsMessages = testResults.dataStore.data.totalMessages || 0;
  const dsComments = testResults.dataStore.data.totalComments || 0;
  const dsContents = testResults.dataStore.data.totalContents || 0;

  // 从 IM API 获取的数据
  const apiResults = testResults.imApis.results;
  const apiConversations = apiResults.find(r => r.name === '会话列表')?.count || 0;
  const apiMessages = apiResults.find(r => r.name === '私信列表')?.count || 0;
  const apiComments = apiResults.find(r => r.name === '评论列表')?.count || 0;
  const apiContents = apiResults.find(r => r.name === '作品列表')?.count || 0;

  console.log('数据对比:');
  console.log('  会话数 - DataStore:', dsConversations, '| IM API:', apiConversations);
  console.log('  私信数 - DataStore:', dsMessages, '| IM API:', apiMessages);
  console.log('  评论数 - DataStore:', dsComments, '| IM API:', apiComments);
  console.log('  作品数 - DataStore:', dsContents, '| IM API:', apiContents);

  // 简单验证：如果 DataStore 有数据，API 应该也能返回数据
  let consistent = true;
  if (dsConversations > 0 && apiConversations === 0) consistent = false;
  if (dsMessages > 0 && apiMessages === 0) consistent = false;
  if (dsComments > 0 && apiComments === 0) consistent = false;
  if (dsContents > 0 && apiContents === 0) consistent = false;

  if (consistent) {
    testsPassed++;
    testResults.consistency.status = 'passed';
    testResults.consistency.message = '数据一致';
    console.log('\n✅ 数据一致性: 通过');
  } else {
    testsFailed++;
    testResults.consistency.status = 'failed';
    testResults.consistency.message = '数据不一致';
    console.log('\n❌ 数据一致性: 失败');
    console.log('   DataStore 有数据但 API 未返回');
  }

  console.log();
}

// 打印最终报告
function printFinalReport() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试完成 - 最终报告');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📊 测试统计:');
  console.log(`  总测试数: ${testsTotal}`);
  console.log(`  通过: ${testsPassed} ✅`);
  console.log(`  失败: ${testsFailed} ❌`);
  console.log(`  成功率: ${Math.round(testsPassed / testsTotal * 100)}%`);

  console.log('\n📋 详细结果:');
  console.log(`  1. Master 服务器: ${testResults.master.status === 'passed' ? '✅' : '❌'} ${testResults.master.message}`);
  console.log(`  2. Worker 连接: ${testResults.workers.status === 'passed' ? '✅' : '❌'} ${testResults.workers.message}`);
  console.log(`  3. DataStore 数据: ${testResults.dataStore.status === 'passed' ? '✅' : testResults.dataStore.status === 'warning' ? '⚠️ ' : '❌'} ${testResults.dataStore.message}`);
  console.log(`  4. IM API 接口: ${testResults.imApis.status === 'passed' ? '✅' : '❌'} ${testResults.imApis.message}`);
  console.log(`  5. 数据一致性: ${testResults.consistency.status === 'passed' ? '✅' : '❌'} ${testResults.consistency.message}`);

  console.log('\n💡 建议:');

  if (testResults.master.status !== 'passed') {
    console.log('  - 启动 Master 服务器: npm run start:master');
  }

  if (testResults.workers.status !== 'passed') {
    console.log('  - 启动 Worker 进程: npm run start:worker');
  }

  if (testResults.dataStore.status === 'warning') {
    console.log('  - 等待 30-60 秒让 Worker 推送数据');
    console.log('  - 确保账户已登录: 使用 Admin Web 登录账户');
    console.log('  - 检查账户状态: node tests/查询账户状态.js');
  }

  if (testResults.consistency.status !== 'passed') {
    console.log('  - 检查 DataStore 日志');
    console.log('  - 重启 Master 和 Worker');
  }

  console.log('\n🎯 系统状态:');
  if (testsPassed === testsTotal) {
    console.log('  🎉 系统运行完美！所有测试通过！');
  } else if (testsPassed >= testsTotal * 0.8) {
    console.log('  ✅ 系统基本正常，部分功能需要调整');
  } else if (testsPassed >= testsTotal * 0.5) {
    console.log('  ⚠️  系统部分正常，需要处理多个问题');
  } else {
    console.log('  ❌ 系统存在重大问题，需要立即处理');
  }

  console.log('\n==================================================\n');
}

// 主测试流程
async function runTests() {
  try {
    await testMasterStatus();
    await testWorkerStatus();
    await testDataStore();
    await testIMApis();
    await testConsistency();

    printFinalReport();

    // 退出码：0=全部通过，1=有失败
    process.exit(testsFailed === 0 ? 0 : 1);
  } catch (err) {
    console.error('\n❌ 测试执行失败:', err);
    process.exit(1);
  }
}

// 运行测试
runTests();
