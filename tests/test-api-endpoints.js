/**
 * API 端点完整测试脚本
 * 测试所有 Admin-Web 使用的 API 端点
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// HTTP GET 请求封装
function httpGet(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            data: JSON.parse(data),
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            data: data,
            error: 'Failed to parse JSON',
          });
        }
      });
    }).on('error', reject);
  });
}

// 测试单个端点
async function testEndpoint(name, path, expectedKeys = []) {
  try {
    log(`\n🔍 测试: ${name}`, 'cyan');
    log(`   端点: ${path}`, 'blue');

    const result = await httpGet(path);

    if (result.statusCode !== 200) {
      log(`   ❌ HTTP ${result.statusCode}`, 'red');
      return { name, success: false, error: `HTTP ${result.statusCode}` };
    }

    if (result.error) {
      log(`   ❌ ${result.error}`, 'red');
      return { name, success: false, error: result.error };
    }

    if (!result.data.success) {
      log(`   ❌ API Error: ${result.data.error || 'Unknown'}`, 'red');
      return { name, success: false, error: result.data.error };
    }

    // 检查必需字段
    for (const key of expectedKeys) {
      if (!(key in result.data)) {
        log(`   ⚠️  缺少字段: ${key}`, 'yellow');
      }
    }

    // 显示数据摘要
    if (Array.isArray(result.data.data)) {
      log(`   ✅ 成功 - 返回 ${result.data.data.length} 条记录`, 'green');
    } else if (result.data.data) {
      const keys = Object.keys(result.data.data);
      log(`   ✅ 成功 - ${keys.length} 个字段: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`, 'green');
    } else {
      log(`   ✅ 成功`, 'green');
    }

    return { name, success: true, data: result.data };

  } catch (error) {
    log(`   ❌ 请求失败: ${error.message}`, 'red');
    return { name, success: false, error: error.message };
  }
}

// 主测试函数
async function runTests() {
  log('═══════════════════════════════════════════════════════', 'cyan');
  log('  Admin-Web API 端点完整测试', 'cyan');
  log('═══════════════════════════════════════════════════════', 'cyan');

  const tests = [
    // Cache Data API (Phase 3.3 + 3.4)
    {
      name: 'Cache Comments API',
      path: '/api/v1/cache/comments?limit=10',
      expectedKeys: ['success', 'data', 'pagination'],
    },
    {
      name: 'Cache Messages API',
      path: '/api/v1/cache/messages?limit=10',
      expectedKeys: ['success', 'data', 'pagination'],
    },
    {
      name: 'Cache Stats API',
      path: '/api/v1/cache/stats',
      expectedKeys: ['success', 'data'],
    },

    // Platforms API (Phase 3.2)
    {
      name: 'Platforms List API',
      path: '/api/v1/platforms',
      expectedKeys: ['success', 'data'],
    },

    // Accounts API
    {
      name: 'Accounts List API',
      path: '/api/v1/accounts',
      expectedKeys: ['success', 'data'],
    },

    // Workers API
    {
      name: 'Workers List API',
      path: '/api/v1/workers',
      expectedKeys: ['success', 'data'],
    },
    {
      name: 'Worker Configs API',
      path: '/api/v1/worker-configs',
      expectedKeys: ['success', 'data'],
    },

    // Statistics API
    {
      name: 'Statistics API',
      path: '/api/v1/statistics',
      expectedKeys: ['success', 'data'],
    },

    // Proxies API
    {
      name: 'Proxies List API',
      path: '/api/v1/proxies',
      expectedKeys: ['success', 'data'],
    },
  ];

  const results = [];
  for (const test of tests) {
    const result = await testEndpoint(test.name, test.path, test.expectedKeys);
    results.push(result);
    // 短暂延迟，避免请求过快
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // 生成测试报告
  log('\n═══════════════════════════════════════════════════════', 'cyan');
  log('  测试结果汇总', 'cyan');
  log('═══════════════════════════════════════════════════════', 'cyan');

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  log(`\n总计: ${results.length} 个测试`, 'blue');
  log(`通过: ${passed} 个`, 'green');
  log(`失败: ${failed} 个`, failed > 0 ? 'red' : 'green');

  if (failed > 0) {
    log('\n失败的测试:', 'red');
    results.filter(r => !r.success).forEach(r => {
      log(`  ❌ ${r.name}: ${r.error}`, 'red');
    });
  }

  log('\n通过的测试:', 'green');
  results.filter(r => r.success).forEach(r => {
    log(`  ✅ ${r.name}`, 'green');
  });

  log('\n═══════════════════════════════════════════════════════\n', 'cyan');

  // 退出码
  process.exit(failed > 0 ? 1 : 0);
}

// 运行测试
runTests().catch(error => {
  log(`\n致命错误: ${error.message}`, 'red');
  process.exit(1);
});
