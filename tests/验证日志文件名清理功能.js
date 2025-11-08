/**
 * 测试脚本：验证日志文件名清理功能
 *
 * 测试目标�?
 * 1. 验证包含非法字符的服务名称能正确创建日志文件
 * 2. 验证文件名清理函数的转换规则
 * 3. 验证实际日志写入功能
 */

const path = require('path');
const fs = require('fs');
const { createLogger } = require('../packages/shared/utils/logger');

console.log('='.repeat(80));
console.log('测试：日志文件名清理功能验证');
console.log('='.repeat(80));

// 测试用例：包含各种非法字符的服务名称
const testCases = [
  {
    name: '冒号字符',
    serviceName: 'data-manager:acc-001',
    expectedFileName: 'data-manager_acc-001.log',
    description: '最常见的场�?- DataManager 日志'
  },
  {
    name: '多个冒号',
    serviceName: 'douyin-data:acc-001:conv-123',
    expectedFileName: 'douyin-data_acc-001_conv-123.log',
    description: '多层级标识符'
  },
  {
    name: '斜杠字符',
    serviceName: 'worker/platform',
    expectedFileName: 'worker_platform.log',
    description: '路径分隔�?
  },
  {
    name: '反斜杠字�?,
    serviceName: 'test\\service',
    expectedFileName: 'test_service.log',
    description: 'Windows 路径分隔�?
  },
  {
    name: '星号字符',
    serviceName: 'crawler*v2',
    expectedFileName: 'crawler_v2.log',
    description: '通配�?
  },
  {
    name: '问号字符',
    serviceName: 'test?debug',
    expectedFileName: 'test_debug.log',
    description: 'URL 查询参数'
  },
  {
    name: '多种非法字符组合',
    serviceName: 'service<>:"/\\|?*test',
    expectedFileName: 'service_________test.log',
    description: '所�?Windows 非法字符'
  },
  {
    name: '正常服务�?,
    serviceName: 'normal-service-name',
    expectedFileName: 'normal-service-name.log',
    description: '不包含非法字�?
  }
];

let passCount = 0;
let failCount = 0;

console.log('\n📝 测试用例列表�?);
testCases.forEach((tc, idx) => {
  console.log(`  ${idx + 1}. ${tc.name}: ${tc.serviceName} �?${tc.expectedFileName}`);
});

console.log('\n' + '='.repeat(80));
console.log('开始测�?..\n');

// 创建临时测试目录
const testLogDir = path.join(__dirname, '../logs/test-logger-sanitize');
if (!fs.existsSync(testLogDir)) {
  fs.mkdirSync(testLogDir, { recursive: true });
}

testCases.forEach((testCase, index) => {
  console.log(`\n[测试 ${index + 1}/${testCases.length}] ${testCase.name}`);
  console.log(`  服务�? ${testCase.serviceName}`);
  console.log(`  期望文件�? ${testCase.expectedFileName}`);
  console.log(`  说明: ${testCase.description}`);

  try {
    // 设置环境变量强制使用测试目录
    process.env.LOG_DIR = testLogDir;

    // 创建 logger
    const logger = createLogger(testCase.serviceName);

    // 写入测试日志
    const testMessage = `Test message from ${testCase.serviceName}`;
    logger.info(testMessage);
    logger.debug('Debug level message');
    logger.error('Error level message');

    // 等待日志写入
    setTimeout(() => {
      // 检查文件是否创�?
      const expectedFilePath = path.join(testLogDir, testCase.expectedFileName);
      const expectedErrorFilePath = path.join(testLogDir, testCase.expectedFileName.replace('.log', '-error.log'));

      const fileExists = fs.existsSync(expectedFilePath);
      const errorFileExists = fs.existsSync(expectedErrorFilePath);

      console.log(`  �?检查文�? ${expectedFilePath}`);
      console.log(`    文件存在: ${fileExists ? '�? : '�?}`);

      if (fileExists) {
        const stats = fs.statSync(expectedFilePath);
        console.log(`    文件大小: ${stats.size} 字节`);

        // 读取文件内容验证
        const content = fs.readFileSync(expectedFilePath, 'utf-8');
        const lines = content.trim().split('\n');
        console.log(`    日志行数: ${lines.length}`);

        // 验证日志内容
        const hasInfoLog = content.includes(testMessage);
        const hasDebugLog = content.includes('Debug level message');

        console.log(`    包含 INFO 日志: ${hasInfoLog ? '�? : '�?}`);
        console.log(`    包含 DEBUG 日志: ${hasDebugLog ? '�? : '�?}`);

        // 检�?error 文件
        console.log(`  �?检查错误日�? ${expectedErrorFilePath}`);
        console.log(`    错误文件存在: ${errorFileExists ? '�? : '�?}`);

        if (errorFileExists) {
          const errorStats = fs.statSync(expectedErrorFilePath);
          console.log(`    错误文件大小: ${errorStats.size} 字节`);

          const errorContent = fs.readFileSync(expectedErrorFilePath, 'utf-8');
          const hasErrorLog = errorContent.includes('Error level message');
          console.log(`    包含 ERROR 日志: ${hasErrorLog ? '�? : '�?}`);

          if (fileExists && hasInfoLog && hasDebugLog && errorFileExists && hasErrorLog) {
            console.log(`\n  �?测试通过`);
            passCount++;
          } else {
            console.log(`\n  �?测试失败：日志内容不完整`);
            failCount++;
          }
        } else {
          console.log(`\n  �?测试失败：错误日志文件未创建`);
          failCount++;
        }
      } else {
        console.log(`\n  �?测试失败：日志文件未创建`);
        failCount++;
      }

      // 最后一个测试完成后输出总结
      if (index === testCases.length - 1) {
        setTimeout(() => {
          console.log('\n' + '='.repeat(80));
          console.log('测试总结');
          console.log('='.repeat(80));
          console.log(`总测试数: ${testCases.length}`);
          console.log(`通过: ${passCount} ✅`);
          console.log(`失败: ${failCount} ❌`);
          console.log(`成功�? ${((passCount / testCases.length) * 100).toFixed(1)}%`);

          if (failCount === 0) {
            console.log('\n🎉 所有测试通过！日志文件名清理功能正常工作�?);
          } else {
            console.log('\n⚠️  部分测试失败，请检查日志配置�?);
          }

          console.log('\n📁 测试日志目录:', testLogDir);
          console.log('   可以查看该目录验证生成的日志文件�?);

          // 清理环境变量
          delete process.env.LOG_DIR;
        }, 500);
      }
    }, 200);

  } catch (error) {
    console.log(`\n  �?测试失败�?{error.message}`);
    failCount++;
  }
});
