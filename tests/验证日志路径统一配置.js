/**
 * 验证日志路径统一配置
 *
 * 测试不同服务�?logger 是否都使用正确的日志目录
 */

const { createLogger } = require('../packages/shared/utils/logger');
const path = require('path');

console.log('�?.repeat(60));
console.log('  验证日志路径统一配置');
console.log('�?.repeat(60));
console.log();

// 测试用例
const testCases = [
  // Worker 相关服务
  { name: 'worker', expectedDir: 'packages/worker/logs' },
  { name: 'douyin-platform', expectedDir: 'packages/worker/logs' },
  { name: 'data-manager:acc-001', expectedDir: 'packages/worker/logs' },
  { name: 'douyin-data:acc-001', expectedDir: 'packages/worker/logs' },
  { name: 'browser-manager-v2', expectedDir: 'packages/worker/logs' },
  { name: 'crawl-direct-messages-v2', expectedDir: 'packages/worker/logs' },
  { name: 'api-interceptor', expectedDir: 'packages/worker/logs' },
  { name: 'cache-manager', expectedDir: 'packages/worker/logs' },

  // Master 相关服务
  { name: 'master', expectedDir: 'packages/master/logs' },
  { name: 'worker-dao', expectedDir: 'packages/master/logs' },
  { name: 'account-dao', expectedDir: 'packages/master/logs' },
  { name: 'notification-broadcaster', expectedDir: 'packages/master/logs' },

  // Admin 相关服务
  { name: 'admin-web', expectedDir: 'packages/admin-web/logs' },

  // 其他服务（应该使用默认路径）
  { name: 'shared', expectedDir: 'logs' },
  { name: 'unknown-service', expectedDir: 'logs' },
];

// 获取 PROJECT_ROOT
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log(`项目根目�? ${PROJECT_ROOT}\n`);

let passedCount = 0;
let failedCount = 0;

// 测试每个服务
testCases.forEach(testCase => {
  // 创建 logger
  const logger = createLogger(testCase.name);

  // 获取实际的日志目�?
  // Winston File transport �?dirname 属�?
  const fileTransport = logger.transports.find(t => t.constructor.name === 'File');

  if (!fileTransport) {
    console.log(`�?${testCase.name.padEnd(35)} - 未找到文件传输器`);
    console.log(`   可用传输�? ${logger.transports.map(t => t.constructor.name).join(', ')}`);
    failedCount++;
    return;
  }

  // 直接使用 dirname 属�?
  const actualDir = fileTransport.dirname;
  const expectedFullPath = testCase.expectedDir === 'logs'
    ? path.join(PROJECT_ROOT, 'logs')  // 绝对路径
    : path.resolve(PROJECT_ROOT, testCase.expectedDir);
  const normalizedActual = path.normalize(actualDir);
  const normalizedExpected = path.normalize(expectedFullPath);

  // 比较路径
  const passed = normalizedActual === normalizedExpected;

  if (passed) {
    console.log(`�?${testCase.name.padEnd(35)} �?${path.relative(PROJECT_ROOT, actualDir)}`);
    passedCount++;
  } else {
    console.log(`�?${testCase.name.padEnd(35)}`);
    console.log(`   期望: ${path.relative(PROJECT_ROOT, expectedFullPath)}`);
    console.log(`   实际: ${path.relative(PROJECT_ROOT, actualDir)}`);
    failedCount++;
  }
});

console.log();
console.log('�?.repeat(60));
console.log(`测试结果: ${passedCount} 通过, ${failedCount} 失败`);
console.log('�?.repeat(60));

// 测试环境变量覆盖
console.log();
console.log('📌 测试环境变量覆盖...');
process.env.LOG_DIR = '/custom/log/path';
const customLogger = createLogger('test-service');
const customFileTransport = customLogger.transports.find(t => t.constructor.name === 'File');
const customDir = customFileTransport?.dirname;

const expectedCustomDir = path.normalize('/custom/log/path');
const actualCustomDir = path.normalize(customDir);

if (actualCustomDir === expectedCustomDir) {
  console.log(`�?环境变量 LOG_DIR 覆盖成功: ${customDir}`);
} else {
  console.log(`�?环境变量 LOG_DIR 覆盖失败`);
  console.log(`   期望: ${expectedCustomDir}`);
  console.log(`   实际: ${actualCustomDir}`);
}

// 清除环境变量
delete process.env.LOG_DIR;

console.log();
console.log('�?日志路径统一配置验证完成');
console.log();

// 退出码
process.exit(failedCount > 0 ? 1 : 0);
