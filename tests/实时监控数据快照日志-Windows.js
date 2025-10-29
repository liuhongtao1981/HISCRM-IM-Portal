/**
 * 实时监控数据快照日志 - Windows 版本
 *
 * 用途：
 * - 实时显示 DataManager 的数据快照内容（Windows 兼容）
 * - 解析并格式化显示 JSON 数据
 * - 使用文件轮询方式监控（无需 tail 命令）
 *
 * 使用方法：
 * 1. 先启动 Master: npm run start:master
 * 2. 等待账户登录并开始爬虫
 * 3. 运行此脚本: node tests/实时监控数据快照日志-Windows.js
 * 4. Ctrl+C 停止监控
 */

const fs = require('fs');
const path = require('path');

// 日志目录
const LOG_DIR = path.join(__dirname, '../packages/worker/logs');

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// 已处理的快照时间戳（避免重复显示）
const processedSnapshots = new Set();

/**
 * 格式化时间戳
 */
function formatTimestamp(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 打印分隔线
 */
function printSeparator(char = '=', length = 80) {
  console.log(colors.dim + char.repeat(length) + colors.reset);
}

/**
 * 打印快照头部信息
 */
function printSnapshotHeader(snapshot) {
  console.log('\n');
  printSeparator('=', 100);
  console.log(
    colors.bright + colors.cyan +
    `📸 数据快照 - ${formatTimestamp(snapshot.timestamp)}` +
    colors.reset
  );
  console.log(
    colors.blue +
    `账户: ${snapshot.accountId} | 平台: ${snapshot.platform}` +
    colors.reset
  );
  printSeparator('=', 100);
}

/**
 * 打印统计信息
 */
function printStats(stats) {
  console.log('\n' + colors.bright + colors.yellow + '📊 数据统计:' + colors.reset);
  printSeparator('-', 100);

  // 账户信息
  if (stats.account) {
    console.log(colors.green + '账户状态:' + colors.reset);
    console.log(`  ├─ ID: ${stats.account.id}`);
    console.log(`  ├─ 平台: ${stats.account.platform}`);
    console.log(`  └─ 状态: ${stats.account.status}`);
    console.log('');
  }

  // 集合统计
  if (stats.collections) {
    console.log(colors.green + '数据集合:' + colors.reset);
    Object.entries(stats.collections).forEach(([type, data], index, arr) => {
      const isLast = index === arr.length - 1;
      const prefix = isLast ? '  └─' : '  ├─';
      console.log(
        `${prefix} ${type}: ${data.total} 条 ` +
        colors.dim +
        `(新: ${data.new}, 已读: ${data.read}, 已回复: ${data.replied})` +
        colors.reset
      );
    });
    console.log('');
  }

  // 同步状态
  if (stats.sync) {
    console.log(colors.green + '同步状态:' + colors.reset);
    console.log(`  ├─ 自动同步: ${stats.sync.autoSync ? '✅ 是' : '❌ 否'}`);
    console.log(`  ├─ 同步间隔: ${stats.sync.syncInterval}ms`);
    console.log(`  ├─ 上次同步: ${stats.sync.lastSyncTime ? formatTimestamp(new Date(stats.sync.lastSyncTime).toISOString()) : '未同步'}`);
    console.log(`  └─ 待同步: ${stats.sync.pendingSync} 条`);
  }
}

/**
 * 打印会话数据
 */
function printConversations(conversations) {
  if (!conversations || conversations.length === 0) {
    console.log('\n' + colors.dim + '(无会话数据)' + colors.reset);
    return;
  }

  console.log('\n' + colors.bright + colors.magenta + '💬 会话列表:' + colors.reset);
  printSeparator('-', 100);

  conversations.forEach((conv, index) => {
    const isLast = index === conversations.length - 1;
    const prefix = isLast ? '  └─' : '  ├─';

    console.log(
      `${prefix} ${colors.bright}${conv.userName || 'Unknown'}${colors.reset} ` +
      colors.dim + `(ID: ${conv.userId})` + colors.reset
    );
    console.log(
      `     └─ 最后消息: ${colors.cyan}${conv.lastMessageContent || '(无消息)'}${colors.reset}`
    );
    console.log(
      `        └─ 时间: ${formatTimestamp(new Date(conv.lastMessageTime).toISOString())} | ` +
      `未读: ${conv.unreadCount} | 状态: ${conv.status}`
    );
    if (!isLast) console.log('');
  });
}

/**
 * 打印消息数据
 */
function printMessages(messages) {
  if (!messages || messages.length === 0) {
    console.log('\n' + colors.dim + '(无消息数据)' + colors.reset);
    return;
  }

  console.log('\n' + colors.bright + colors.blue + '💌 最近消息:' + colors.reset);
  printSeparator('-', 100);

  messages.forEach((msg, index) => {
    const isLast = index === messages.length - 1;
    const prefix = isLast ? '  └─' : '  ├─';
    const directionIcon = msg.direction === 'incoming' ? '⬅️' : '➡️';

    console.log(
      `${prefix} ${directionIcon} ${colors.bright}${msg.senderName || 'Unknown'}${colors.reset} ` +
      colors.dim + `(${msg.type})` + colors.reset
    );
    console.log(
      `     └─ ${colors.cyan}${msg.content || '(无内容)'}${colors.reset}`
    );
    console.log(
      `        └─ 时间: ${formatTimestamp(new Date(msg.createdAt).toISOString())} | ` +
      `状态: ${msg.status}`
    );
    if (!isLast) console.log('');
  });
}

/**
 * 打印作品数据
 */
function printContents(contents) {
  if (!contents || contents.length === 0) {
    console.log('\n' + colors.dim + '(无作品数据)' + colors.reset);
    return;
  }

  console.log('\n' + colors.bright + colors.yellow + '🎬 作品列表:' + colors.reset);
  printSeparator('-', 100);

  contents.forEach((content, index) => {
    const isLast = index === contents.length - 1;
    const prefix = isLast ? '  └─' : '  ├─';

    console.log(
      `${prefix} ${colors.bright}${content.title || '(无标题)'}${colors.reset} ` +
      colors.dim + `(${content.type})` + colors.reset
    );
    if (content.description) {
      console.log(`     ├─ 描述: ${colors.cyan}${content.description}${colors.reset}`);
    }
    console.log(
      `     └─ 👁️ ${content.viewCount || 0} | ` +
      `❤️ ${content.likeCount || 0} | ` +
      `💬 ${content.commentCount || 0} | ` +
      `状态: ${content.status}`
    );
    if (!isLast) console.log('');
  });
}

/**
 * 打印评论数据
 */
function printComments(comments) {
  if (!comments || comments.length === 0) {
    console.log('\n' + colors.dim + '(无评论数据)' + colors.reset);
    return;
  }

  console.log('\n' + colors.bright + colors.green + '💬 最近评论:' + colors.reset);
  printSeparator('-', 100);

  comments.forEach((comment, index) => {
    const isLast = index === comments.length - 1;
    const prefix = isLast ? '  └─' : '  ├─';

    console.log(
      `${prefix} ${colors.bright}${comment.authorName || 'Unknown'}${colors.reset} ` +
      colors.dim + `(ID: ${comment.authorId})` + colors.reset
    );
    console.log(
      `     └─ ${colors.cyan}${comment.content || '(无内容)'}${colors.reset}`
    );
    console.log(
      `        └─ ❤️ ${comment.likeCount || 0} | ` +
      `💬 ${comment.replyCount || 0} | ` +
      `状态: ${comment.status}`
    );
    if (!isLast) console.log('');
  });
}

/**
 * 解析并显示快照
 */
function parseAndDisplaySnapshot(line) {
  try {
    // Winston JSON 格式：整行就是 JSON
    if (!line.includes('Data Snapshot')) return false;

    const logEntry = JSON.parse(line);
    if (!logEntry.snapshot) return false;

    const snapshot = logEntry.snapshot;

    // 避免重复显示同一快照
    if (processedSnapshots.has(snapshot.timestamp)) {
      return false;
    }
    processedSnapshots.add(snapshot.timestamp);

    // 打印快照信息
    printSnapshotHeader(snapshot);
    printStats(snapshot.stats);

    if (snapshot.data) {
      printConversations(snapshot.data.conversations);
      printMessages(snapshot.data.messages);
      printContents(snapshot.data.contents);
      printComments(snapshot.data.comments);
    }

    printSeparator('=', 100);
    console.log(colors.dim + '等待下一次快照...' + colors.reset + '\n');

    return true;

  } catch (error) {
    console.error(colors.yellow + '⚠️  解析快照失败:' + colors.reset, error.message);
    return false;
  }
}

/**
 * 读取日志文件并查找快照
 */
function readLogFile(filePath, lastPosition = 0) {
  try {
    const stats = fs.statSync(filePath);
    const currentSize = stats.size;

    // 如果文件没有新内容，返回当前位置
    if (currentSize <= lastPosition) {
      return lastPosition;
    }

    // 读取新增内容
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.allocUnsafe(currentSize - lastPosition);
    fs.readSync(fd, buffer, 0, buffer.length, lastPosition);
    fs.closeSync(fd);

    const newContent = buffer.toString('utf8');
    const lines = newContent.split('\n');

    // 处理每一行
    let foundSnapshot = false;
    lines.forEach(line => {
      if (line.includes('Data Snapshot:')) {
        if (parseAndDisplaySnapshot(line)) {
          foundSnapshot = true;
        }
      }
    });

    return currentSize;

  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(colors.yellow + '⚠️  读取文件错误:' + colors.reset, error.message);
    }
    return lastPosition;
  }
}

/**
 * 主函数
 */
async function main() {
  console.clear();
  console.log(colors.bright + colors.cyan);
  console.log('╔════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     📸 DataManager 数据快照实时监控 (Windows)                                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  console.log(colors.yellow + '📂 监控目录:' + colors.reset, LOG_DIR);
  console.log(colors.yellow + '🔍 搜索模式:' + colors.reset, 'douyin-data_acc-*.log');
  console.log(colors.yellow + '⏱️  快照间隔:' + colors.reset, '30 秒');
  console.log(colors.yellow + '🔄 检查间隔:' + colors.reset, '2 秒');
  console.log(colors.dim + '\n按 Ctrl+C 停止监控\n' + colors.reset);

  printSeparator('=', 100);

  // 检查日志目录是否存在
  if (!fs.existsSync(LOG_DIR)) {
    console.log(colors.yellow + '\n⚠️  日志目录不存在，正在创建...' + colors.reset);
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  // 查找所有抖音数据日志文件
  let logFiles = [];
  const updateLogFiles = () => {
    logFiles = fs.readdirSync(LOG_DIR)
      .filter(file => file.startsWith('douyin-data_acc-') && file.endsWith('.log'))
      .map(file => ({
        path: path.join(LOG_DIR, file),
        name: file,
        position: 0
      }));
  };

  updateLogFiles();

  if (logFiles.length === 0) {
    console.log(
      colors.yellow +
      '\n⚠️  未找到日志文件。请确保：\n' +
      '  1. Master 服务器正在运行\n' +
      '  2. 账户已登录\n' +
      '  3. 爬虫已启动（DataManager 已创建）\n' +
      '\n等待日志文件出现...\n' +
      colors.reset
    );
  } else {
    console.log(colors.green + `\n✅ 找到 ${logFiles.length} 个日志文件:` + colors.reset);
    logFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.name}`);
    });
    printSeparator('=', 100);
    console.log(colors.cyan + '\n🎯 开始监控...\n' + colors.reset);
  }

  // 定期检查文件变化
  const checkInterval = 2000; // 2秒检查一次
  let isRunning = true;

  const intervalId = setInterval(() => {
    if (!isRunning) {
      clearInterval(intervalId);
      return;
    }

    // 更新文件列表（检测新文件）
    const previousCount = logFiles.length;
    updateLogFiles();

    if (logFiles.length > previousCount) {
      console.log(
        colors.green +
        `\n✅ 发现新日志文件！总数: ${logFiles.length}\n` +
        colors.reset
      );
    }

    // 读取每个文件的新内容
    logFiles.forEach(file => {
      file.position = readLogFile(file.path, file.position);
    });

  }, checkInterval);

  // 处理退出信号
  process.on('SIGINT', () => {
    console.log(colors.cyan + '\n\n👋 停止监控...' + colors.reset);
    isRunning = false;
    clearInterval(intervalId);
    process.exit(0);
  });

  // 防止进程退出
  process.stdin.resume();
}

// 运行
main().catch(error => {
  console.error(colors.yellow + '❌ 错误:' + colors.reset, error);
  process.exit(1);
});
