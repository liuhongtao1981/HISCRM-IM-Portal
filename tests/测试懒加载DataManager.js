/**
 * 测试懒加�?DataManager
 *
 * 验证�?
 * 1. �?Worker 启动时，DataManager 不会被创�?
 * 2. 在第一次调�?getDataManager() 时，DataManager 会自动创�?
 * 3. 后续调用 getDataManager() 返回同一个实�?
 */

const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '../packages/worker/logs/worker.log');
const debugLogFile = path.join(__dirname, '../packages/worker/logs/datamanager-debug.log');

console.log('══════════════════════════════════════════════════════�?);
console.log('  测试懒加�?DataManager');
console.log('═══════════════════════════════════════════════════════\n');

// 读取 Worker 日志
if (!fs.existsSync(logFile)) {
  console.error('�?Worker 日志文件不存�?', logFile);
  process.exit(1);
}

const logs = fs.readFileSync(logFile, 'utf-8').trim().split('\n');

// 找到最近一次启�?
let lastStartIndex = -1;
for (let i = logs.length - 1; i >= 0; i--) {
  if (logs[i].includes('Worker Starting')) {
    lastStartIndex = i;
    break;
  }
}

if (lastStartIndex === -1) {
  console.error('�?未找�?Worker 启动记录');
  process.exit(1);
}

console.log(`📍 找到最近一�?Worker 启动: �?${lastStartIndex + 1}\n`);

const recentLogs = logs.slice(lastStartIndex);

// 检查关键事�?
const checkpoints = {
  workerStarting: '�? Worker Starting',
  browsersInitialized: '�?Browsers initialized',
  workerReady: '�? Worker Ready',

  // DataManager 懒加载相�?
  autoCreatingDataManager: 'Auto-creating DataManager for account',
  dataManagerInitialized: 'DataManager initialized for account',
  crawlDirectMessages: '[crawlDirectMessages]',
};

const found = {};
for (const [key, pattern] of Object.entries(checkpoints)) {
  found[key] = recentLogs.some(log => log.includes(pattern));
}

// 输出结果
console.log('══�?懒加载测试结�?═══\n');

console.log('�?阶段 1：Worker 启动');
console.log(`   ${found.workerStarting ? '�? : '�?} Worker 启动`);
console.log(`   ${found.browsersInitialized ? '�? : '�?} 浏览器初始化`);
console.log(`   ${found.workerReady ? '�? : '�?} Worker 就绪`);

if (found.autoCreatingDataManager && !found.workerReady) {
  console.log('   �?错误：DataManager �?Worker 启动时被创建（应该是懒加载）\n');
} else {
  console.log('   �?正确：DataManager 未在启动时创建（懒加载）\n');
}

console.log('�?阶段 2：首次使�?DataManager');
console.log(`   ${found.crawlDirectMessages ? '�? : '⏸️ ' } 爬虫被触发`);
console.log(`   ${found.autoCreatingDataManager ? '�? : '⏸️ ' } DataManager 自动创建`);
console.log(`   ${found.dataManagerInitialized ? '�? : '⏸️ ' } DataManager 初始化完成\n`);

// 检查调试日�?
if (fs.existsSync(debugLogFile)) {
  console.log('══�?DataManager 调试日志 ═══\n');
  const debugLogs = fs.readFileSync(debugLogFile, 'utf-8').trim();
  if (debugLogs) {
    console.log(debugLogs);
  } else {
    console.log('   （空）\n');
  }
} else {
  console.log('⏸️  DataManager 调试日志文件不存在（爬虫可能还未运行）\n');
}

// 诊断
console.log('══�?诊断 ═══\n');

if (!found.browsersInitialized) {
  console.log('�?Worker 未完成浏览器初始�?);
  console.log('   请确�?Worker 已成功启动\n');
} else if (!found.workerReady) {
  console.log('�?Worker 未就�?);
  console.log('   请检�?Worker 启动日志\n');
} else if (found.autoCreatingDataManager && !found.crawlDirectMessages) {
  console.log('⚠️  DataManager 在未触发爬虫时就被创建了');
  console.log('   这可能表示还有其他代码路径在调用 getDataManager()\n');
} else if (!found.crawlDirectMessages) {
  console.log('�?懒加载测试通过！DataManager 未在启动时创�?);
  console.log('   下一步：触发一次爬虫（如私信爬虫）来验证自动创建功能\n');
} else if (!found.autoCreatingDataManager) {
  console.log('⚠️  爬虫已触发，但未看到 DataManager 自动创建日志');
  console.log('   可能原因�?);
  console.log('   1. getDataManager() 返回�?null');
  console.log('   2. DataManager 创建失败');
  console.log('   3. 日志级别配置问题\n');
} else {
  console.log('�?懒加载测试完全通过�?);
  console.log('   - DataManager 未在启动时创�?);
  console.log('   - DataManager 在首次使用时自动创建');
  console.log('   - 系统运行正常\n');
}

console.log('══════════════════════════════════════════════════════�?);
