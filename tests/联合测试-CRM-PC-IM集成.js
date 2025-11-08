/**
 * 联合测试 - CRM PC IM �?Master IM API 集成
 *
 * 测试场景�? * 1. Master 服务器运行状�? * 2. CRM PC IM 前端服务运行状�? * 3. IM API 接口可访问�? * 4. 数据格式兼容�? */

const http = require('http');

console.log('==================================================');
console.log('CRM PC IM 联合测试');
console.log('测试时间:', new Date().toLocaleString('zh-CN'));
console.log('==================================================\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 测试结果
const results = {
  master: { status: 'pending' },
  frontend: { status: 'pending' },
  imApis: [],
  dataFormat: { status: 'pending' },
};

// HTTP 请求辅助函数
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
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

// 测试 1: Master 服务器状�?async function testMasterStatus() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试 1/4: Master 服务器状�?);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const { statusCode, data } = await httpGet('http://localhost:3000/api/v1/status');

    if (statusCode === 200 && data.success) {
      results.master.status = 'passed';
      console.log('�?Master 服务�? 运行正常');
      console.log('   地址: http://localhost:3000');
      console.log('   端口: 3000');
    } else {
      results.master.status = 'failed';
      console.log('�?Master 服务�? 响应异常');
    }
  } catch (err) {
    results.master.status = 'failed';
    console.log('�?Master 服务�? 无法连接');
    console.log('   错误:', err.message);
  }

  console.log();
}

// 测试 2: CRM PC IM 前端服务状�?async function testFrontendStatus() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试 2/4: CRM PC IM 前端服务状�?);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const { statusCode } = await httpGet('http://localhost:5173');

    if (statusCode === 200) {
      results.frontend.status = 'passed';
      console.log('�?CRM PC IM 前端: 运行正常');
      console.log('   地址: http://localhost:5173');
      console.log('   框架: React + Vite');
    } else {
      results.frontend.status = 'failed';
      console.log('�?CRM PC IM 前端: 响应异常');
    }
  } catch (err) {
    results.frontend.status = 'failed';
    console.log('�?CRM PC IM 前端: 无法连接');
    console.log('   错误:', err.message);
    console.log('   提示: 请运�?"cd packages/crm-pc-im && npm run dev"');
  }

  console.log();
}

// 测试 3: IM API 接口测试
async function testIMApis() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试 3/4: IM API 接口可访问�?);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const apis = [
    {
      name: '会话列表',
      url: `http://localhost:3000/api/im/conversations?account_id=${accountId}&count=10`,
      expectedKey: 'conversations'
    },
    {
      name: '私信列表',
      url: `http://localhost:3000/api/im/messages?account_id=${accountId}&count=10`,
      expectedKey: 'messages'
    },
    {
      name: '评论列表',
      url: `http://localhost:3000/api/im/discussions?account_id=${accountId}&count=10`,
      expectedKey: 'discussions'
    },
    {
      name: '作品列表',
      url: `http://localhost:3000/api/im/contents?account_id=${accountId}&count=10`,
      expectedKey: 'contents'
    },
    {
      name: '统一消息',
      url: `http://localhost:3000/api/im/unified-messages?account_id=${accountId}&count=10`,
      expectedKey: 'messages'
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const api of apis) {
    try {
      const { statusCode, data } = await httpGet(api.url);

      if (statusCode === 200 && data.status_code === 0) {
        passed++;
        const items = data.data[api.expectedKey] || [];
        results.imApis.push({
          name: api.name,
          status: 'passed',
          count: items.length,
          format: 'IM 格式',
        });
        console.log(`�?${api.name} API: 正常 (${items.length} 条数�?`);
      } else {
        failed++;
        results.imApis.push({
          name: api.name,
          status: 'failed',
          error: `HTTP ${statusCode}`,
        });
        console.log(`�?${api.name} API: 失败 (HTTP ${statusCode})`);
      }
    } catch (err) {
      failed++;
      results.imApis.push({
        name: api.name,
        status: 'failed',
        error: err.message,
      });
      console.log(`�?${api.name} API: 错误 (${err.message})`);
    }
  }

  console.log(`\n总结: ${passed}/5 API 正常工作`);
  console.log();
}

// 测试 4: 数据格式兼容�?async function testDataFormat() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试 4/4: 数据格式兼容性验�?);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const { statusCode, data } = await httpGet(
      `http://localhost:3000/api/im/conversations?account_id=${accountId}&count=10`
    );

    if (statusCode !== 200) {
      results.dataFormat.status = 'failed';
      console.log('�?数据格式: 无法获取数据');
      return;
    }

    // 验证 IM 格式
    const hasData = data.data !== undefined;
    const hasStatusCode = data.status_code !== undefined;
    const hasCursor = data.data.cursor !== undefined;
    const hasHasMore = data.data.has_more !== undefined;

    console.log('数据格式检�?');
    console.log('  data 字段:', hasData ? '�? : '�?);
    console.log('  status_code 字段:', hasStatusCode ? '�? : '�?);
    console.log('  cursor 字段:', hasCursor ? '�? : '�?);
    console.log('  has_more 字段:', hasHasMore ? '�? : '�?);

    if (hasData && hasStatusCode && hasCursor && hasHasMore) {
      results.dataFormat.status = 'passed';
      console.log('\n�?数据格式: 完全兼容 IM 格式');
    } else {
      results.dataFormat.status = 'partial';
      console.log('\n⚠️  数据格式: 部分兼容');
    }

    // 显示实际响应格式
    console.log('\n实际响应格式:');
    console.log(JSON.stringify({
      data: {
        [Object.keys(data.data).find(k => Array.isArray(data.data[k]))]: '...',
        cursor: data.data.cursor,
        has_more: data.data.has_more,
      },
      status_code: data.status_code,
    }, null, 2));

  } catch (err) {
    results.dataFormat.status = 'failed';
    console.log('�?数据格式: 验证失败');
    console.log('   错误:', err.message);
  }

  console.log();
}

// 打印最终报�?function printFinalReport() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('联合测试最终报�?);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const allTests = [
    { name: 'Master 服务�?, status: results.master.status },
    { name: 'CRM PC IM 前端', status: results.frontend.status },
    { name: 'IM API 接口', status: results.imApis.every(a => a.status === 'passed') ? 'passed' : 'failed' },
    { name: '数据格式兼容', status: results.dataFormat.status },
  ];

  const passed = allTests.filter(t => t.status === 'passed').length;
  const total = allTests.length;

  console.log('📊 测试统计:');
  console.log(`  总测试项: ${total}`);
  console.log(`  通过: ${passed} ✅`);
  console.log(`  失败: ${total - passed} ❌`);
  console.log(`  成功�? ${Math.round(passed / total * 100)}%`);

  console.log('\n📋 详细结果:');
  allTests.forEach((test, index) => {
    const icon = test.status === 'passed' ? '�? :
                 test.status === 'partial' ? '⚠️ ' : '�?;
    console.log(`  ${index + 1}. ${test.name}: ${icon}`);
  });

  console.log('\n💡 CRM PC IM 使用指南:');
  console.log('  1. 打开浏览器访�? http://localhost:5173');
  console.log('  2. 客户端会自动连接�?Master (http://localhost:3000/api/im)');
  console.log('  3. 调用 IM API 接口获取数据');
  console.log('  4. 数据格式完全兼容�?IM 系统');

  console.log('\n🎯 集成状�?');
  if (passed === total) {
    console.log('  🎉 完美！CRM PC IM �?Master 集成成功�?);
  } else if (passed >= total * 0.75) {
    console.log('  �?良好！主要功能集成正常，部分需要调�?);
  } else {
    console.log('  ⚠️  需要处理集成问�?);
  }

  console.log('\n📚 相关文档:');
  console.log('  - docs/项目最终完成报�?md - 完整项目文档');
  console.log('  - docs/IM接口集成测试完成报告.md - API 文档');
  console.log('  - packages/crm-pc-im/src/services/api.ts - API 调用代码');

  console.log('\n==================================================\n');

  // 退出码
  process.exit(passed === total ? 0 : 1);
}

// 主测试流�?async function runTests() {
  try {
    await testMasterStatus();
    await testFrontendStatus();
    await testIMApis();
    await testDataFormat();

    printFinalReport();
  } catch (err) {
    console.error('\n�?测试执行失败:', err);
    process.exit(1);
  }
}

// 运行测试
runTests();
