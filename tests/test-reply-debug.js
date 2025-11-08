#!/usr/bin/env node

/**
 * 回复功能完整调试脚本
 * 用于测试private message回复的整个流�?
 * 包含编码检查、API测试、数据库验证
 */

const http = require('http');
const Database = require('better-sqlite3');
const path = require('path');

// 配置
const CONFIG = {
  API_HOST: 'localhost',
  API_PORT: 3000,
  DB_PATH: './packages/master/data/master.db',
  TEST_ACCOUNT_ID: 'acc-35199aa6-967b-4a99-af89-c122bf1f5c52',
  TEST_MESSAGE_ID: '7437896255660017187',
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(color, label, message) {
  console.log(`${colors[color]}[${label}]${colors.reset} ${message}`);
}

function success(msg) { log('green', '�?, msg); }
function error(msg) { log('red', '�?, msg); }
function info(msg) { log('blue', 'ℹ️ ', msg); }
function warn(msg) { log('yellow', '⚠️ ', msg); }
function debug(msg) { log('magenta', '🔍', msg); }

// 测试1: 检查数据库连接和编�?
async function testDatabaseEncoding() {
  console.log('\n' + '='.repeat(60));
  console.log('测试1: 数据库编码检�?);
  console.log('='.repeat(60));

  try {
    const db = new Database(CONFIG.DB_PATH);

    // 检查encoding pragma
    const encoding = db.pragma('encoding');
    info(`Database encoding: ${encoding[0]?.encoding || 'Unknown'}`);

    if (encoding[0]?.encoding === 'UTF-8') {
      success('数据库编码设置正�?(UTF-8)');
    } else {
      error('数据库编码设置不正确');
    }

    // 检查表是否存在
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='replies'").all();
    if (tables.length > 0) {
      success('Replies表存�?);
    } else {
      warn('Replies表不存在');
    }

    db.close();
  } catch (err) {
    error(`数据库连接失�? ${err.message}`);
  }
}

// 测试2: 测试UTF-8编码的字符串
async function testUTF8Strings() {
  console.log('\n' + '='.repeat(60));
  console.log('测试2: UTF-8字符串处�?);
  console.log('='.repeat(60));

  const testStrings = [
    '简单中文测�?,
    '包含符号的测�?@#$%',
    '混合English和中�?,
    '表情符号测试😀🎉',
    '特殊字符：©®™',
  ];

  testStrings.forEach((str, idx) => {
    const utf8Bytes = Buffer.from(str, 'utf8');
    const hex = utf8Bytes.toString('hex');
    console.log(`  ${idx + 1}. "${str}"`);
    console.log(`     Length: ${str.length}, UTF-8 bytes: ${utf8Bytes.length}`);
    console.log(`     Hex: ${hex}`);
  });

  success('UTF-8字符串处理验证完�?);
}

// 测试3: 测试API连接
async function testAPIConnection() {
  console.log('\n' + '='.repeat(60));
  console.log('测试3: API连接测试');
  console.log('='.repeat(60));

  return new Promise((resolve) => {
    const options = {
      hostname: CONFIG.API_HOST,
      port: CONFIG.API_PORT,
      path: '/api/debug/browser-status',
      method: 'GET',
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          success(`API连接成功，状态码: ${res.statusCode}`);
          info(`当前账户�? ${json.totalAccounts}`);
          if (json.accounts && json.accounts.length > 0) {
            json.accounts.forEach(acc => {
              info(`  账户: ${acc.accountName} (${acc.platform}) - ${acc.loginStatus}`);
            });
          }
          resolve(true);
        } catch (e) {
          error(`API响应解析失败: ${e.message}`);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      error(`API连接失败: ${err.message}`);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      error('API连接超时');
      resolve(false);
    });

    req.end();
  });
}

// 测试4: 发送测试回�?
async function testSendReply() {
  console.log('\n' + '='.repeat(60));
  console.log('测试4: 发送测试回�?);
  console.log('='.repeat(60));

  const testCases = [
    {
      name: '基础英文测试',
      content: 'Test reply from test script',
    },
    {
      name: '中文测试',
      content: '这是测试脚本发送的中文回复',
    },
    {
      name: '混合测试',
      content: 'Mixed测试: 中文English混合 123 !@#',
    },
  ];

  for (const testCase of testCases) {
    info(`发�? ${testCase.name}`);
    debug(`内容: ${testCase.content}`);

    const requestId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const postData = JSON.stringify({
      request_id: requestId,
      account_id: CONFIG.TEST_ACCOUNT_ID,
      target_type: 'direct_message',
      target_id: CONFIG.TEST_MESSAGE_ID,
      reply_content: testCase.content,
    });

    try {
      const response = await sendAPIRequest('/api/v1/replies', 'POST', postData);

      if (response.success) {
        success(`回复已提�?- Reply ID: ${response.reply_id}`);

        // 等待数据库更�?
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 检查数据库
        verifyReplyInDatabase(requestId, testCase.content);
      } else {
        error(`API错误: ${response.error}`);
      }
    } catch (err) {
      error(`发送失�? ${err.message}`);
    }

    // 测试间隔
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// 测试5: 验证数据库中的数�?
function verifyReplyInDatabase(requestId, expectedContent) {
  try {
    const db = new Database(CONFIG.DB_PATH);
    const stmt = db.prepare('SELECT reply_content FROM replies WHERE request_id = ? LIMIT 1');
    const result = stmt.get(requestId);

    if (result) {
      const stored = result.reply_content;
      const utf8Bytes = Buffer.from(stored, 'utf8');
      const hasReplacement = stored.includes('\ufffd');

      info(`数据库验�?- Request ID: ${requestId}`);
      info(`  存储内容: ${stored}`);
      info(`  预期内容: ${expectedContent}`);
      info(`  内容匹配: ${stored === expectedContent}`);
      info(`  UTF-8字节�? ${utf8Bytes.length}`);
      info(`  包含替换字符: ${hasReplacement}`);
      info(`  Hex: ${utf8Bytes.toString('hex')}`);

      if (stored === expectedContent && !hasReplacement) {
        success(`数据库验证通过 ✓`);
      } else {
        warn(`数据库编码异常`);
      }
    } else {
      warn('数据库中未找到记�?);
    }

    db.close();
  } catch (err) {
    error(`数据库查询失�? ${err.message}`);
  }
}

// 发送API请求
function sendAPIRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.API_HOST,
      port: CONFIG.API_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      timeout: 5000,
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(body, 'utf8');
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`响应解析失败: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    if (body) {
      req.write(body, 'utf8');
    }

    req.end();
  });
}

// 测试6: 检查Worker日志
function checkWorkerLogs() {
  console.log('\n' + '='.repeat(60));
  console.log('测试6: Worker日志检�?);
  console.log('='.repeat(60));

  const fs = require('fs');
  const logFiles = [
    './packages/worker/logs/socket-client.log',
    './packages/worker/logs/task-runner.log',
    './packages/worker/logs/douyin-platform.log',
  ];

  logFiles.forEach(logFile => {
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      const lastModified = new Date(stats.mtime).toLocaleString();
      info(`${path.basename(logFile)}: ${stats.size} bytes (修改: ${lastModified})`);

      // 显示最后几�?
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n').filter(l => l.trim()).slice(-3);
      lines.forEach(line => {
        try {
          const json = JSON.parse(line);
          debug(`  [${json.service}] ${json.message}`);
        } catch (e) {
          debug(`  ${line.substring(0, 100)}`);
        }
      });
    } else {
      warn(`日志文件不存�? ${logFile}`);
    }
  });
}

// 主测试流�?
async function runAllTests() {
  console.log('\n' + '�?.repeat(60));
  console.log('�?回复功能完整调试测试开�?);
  console.log('�?.repeat(60));

  // 测试1: 数据�?
  await testDatabaseEncoding();

  // 测试2: UTF-8字符�?
  await testUTF8Strings();

  // 测试3: API连接
  const apiConnected = await testAPIConnection();
  if (!apiConnected) {
    error('API未连接，跳过后续测试');
    return;
  }

  // 测试4: 发送回�?
  await testSendReply();

  // 测试5: 检查日�?
  checkWorkerLogs();

  console.log('\n' + '�?.repeat(60));
  console.log('�?测试完成');
  console.log('�?.repeat(60));
  console.log('\n建议:');
  console.log('  1. 查看上述输出中的编码问题');
  console.log('  2. 检查Worker日志是否�?Received reply request"');
  console.log('  3. 查看浏览器是否正确输入文字并点击发送按�?);
  console.log('  4. 验证数据库中存储的内容编码是否正确\n');
}

// 运行测试
runAllTests().catch(err => {
  error(`测试执行失败: ${err.message}`);
  process.exit(1);
});
