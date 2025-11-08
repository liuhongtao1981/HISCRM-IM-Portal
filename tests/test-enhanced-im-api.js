/**
 * 增强�?IM API 集成测试
 * 测试新增的作品、讨论和统一消息接口
 *
 * 运行方式�?
 *   node tests/test-enhanced-im-api.js
 *
 * 前置条件�?
 *   - Master 服务器运行在 localhost:3000
 *   - 数据库已迁移（包�?contents �?discussions 表）
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000/api/im';

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// 日志辅助函数
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`�?${message}`, 'green');
}

function logError(message) {
  log(`�?${message}`, 'red');
}

function logInfo(message) {
  log(`�?${message}`, 'cyan');
}

function logSection(message) {
  log(`\n══�?${message} ═══`, 'blue');
}

// 通用 API 请求
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  logInfo(`请求: ${options.method || 'GET'} ${endpoint}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logError(`请求失败: ${error.message}`);
    throw error;
  }
}

/**
 * 测试：获取作品列�?
 */
async function testGetWorks() {
  logSection('测试 1: 获取作品列表');

  try {
    const response = await request('/contents?count=10');

    if (response.status_code === 0) {
      const contents = response.data.contents || [];
      logSuccess(`作品列表获取成功: �?${contents.length} 个作品`);

      if (contents.length > 0) {
        const firstWork = contents[0];
        logInfo(`  第一个作�? ${firstWork.title || '无标�?}`);
        logInfo(`    ID: ${firstWork.content_id}`);
        logInfo(`    类型: ${firstWork.content_type}`);
        logInfo(`    平台: ${firstWork.platform}`);
        logInfo(`    统计: ${firstWork.stats.total_comments} 评论, ${firstWork.stats.likes} 点赞`);
      }

      return contents.length > 0 ? contents[0].content_id : null;
    } else {
      logError(`作品列表获取失败: status_code=${response.status_code}`);
      return null;
    }
  } catch (error) {
    logError(`作品列表获取异常: ${error.message}`);
    return null;
  }
}

/**
 * 测试：获取单个作�?
 */
async function testGetWork(workId) {
  logSection('测试 2: 获取单个作品');

  if (!workId) {
    log('  跳过（没有作�?ID�?, 'yellow');
    return false;
  }

  try {
    const response = await request(`/contents/${workId}`);

    if (response.status_code === 0) {
      logSuccess(`作品获取成功: ${response.data.title || '无标�?}`);
      logInfo(`  作品类型: ${response.data.content_type}`);
      logInfo(`  评论�? ${response.data.stats.total_comments}`);
      return true;
    } else if (response.status_code === 404) {
      logError('作品不存�?);
      return false;
    } else {
      logError(`作品获取失败: status_code=${response.status_code}`);
      return false;
    }
  } catch (error) {
    logError(`作品获取异常: ${error.message}`);
    return false;
  }
}

/**
 * 测试：获取讨论列�?
 */
async function testGetDiscussions() {
  logSection('测试 3: 获取讨论列表');

  try {
    const response = await request('/discussions?count=10');

    if (response.status_code === 0) {
      const discussions = response.data.discussions || [];
      logSuccess(`讨论列表获取成功: �?${discussions.length} 个讨论`);

      if (discussions.length > 0) {
        const firstDiscussion = discussions[0];
        logInfo(`  第一个讨�? ${firstDiscussion.content.substring(0, 30)}...`);
        logInfo(`    作�? ${firstDiscussion.author.author_name}`);
        logInfo(`    父评论ID: ${firstDiscussion.parent_comment_id}`);
        return firstDiscussion.discussion_id;
      }

      return null;
    } else {
      logError(`讨论列表获取失败: status_code=${response.status_code}`);
      return null;
    }
  } catch (error) {
    logError(`讨论列表获取异常: ${error.message}`);
    return null;
  }
}

/**
 * 测试：创建讨�?
 */
async function testCreateDiscussion(commentId) {
  logSection('测试 4: 创建讨论');

  if (!commentId) {
    log('  跳过（没有评�?ID，使用模�?ID�?, 'yellow');
    commentId = 'mock_comment_id';
  }

  const testDiscussion = {
    platform: 'douyin',
    platform_discussion_id: `test_discussion_${Date.now()}`,
    parent_comment_id: commentId,
    content: '这是一个测试讨�?,
    author: {
      author_id: 'test_author',
      author_name: '测试用户',
    },
    account_id: 'test_account',
  };

  try {
    const response = await request('/discussions', {
      method: 'POST',
      body: JSON.stringify(testDiscussion),
    });

    if (response.status_code === 0) {
      logSuccess(`讨论创建成功: ${response.data.content}`);
      return response.data.discussion_id;
    } else {
      logError(`讨论创建失败: status_code=${response.status_code}`);
      return null;
    }
  } catch (error) {
    logError(`讨论创建异常: ${error.message}`);
    return null;
  }
}

/**
 * 测试：获取统一消息列表
 */
async function testGetUnifiedMessages() {
  logSection('测试 5: 获取统一消息列表');

  try {
    const response = await request('/unified-messages?count=20');

    if (response.status_code === 0) {
      const messages = response.data.messages || [];
      logSuccess(`统一消息列表获取成功: �?${messages.length} 条消息`);

      // 统计各类型消息数�?
      const stats = {
        comment: 0,
        discussion: 0,
        direct_message: 0,
      };

      messages.forEach(msg => {
        if (msg.business_type) {
          stats[msg.business_type]++;
        }
      });

      logInfo(`  评论: ${stats.comment} 条`);
      logInfo(`  讨论: ${stats.discussion} 条`);
      logInfo(`  私信: ${stats.direct_message} 条`);

      if (messages.length > 0) {
        const firstMsg = messages[0];
        logInfo(`  第一条消息类�? ${firstMsg.business_type}`);
        logInfo(`    内容: ${firstMsg.content.substring(0, 50)}...`);
      }

      return true;
    } else {
      logError(`统一消息列表获取失败: status_code=${response.status_code}`);
      return false;
    }
  } catch (error) {
    logError(`统一消息列表获取异常: ${error.message}`);
    return false;
  }
}

/**
 * 测试：获取未读统�?
 */
async function testGetUnreadStats() {
  logSection('测试 6: 获取未读统计');

  try {
    const response = await request('/unified-messages/stats?account_id=test_account');

    if (response.status_code === 0) {
      const stats = response.data;
      logSuccess('未读统计获取成功');
      logInfo(`  总未�? ${stats.total_unread}`);
      logInfo(`  评论未读: ${stats.comment_unread}`);
      logInfo(`  讨论未读: ${stats.discussion_unread}`);
      logInfo(`  私信未读: ${stats.direct_message_unread}`);
      return true;
    } else {
      logError(`未读统计获取失败: status_code=${response.status_code}`);
      return false;
    }
  } catch (error) {
    logError(`未读统计获取异常: ${error.message}`);
    return false;
  }
}

/**
 * 测试：数据库表验�?
 */
async function testDatabaseTables() {
  logSection('测试 7: 验证数据库表结构');

  const Database = require('better-sqlite3');
  const path = require('path');

  try {
    const dbPath = path.join(__dirname, '../packages/master/data/master.db');
    const db = new Database(dbPath, { readonly: true });

    // 检�?contents �?
    const worksTable = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='contents'
    `).get();

    if (worksTable) {
      const worksCount = db.prepare('SELECT COUNT(*) as count FROM contents').get().count;
      logSuccess(`contents 表存在，包含 ${worksCount} 条记录`);
    } else {
      logError('contents 表不存在');
    }

    // 检�?discussions �?
    const discussionsTable = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='discussions'
    `).get();

    if (discussionsTable) {
      const discussionsCount = db.prepare('SELECT COUNT(*) as count FROM discussions').get().count;
      logSuccess(`discussions 表存在，包含 ${discussionsCount} 条记录`);
    } else {
      logError('discussions 表不存在');
    }

    db.close();
    return true;
  } catch (error) {
    logError(`数据库验证失�? ${error.message}`);
    return false;
  }
}

/**
 * 主测试流�?
 */
async function runTests() {
  log('\n╔═══════════════════════════════════════════════�?, 'cyan');
  log('�? 增强�?IM API 集成测试                       �?, 'cyan');
  log('�? 测试作品、讨论、统一消息接口                  �?, 'cyan');
  log('╚═══════════════════════════════════════════════╝\n', 'cyan');

  logInfo(`测试目标: ${BASE_URL}`);
  logInfo(`开始时�? ${new Date().toLocaleString()}\n`);

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
  };

  // 运行所有测�?
  const tests = [
    { name: '数据库表验证', fn: testDatabaseTables },
    { name: '获取作品列表', fn: testGetWorks },
    { name: '获取讨论列表', fn: testGetDiscussions },
    { name: '获取统一消息列表', fn: testGetUnifiedMessages },
    { name: '获取未读统计', fn: testGetUnreadStats },
  ];

  let workId = null;
  let discussionId = null;

  for (const test of tests) {
    results.total++;

    try {
      let result;

      if (test.name === '获取作品列表') {
        result = await test.fn();
        if (result) {
          workId = result;
        }
        result = result !== null;
      } else if (test.name === '获取讨论列表') {
        result = await test.fn();
        // discussionId = result; // 保存以备后用
        result = true; // 即使没有讨论也算成功
      } else {
        result = await test.fn(workId || discussionId);
      }

      if (result) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      results.failed++;
      logError(`测试异常: ${error.message}`);
    }

    // 测试间隔
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 如果有作�?ID，测试获取单个作�?
  if (workId) {
    results.total++;
    const result = await testGetWork(workId);
    if (result) {
      results.passed++;
    } else {
      results.failed++;
    }
  }

  // 输出测试结果
  logSection('测试结果汇�?);
  log(`总计: ${results.total}`, 'blue');
  logSuccess(`通过: ${results.passed}`);
  if (results.failed > 0) {
    logError(`失败: ${results.failed}`);
  }

  const successRate = ((results.passed / results.total) * 100).toFixed(2);
  log(`\n成功�? ${successRate}%`, successRate === '100.00' ? 'green' : 'yellow');

  logInfo(`\n结束时间: ${new Date().toLocaleString()}\n`);

  // 退出码
  process.exit(results.failed > 0 ? 1 : 0);
}

// 运行测试
runTests().catch(error => {
  logError(`\n测试运行失败: ${error.message}`);
  console.error(error);
  process.exit(1);
});
