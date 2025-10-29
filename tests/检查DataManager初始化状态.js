/**
 * 检查 DataManager 初始化状态
 *
 * 功能：
 * 1. 检查 Worker 日志中是否有 DataManager 初始化相关日志
 * 2. 分析可能的问题
 */

const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '../packages/worker/logs/worker.log');

console.log('═══════════════════════════════════════════════════════');
console.log('  DataManager 初始化状态检查');
console.log('═══════════════════════════════════════════════════════\n');

// 读取日志文件
if (!fs.existsSync(logFile)) {
  console.error('❌ 日志文件不存在:', logFile);
  process.exit(1);
}

const logs = fs.readFileSync(logFile, 'utf-8').trim().split('\n');

console.log(`📄 日志文件: ${logFile}`);
console.log(`📊 总行数: ${logs.length}\n`);

// 查找最近一次 Worker 启动
let lastStartIndex = -1;
for (let i = logs.length - 1; i >= 0; i--) {
  if (logs[i].includes('Worker Starting')) {
    lastStartIndex = i;
    break;
  }
}

if (lastStartIndex === -1) {
  console.error('❌ 未找到 Worker 启动记录');
  process.exit(1);
}

console.log(`🔍 找到最近一次 Worker 启动: 行 ${lastStartIndex + 1}\n`);

// 分析最近一次启动后的日志
const recentLogs = logs.slice(lastStartIndex);

// 关键事件检查
const checkpoints = {
  workerStarting: '║  Worker Starting',
  workerReady: '║  Worker Ready',
  browsersInitialized: '✓ Browsers initialized',
  platformsInitializing: 'Initializing platforms for',
  platformsInitialized: '✓ Platforms initialized',

  // DataManager 相关
  douyinPlatformInit: 'Initializing Douyin platform for account',
  douyinDataManagerCreating: 'Creating DouyinDataManager for account',
  dataManagerInitialized: 'DataManager initialized for account',
  autoSyncEnabled: 'Auto-sync enabled for account',

  // AccountDataManager 相关
  accountDataManagerInit: 'AccountDataManager initialized for',
};

const found = {};
const details = {};

for (const [key, pattern] of Object.entries(checkpoints)) {
  const matchedLogs = recentLogs.filter(log => log.includes(pattern));
  found[key] = matchedLogs.length > 0;
  details[key] = matchedLogs;
}

// 输出结果
console.log('═══ 关键事件检查 ═══\n');

console.log('📦 基础组件:');
console.log(`  ${found.workerStarting ? '✅' : '❌'} Worker 启动`);
console.log(`  ${found.browsersInitialized ? '✅' : '❌'} 浏览器初始化`);
console.log(`  ${found.platformsInitializing ? '✅' : '❌'} 平台初始化开始`);
console.log(`  ${found.platformsInitialized ? '✅' : '❌'} 平台初始化完成`);
console.log(`  ${found.workerReady ? '✅' : '❌'} Worker 就绪\n`);

console.log('🔧 DataManager 组件:');
console.log(`  ${found.douyinPlatformInit ? '✅' : '❌'} DouyinPlatform.initialize() 被调用`);
console.log(`  ${found.douyinDataManagerCreating ? '✅' : '❌'} DouyinDataManager 创建`);
console.log(`  ${found.accountDataManagerInit ? '✅' : '❌'} AccountDataManager 初始化`);
console.log(`  ${found.dataManagerInitialized ? '✅' : '❌'} DataManager 初始化完成`);
console.log(`  ${found.autoSyncEnabled ? '✅' : '❌'} 自动同步启用\n`);

// 详细信息
if (found.platformsInitializing) {
  console.log('═══ 平台初始化详情 ═══\n');
  details.platformsInitializing.forEach((log, i) => {
    try {
      const parsed = JSON.parse(log);
      console.log(`  ${i + 1}. ${parsed.message}`);
      console.log(`     时间: ${parsed.timestamp}`);
    } catch (e) {
      console.log(`  ${i + 1}. ${log}`);
    }
  });
  console.log();
}

if (found.platformsInitialized) {
  console.log('═══ 平台初始化结果 ═══\n');
  details.platformsInitialized.forEach((log, i) => {
    try {
      const parsed = JSON.parse(log);
      console.log(`  ${i + 1}. ${parsed.message}`);
      console.log(`     时间: ${parsed.timestamp}`);
    } catch (e) {
      console.log(`  ${i + 1}. ${log}`);
    }
  });
  console.log();
}

// 搜索错误信息
const errors = recentLogs.filter(log => log.includes('"level":"error"'));
if (errors.length > 0) {
  console.log('═══ 错误信息 ═══\n');
  errors.forEach((log, i) => {
    try {
      const parsed = JSON.parse(log);
      console.log(`  ${i + 1}. ${parsed.message}`);
      if (parsed.stack) {
        console.log(`     堆栈:\n${parsed.stack.split('\\n').map(line => '       ' + line).join('\\n')}`);
      }
    } catch (e) {
      console.log(`  ${i + 1}. ${log}`);
    }
  });
  console.log();
}

// 诊断
console.log('═══ 诊断结果 ═══\n');

if (!found.platformsInitializing) {
  console.log('❌ 问题：平台初始化流程未启动');
  console.log('   原因：Worker 主入口中的平台初始化代码可能未执行');
  console.log('   建议：检查 packages/worker/src/index.js 中的平台初始化代码\n');
} else if (!found.platformsInitialized) {
  console.log('❌ 问题：平台初始化流程启动但未完成');
  console.log('   原因：平台初始化过程中可能抛出了异常');
  console.log('   建议：检查错误日志\n');
} else if (!found.douyinDataManagerCreating) {
  console.log('⚠️  问题：DouyinDataManager 未被创建');
  console.log('   原因：platform.createDataManager() 可能未被调用');
  console.log('   可能原因：');
  console.log('     1. platform-base.js 的 initializeDataManager() 未被调用');
  console.log('     2. createDataManager() 日志级别不对（应该是 info）');
  console.log('     3. logger 实例配置有问题\n');
} else if (!found.accountDataManagerInit) {
  console.log('⚠️  问题：AccountDataManager 初始化日志缺失');
  console.log('   原因：AccountDataManager 构造函数中的日志可能未输出');
  console.log('   建议：检查 account-data-manager.js 的 logger 配置\n');
} else {
  console.log('✅ DataManager 初始化成功！\n');
  console.log('   详细日志：');
  if (details.douyinDataManagerCreating.length > 0) {
    details.douyinDataManagerCreating.forEach((log, i) => {
      try {
        const parsed = JSON.parse(log);
        console.log(`   - ${parsed.message} (${parsed.timestamp})`);
      } catch (e) {
        console.log(`   - ${log}`);
      }
    });
  }
  if (details.accountDataManagerInit.length > 0) {
    details.accountDataManagerInit.forEach((log, i) => {
      try {
        const parsed = JSON.parse(log);
        console.log(`   - ${parsed.message} (${parsed.timestamp})`);
      } catch (e) {
        console.log(`   - ${log}`);
      }
    });
  }
  console.log();
}

console.log('═══════════════════════════════════════════════════════');
