/**
 * 测试脚本：监控 DataManager 数据内容日志
 *
 * 功能：
 * 1. 实时监控 Worker 日志目录
 * 2. 检测新创建的 data-manager 和 douyin-data 日志文件
 * 3. 显示实际数据 upsert 操作的日志内容
 * 4. 验证数据完整性
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const WORKER_LOG_DIR = path.join(__dirname, '../packages/worker/logs');

console.log('='.repeat(80));
console.log('监控：DataManager 数据内容日志');
console.log('='.repeat(80));
console.log(`日志目录: ${WORKER_LOG_DIR}\n`);

// 要监控的日志文件模式
const targetPatterns = [
  /^data-manager_acc-.+\.log$/,
  /^douyin-data_acc-.+\.log$/
];

console.log('🔍 监控目标文件模式：');
targetPatterns.forEach(pattern => {
  console.log(`   - ${pattern}`);
});

// 存储已监控的文件和它们的最后读取位置
const monitoredFiles = new Map();

/**
 * 扫描日志目录，找到匹配的文件
 */
function scanLogDirectory() {
  if (!fs.existsSync(WORKER_LOG_DIR)) {
    console.log('⚠️  日志目录不存在，等待创建...');
    return [];
  }

  const files = fs.readdirSync(WORKER_LOG_DIR);
  const matchedFiles = files.filter(file => {
    return targetPatterns.some(pattern => pattern.test(file));
  });

  return matchedFiles;
}

/**
 * 读取文件的新增内容
 */
function readNewContent(filePath, lastPosition) {
  const stats = fs.statSync(filePath);
  const currentSize = stats.size;

  if (currentSize <= lastPosition) {
    return { content: '', newPosition: currentSize };
  }

  const stream = fs.createReadStream(filePath, {
    start: lastPosition,
    encoding: 'utf-8'
  });

  let content = '';
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => {
      content += chunk;
    });
    stream.on('end', () => {
      resolve({ content, newPosition: currentSize });
    });
    stream.on('error', reject);
  });
}

/**
 * 解析并格式化日志行
 */
function formatLogLine(line) {
  try {
    const log = JSON.parse(line);
    const timestamp = log.timestamp || '';
    const level = log.level || '';
    const service = log.service || '';
    const message = log.message || '';

    // 提取关键信息
    let highlight = '';
    if (message.includes('Upsert')) {
      highlight = '📝 数据插入';
    } else if (message.includes('Update')) {
      highlight = '🔄 数据更新';
    } else if (message.includes('Delete')) {
      highlight = '🗑️  数据删除';
    } else if (message.includes('Fetch')) {
      highlight = '📥 数据获取';
    } else if (message.includes('Sync')) {
      highlight = '🔄 数据同步';
    }

    // 构建格式化输出
    let output = `  ${timestamp} [${service}] [${level}]`;
    if (highlight) {
      output += ` ${highlight}`;
    }
    output += `\n    ${message}`;

    // 如果有额外的元数据，也显示出来
    const extraKeys = Object.keys(log).filter(k =>
      !['timestamp', 'level', 'service', 'message'].includes(k)
    );
    if (extraKeys.length > 0) {
      const extra = {};
      extraKeys.forEach(k => {
        extra[k] = log[k];
      });
      output += `\n    ${JSON.stringify(extra, null, 2).split('\n').join('\n    ')}`;
    }

    return output;
  } catch (e) {
    return `  ${line}`;
  }
}

/**
 * 监控单个文件
 */
async function monitorFile(fileName) {
  const filePath = path.join(WORKER_LOG_DIR, fileName);

  if (!monitoredFiles.has(fileName)) {
    console.log(`\n✅ 检测到新文件: ${fileName}`);
    monitoredFiles.set(fileName, 0);
  }

  const lastPosition = monitoredFiles.get(fileName);

  try {
    const { content, newPosition } = await readNewContent(filePath, lastPosition);

    if (content) {
      console.log(`\n📄 ${fileName} (新增 ${content.length} 字节):`);
      console.log('-'.repeat(80));

      const lines = content.trim().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(formatLogLine(line));
        }
      });

      console.log('-'.repeat(80));
    }

    monitoredFiles.set(fileName, newPosition);
  } catch (error) {
    console.error(`❌ 读取文件失败: ${fileName}`, error.message);
  }
}

/**
 * 主监控循环
 */
async function monitorLoop() {
  const matchedFiles = scanLogDirectory();

  for (const fileName of matchedFiles) {
    await monitorFile(fileName);
  }
}

// 启动监控
console.log('\n🚀 开始监控...\n');
console.log('提示：请在另一个终端运行 Master 或 Worker，本脚本将实时显示数据日志。');
console.log('按 Ctrl+C 停止监控。\n');

let monitorCount = 0;
const monitorInterval = setInterval(async () => {
  monitorCount++;

  // 每 10 次输出一次心跳
  if (monitorCount % 10 === 0) {
    const fileCount = monitoredFiles.size;
    if (fileCount === 0) {
      console.log(`[${new Date().toLocaleTimeString()}] ⏳ 等待日志文件创建... (已等待 ${monitorCount * 2}秒)`);
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] 💓 监控中 (${fileCount} 个文件)`);
    }
  }

  await monitorLoop();
}, 2000); // 每 2 秒检查一次

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n⏹️  停止监控');
  clearInterval(monitorInterval);

  console.log('\n📊 监控统计：');
  console.log(`   监控文件数: ${monitoredFiles.size}`);
  monitoredFiles.forEach((position, fileName) => {
    console.log(`   - ${fileName}: 读取了 ${position} 字节`);
  });

  process.exit(0);
});
