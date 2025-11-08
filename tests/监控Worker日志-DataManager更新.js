/**
 * 监控 Worker 日志 - DataManager 更新
 *
 * 实时监控 Worker 日志文件,过滤 DataManager 相关的日志输�?
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '../packages/worker/logs');

// 需要监控的日志文件
const LOG_FILES = [
  'platform-base.log',
  'douyin-platform.log',
  'crawl-direct-messages-v2.log',
  'crawl-comments.log',
  'douyin-crawl-comments.log',
];

// DataManager 相关的关键字
const KEYWORDS = [
  'DataManager',
  'data-manager',
  'douyin-data',
  'Upserted conversation',
  'Upserted message',
  'Upserted content',
  'Upserted comment',
  'Batch upserted',
  '统一数据管理架构',
  'Auto-creating DataManager',
];

// 记录已读取的文件位置
const filePositions = new Map();

console.log('�?.repeat(60));
console.log('  监控 Worker 日志 - DataManager 更新');
console.log('�?.repeat(60));
console.log(`日志目录: ${LOGS_DIR}`);
console.log(`监控文件: ${LOG_FILES.length} 个`);
console.log(`关键�? ${KEYWORDS.join(', ')}`);
console.log('�?.repeat(60));
console.log('\n�?开始监�?.. (�?Ctrl+C 停止)\n');

/**
 * 检查日志行是否包含关键�?
 */
function containsKeyword(line) {
  return KEYWORDS.some(keyword => line.includes(keyword));
}

/**
 * 格式化日志行
 */
function formatLogLine(filename, line) {
  try {
    // 尝试解析 JSON 格式的日�?
    const log = JSON.parse(line);
    const level = (log.level || 'info').toUpperCase();
    const timestamp = log.timestamp || '';
    const message = log.message || line;
    const service = log.service || filename.replace('.log', '');

    // 根据日志级别添加颜色标记
    const levelTag = level === 'ERROR' ? '�? :
                     level === 'WARN' ? '⚠️' :
                     level === 'DEBUG' ? '🔍' :
                     '�?;

    return `${levelTag} [${service}] ${message}`;
  } catch (e) {
    // �?JSON 格式的日�?
    return `📝 [${filename}] ${line}`;
  }
}

/**
 * 读取文件的新内容
 */
function readNewContent(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const lastPosition = filePositions.get(filePath) || 0;

    // 如果文件被截断或重新创建
    if (stats.size < lastPosition) {
      filePositions.set(filePath, 0);
      return [];
    }

    // 如果没有新内�?
    if (stats.size === lastPosition) {
      return [];
    }

    // 读取新内�?
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(stats.size - lastPosition);
    fs.readSync(fd, buffer, 0, buffer.length, lastPosition);
    fs.closeSync(fd);

    // 更新位置
    filePositions.set(filePath, stats.size);

    // 返回新行
    const content = buffer.toString('utf8');
    return content.split('\n').filter(line => line.trim());
  } catch (error) {
    // 文件可能不存在或正在写入
    return [];
  }
}

/**
 * 监控所有日志文�?
 */
function monitorLogs() {
  LOG_FILES.forEach(filename => {
    const filePath = path.join(LOGS_DIR, filename);
    const newLines = readNewContent(filePath);

    newLines.forEach(line => {
      if (containsKeyword(line)) {
        const formatted = formatLogLine(filename, line);
        console.log(formatted);
      }
    });
  });
}

// 定时监控
const monitorInterval = setInterval(monitorLogs, 500);  // �?500ms 检查一�?

// 统计信息
let totalLines = 0;
let filteredLines = 0;

// �?10 秒输出统�?
const statsInterval = setInterval(() => {
  const stats = {
    totalFiles: LOG_FILES.length,
    monitoredFiles: filePositions.size,
    positions: {},
  };

  LOG_FILES.forEach(filename => {
    const filePath = path.join(LOGS_DIR, filename);
    const position = filePositions.get(filePath) || 0;
    if (position > 0) {
      stats.positions[filename] = `${(position / 1024).toFixed(1)}KB`;
    }
  });

  if (stats.monitoredFiles > 0) {
    console.log('\n' + '─'.repeat(60));
    console.log(`📊 统计: 监控 ${stats.monitoredFiles} 个文件`);
    Object.entries(stats.positions).forEach(([file, size]) => {
      console.log(`   ${file}: ${size}`);
    });
    console.log('─'.repeat(60) + '\n');
  }
}, 10000);

// 处理退�?
process.on('SIGINT', () => {
  console.log('\n\n收到中断信号，停止监�?..');
  clearInterval(monitorInterval);
  clearInterval(statsInterval);

  console.log('\n最终统�?');
  console.log(`  监控的文�? ${filePositions.size} 个`);
  LOG_FILES.forEach(filename => {
    const filePath = path.join(LOGS_DIR, filename);
    const position = filePositions.get(filePath);
    if (position) {
      console.log(`  ${filename}: ${(position / 1024).toFixed(1)}KB`);
    }
  });

  console.log('\n监控结束\n');
  process.exit(0);
});

// 初始�? 读取所有文件当前位�?
LOG_FILES.forEach(filename => {
  const filePath = path.join(LOGS_DIR, filename);
  try {
    const stats = fs.statSync(filePath);
    filePositions.set(filePath, stats.size);  // 从文件末尾开�?
  } catch (error) {
    // 文件不存�?忽略
  }
});

console.log(`�?已初始化 ${filePositions.size} 个日志文件的监控\n`);
