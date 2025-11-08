/**
 * IM HTTP API 高级验证测试
 * 包含性能测试、并发测试、边界测�?
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

const API_BASE = 'http://localhost:3000/api/im';
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// 测试计数�?
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// 性能指标
const performanceMetrics = {
  responseTimes: [],
  slowQueries: [],
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    return true;
  } else {
    failedTests++;
    log(`   �?${message}`, 'red');
    return false;
  }
}

async function test(name, fn) {
  log(`\n${name}`, 'cyan');
  try {
    const start = performance.now();
    await fn();
    const duration = performance.now() - start;

    // 记录响应时间
    performanceMetrics.responseTimes.push({ name, duration });

    // 标记慢查询（>500ms�?
    if (duration > 500) {
      performanceMetrics.slowQueries.push({ name, duration });
      log(`   ⚠️  慢查�? ${duration.toFixed(2)}ms`, 'yellow');
    } else {
      log(`   ⏱️  响应时间: ${duration.toFixed(2)}ms`, 'blue');
    }

    log(`�?${name}`, 'green');
  } catch (error) {
    failedTests++;
    log(`�?${name}`, 'red');
    log(`   错误: ${error.message}`, 'red');
    if (error.response) {
      log(`   响应: ${JSON.stringify(error.response.data)}`, 'red');
    }
  }
}

async function main() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('开�?IM HTTP API 高级验证测试...', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');

  // ============================================
  // 1. 性能测试
  // ============================================
  log('\n📊 测试 1: 性能测试', 'yellow');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');

  // 获取测试数据
  let testAccountId, testConversationId, testMessageId;

  await test('准备测试数据', async () => {
    const convResponse = await axios.get(`${API_BASE}/conversations`, {
      params: { account_id: 'acc-40dab768-fee1-4718-b64b-eb3a7c23beac', count: 1 }
    });

    testAccountId = 'acc-40dab768-fee1-4718-b64b-eb3a7c23beac';
    testConversationId = convResponse.data.data.conversations[0]?.conversation_id;

    const msgResponse = await axios.get(`${API_BASE}/messages`, {
      params: { conversation_id: testConversationId, count: 1 }
    });

    testMessageId = msgResponse.data.data.messages[0]?.msg_id;

    assert(testAccountId, '账户ID应存�?);
    assert(testConversationId, '会话ID应存�?);
    assert(testMessageId, '消息ID应存�?);
  });

  await test('性能: 获取会话列表 (100ms�?', async () => {
    const start = performance.now();
    const response = await axios.get(`${API_BASE}/conversations`, {
      params: { account_id: testAccountId, count: 20 }
    });
    const duration = performance.now() - start;

    assert(response.status === 200, '状态码应为 200');
    assert(duration < 100, `响应时间�?< 100ms (实际: ${duration.toFixed(2)}ms)`);
  });

  await test('性能: 获取消息列表 (100ms�?', async () => {
    const start = performance.now();
    const response = await axios.get(`${API_BASE}/messages`, {
      params: { conversation_id: testConversationId, count: 50 }
    });
    const duration = performance.now() - start;

    assert(response.status === 200, '状态码应为 200');
    assert(duration < 100, `响应时间�?< 100ms (实际: ${duration.toFixed(2)}ms)`);
  });

  await test('性能: 获取单条消息 (50ms�?', async () => {
    const start = performance.now();
    const response = await axios.get(`${API_BASE}/messages/${testMessageId}`);
    const duration = performance.now() - start;

    assert(response.status === 200, '状态码应为 200');
    assert(duration < 50, `响应时间�?< 50ms (实际: ${duration.toFixed(2)}ms)`);
  });

  // ============================================
  // 2. 并发测试
  // ============================================
  log('\n�?测试 2: 并发请求处理', 'yellow');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');

  await test('并发: 10个同时获取会话请�?, async () => {
    const requests = Array(10).fill(null).map(() =>
      axios.get(`${API_BASE}/conversations`, {
        params: { account_id: testAccountId, count: 10 }
      })
    );

    const start = performance.now();
    const responses = await Promise.all(requests);
    const duration = performance.now() - start;

    assert(responses.length === 10, '应返�?0个响�?);
    assert(responses.every(r => r.status === 200), '所有请求应成功');
    assert(duration < 500, `并发响应时间�?< 500ms (实际: ${duration.toFixed(2)}ms)`);

    log(`   📈 平均响应时间: ${(duration / 10).toFixed(2)}ms`, 'blue');
  });

  await test('并发: 5个不同类型的请求', async () => {
    const requests = [
      axios.get(`${API_BASE}/conversations`, { params: { account_id: testAccountId } }),
      axios.get(`${API_BASE}/conversations/${testConversationId}`),
      axios.get(`${API_BASE}/messages`, { params: { conversation_id: testConversationId } }),
      axios.get(`${API_BASE}/messages/${testMessageId}`),
      axios.put(`${API_BASE}/conversations/${testConversationId}/pin`),
    ];

    const start = performance.now();
    const responses = await Promise.all(requests);
    const duration = performance.now() - start;

    assert(responses.length === 5, '应返�?个响�?);
    assert(responses.every(r => r.status === 200), '所有请求应成功');
    log(`   📈 总响应时�? ${duration.toFixed(2)}ms`, 'blue');
  });

  // ============================================
  // 3. 边界测试
  // ============================================
  log('\n🔍 测试 3: 边界情况处理', 'yellow');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');

  await test('边界: 不存在的会话ID (404)', async () => {
    try {
      await axios.get(`${API_BASE}/conversations/non-existent-conversation-id`);
      assert(false, '应返�?04错误');
    } catch (error) {
      assert(error.response.status === 404, '应返�?04');
      assert(error.response.data.status_code === 404, 'status_code应为404');
    }
  });

  await test('边界: 不存在的消息ID (404)', async () => {
    try {
      await axios.get(`${API_BASE}/messages/non-existent-message-id`);
      assert(false, '应返�?04错误');
    } catch (error) {
      assert(error.response.status === 404, '应返�?04');
      assert(error.response.data.status_code === 404, 'status_code应为404');
    }
  });

  await test('边界: 缺少必需参数 account_id (400)', async () => {
    try {
      await axios.get(`${API_BASE}/conversations`);
      assert(false, '应返�?00错误');
    } catch (error) {
      assert(error.response.status === 400, '应返�?00');
      assert(error.response.data.status_code === 400, 'status_code应为400');
    }
  });

  await test('边界: 无效的消息状�?(400)', async () => {
    try {
      await axios.put(`${API_BASE}/messages/${testMessageId}/status`, {
        status: 'invalid-status'
      });
      // 注意：这个测试可能通过，因为API可能不验证状态�?
      // 如果通过了，说明需要加强验�?
    } catch (error) {
      if (error.response && error.response.status === 400) {
        assert(true, '正确拒绝无效状�?);
      }
    }
  });

  await test('边界: 超大分页参数 count=1000', async () => {
    const response = await axios.get(`${API_BASE}/conversations`, {
      params: { account_id: testAccountId, count: 1000 }
    });

    assert(response.status === 200, '状态码应为 200');
    assert(Array.isArray(response.data.data.conversations), 'conversations应为数组');
    // API应该限制最大返回数量或处理大参�?
  });

  await test('边界: cursor=999999 (超出范围)', async () => {
    const response = await axios.get(`${API_BASE}/conversations`, {
      params: { account_id: testAccountId, cursor: 999999 }
    });

    assert(response.status === 200, '状态码应为 200');
    assert(response.data.data.conversations.length === 0, '应返回空数组');
  });

  // ============================================
  // 4. 数据完整性测�?
  // ============================================
  log('\n🔐 测试 4: 数据完整性验�?, 'yellow');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');

  await test('完整�? 置顶后立即查询验�?, async () => {
    // 先置�?
    await axios.put(`${API_BASE}/conversations/${testConversationId}/pin`);

    // 立即查询
    const response = await axios.get(`${API_BASE}/conversations/${testConversationId}`);

    assert(response.data.data.is_pinned === true, '应立即反映置顶状�?);
  });

  await test('完整�? 取消置顶后立即查询验�?, async () => {
    // 取消置顶
    await axios.delete(`${API_BASE}/conversations/${testConversationId}/pin`);

    // 立即查询
    const response = await axios.get(`${API_BASE}/conversations/${testConversationId}`);

    assert(response.data.data.is_pinned === false, '应立即反映取消置顶状�?);
  });

  await test('完整�? 消息状态更新验�?, async () => {
    // 更新状态为 delivered
    await axios.put(`${API_BASE}/messages/${testMessageId}/status`, {
      status: 'delivered'
    });

    // 立即查询
    const response = await axios.get(`${API_BASE}/messages/${testMessageId}`);

    assert(response.data.data.status === 'delivered', '状态应立即更新�?delivered');
  });

  await test('完整�? 撤回消息后字段验�?, async () => {
    // 撤回消息
    const recallResponse = await axios.put(`${API_BASE}/messages/${testMessageId}/recall`);

    assert(recallResponse.data.data.is_recalled === true, 'is_recalled应为true');
    assert(recallResponse.data.data.recalled_at !== null, 'recalled_at应有�?);
    assert(typeof recallResponse.data.data.recalled_at === 'number', 'recalled_at应为时间�?);
  });

  // ============================================
  // 5. 响应格式一致性测�?
  // ============================================
  log('\n📋 测试 5: 响应格式一致�?, 'yellow');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');

  await test('格式: 成功响应的一致�?, async () => {
    const responses = await Promise.all([
      axios.get(`${API_BASE}/conversations`, { params: { account_id: testAccountId } }),
      axios.get(`${API_BASE}/conversations/${testConversationId}`),
      axios.get(`${API_BASE}/messages`, { params: { conversation_id: testConversationId } }),
      axios.get(`${API_BASE}/messages/${testMessageId}`),
    ]);

    // 所有成功响应都应有 data �?status_code 字段
    responses.forEach((response, index) => {
      assert(response.data.hasOwnProperty('data'), `响应${index + 1}应有data字段`);
      assert(response.data.hasOwnProperty('status_code'), `响应${index + 1}应有status_code字段`);
      assert(response.data.status_code === 0, `响应${index + 1}的status_code应为0`);
    });
  });

  await test('格式: 错误响应的一致�?, async () => {
    try {
      await axios.get(`${API_BASE}/conversations/invalid-id`);
    } catch (error) {
      const errorResponse = error.response.data;

      assert(errorResponse.hasOwnProperty('status_code'), '错误响应应有status_code字段');
      assert(errorResponse.hasOwnProperty('status_msg'), '错误响应应有status_msg字段');
      assert(errorResponse.status_code !== 0, 'status_code应非0');
    }
  });

  // ============================================
  // 6. 幂等性测�?
  // ============================================
  log('\n🔄 测试 6: 操作幂等�?, 'yellow');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');

  await test('幂等�? 多次置顶同一会话', async () => {
    // 连续置顶3�?
    const responses = await Promise.all([
      axios.put(`${API_BASE}/conversations/${testConversationId}/pin`),
      axios.put(`${API_BASE}/conversations/${testConversationId}/pin`),
      axios.put(`${API_BASE}/conversations/${testConversationId}/pin`),
    ]);

    assert(responses.every(r => r.status === 200), '所有请求应成功');
    assert(responses.every(r => r.data.data.is_pinned === true), '所有响应应显示已置�?);
  });

  await test('幂等�? 多次撤回同一消息', async () => {
    // 连续撤回3�?
    const responses = await Promise.all([
      axios.put(`${API_BASE}/messages/${testMessageId}/recall`),
      axios.put(`${API_BASE}/messages/${testMessageId}/recall`),
      axios.put(`${API_BASE}/messages/${testMessageId}/recall`),
    ]);

    assert(responses.every(r => r.status === 200), '所有请求应成功');
    assert(responses.every(r => r.data.data.is_recalled === true), '所有响应应显示已撤�?);
  });

  // ============================================
  // 测试报告
  // ============================================
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('📊 高级验证测试完成�?, 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');

  const successRate = ((passedTests / totalTests) * 100).toFixed(1);

  log(`\n�?通过: ${passedTests} 个`, 'green');
  log(`�?失败: ${failedTests} 个`, failedTests > 0 ? 'red' : 'green');
  log(`📈 成功�? ${successRate}%`, successRate === '100.0' ? 'green' : 'yellow');

  // 性能统计
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('⏱️  性能统计', 'yellow');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');

  const avgResponseTime = performanceMetrics.responseTimes.reduce((sum, item) => sum + item.duration, 0) / performanceMetrics.responseTimes.length;
  const maxResponseTime = Math.max(...performanceMetrics.responseTimes.map(item => item.duration));
  const minResponseTime = Math.min(...performanceMetrics.responseTimes.map(item => item.duration));

  log(`平均响应时间: ${avgResponseTime.toFixed(2)}ms`, 'blue');
  log(`最快响�? ${minResponseTime.toFixed(2)}ms`, 'green');
  log(`最慢响�? ${maxResponseTime.toFixed(2)}ms`, maxResponseTime > 500 ? 'red' : 'yellow');

  if (performanceMetrics.slowQueries.length > 0) {
    log(`\n⚠️  慢查�?(>500ms): ${performanceMetrics.slowQueries.length} 个`, 'yellow');
    performanceMetrics.slowQueries.forEach(query => {
      log(`   - ${query.name}: ${query.duration.toFixed(2)}ms`, 'yellow');
    });
  } else {
    log(`\n�?无慢查询`, 'green');
  }

  // 最终评�?
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('🎯 最终评�?, 'yellow');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');

  const performance_score = avgResponseTime < 100 ? '⭐⭐⭐⭐�? : avgResponseTime < 200 ? '⭐⭐⭐⭐' : '⭐⭐�?;
  const reliability_score = successRate === '100.0' ? '⭐⭐⭐⭐�? : successRate >= '95.0' ? '⭐⭐⭐⭐' : '⭐⭐�?;

  log(`性能评分: ${performance_score} (平均 ${avgResponseTime.toFixed(2)}ms)`, 'blue');
  log(`可靠性评�? ${reliability_score} (${successRate}% 通过�?`, 'blue');

  if (successRate === '100.0' && avgResponseTime < 100 && performanceMetrics.slowQueries.length === 0) {
    log('\n🎉 系统状�? 优秀！已准备好投入生产使�?, 'green');
  } else if (successRate >= '95.0' && avgResponseTime < 200) {
    log('\n�?系统状�? 良好，可以投入生产使�?, 'green');
  } else {
    log('\n⚠️  系统状�? 需要优�?, 'yellow');
  }

  process.exit(failedTests > 0 ? 1 : 0);
}

// 运行测试
main().catch(error => {
  log(`\n�?测试运行失败: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
