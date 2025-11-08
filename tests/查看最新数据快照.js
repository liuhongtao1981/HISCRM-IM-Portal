/**
 * 查看最新数据快�?
 *
 * 用途：
 * - 快速查看指定账户的最新数据快�?
 * - 格式化显示快照内�?
 * - 无需启动完整的监控脚�?
 *
 * 使用方法�?
 * node tests/查看最新数据快�?js [账户ID]
 *
 * 示例�?
 * node tests/查看最新数据快�?js acc-98296c87-2e42-447a-9d8b-8be008ddb6e4
 */

const fs = require('fs');
const path = require('path');

// 日志目录
const LOG_DIR = path.join(__dirname, '../packages/worker/logs');

// ANSI 颜色
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

/**
 * 格式化时间戳
 */
function formatTimestamp(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN');
}

/**
 * 打印快照摘要
 */
function printSnapshot(snapshot) {
  console.log(colors.bright + colors.cyan);
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('�?                    📸 数据快照                                 �?);
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  console.log(colors.yellow + '�?时间:' + colors.reset, formatTimestamp(snapshot.timestamp));
  console.log(colors.yellow + '📱 账户:' + colors.reset, snapshot.accountId);
  console.log(colors.yellow + '🎯 平台:' + colors.reset, snapshot.platform);
  console.log('');

  // 统计信息
  if (snapshot.stats && snapshot.stats.collections) {
    console.log(colors.bright + colors.green + '📊 数据统计:' + colors.reset);
    Object.entries(snapshot.stats.collections).forEach(([type, stats]) => {
      console.log(`  ${type}:`,
        `总计 ${stats.total} 条`,
        colors.blue + `(�?${stats.new}, 已读 ${stats.read}, 已回�?${stats.replied})` + colors.reset
      );
    });
    console.log('');
  }

  // 会话列表
  if (snapshot.data && snapshot.data.conversations && snapshot.data.conversations.length > 0) {
    console.log(colors.bright + colors.magenta + '💬 会话列表:' + colors.reset);
    snapshot.data.conversations.forEach((conv, index) => {
      console.log(`  ${index + 1}. ${conv.userName || 'Unknown'} (${conv.userId})`);
      console.log(`     最后消�? ${conv.lastMessageContent || '(�?'}`);
      console.log(`     未读: ${conv.unreadCount} | 状�? ${conv.status}`);
      console.log('');
    });
  }

  // 消息列表
  if (snapshot.data && snapshot.data.messages && snapshot.data.messages.length > 0) {
    console.log(colors.bright + colors.blue + '💌 最近消�?' + colors.reset);
    snapshot.data.messages.forEach((msg, index) => {
      const direction = msg.direction === 'incoming' ? '⬅️' : '➡️';
      console.log(`  ${index + 1}. ${direction} ${msg.senderName || 'Unknown'}`);
      console.log(`     ${msg.content || '(无内�?'}`);
      console.log(`     类型: ${msg.type} | 状�? ${msg.status}`);
      console.log('');
    });
  }

  // 作品列表
  if (snapshot.data && snapshot.data.contents && snapshot.data.contents.length > 0) {
    console.log(colors.bright + colors.yellow + '🎬 作品列表:' + colors.reset);
    snapshot.data.contents.forEach((content, index) => {
      console.log(`  ${index + 1}. ${content.title || '(无标�?'} (${content.type})`);
      if (content.description) {
        console.log(`     ${content.description}`);
      }
      console.log(`     👁�?${content.viewCount || 0} | ❤️ ${content.likeCount || 0} | 💬 ${content.commentCount || 0}`);
      console.log('');
    });
  }

  // 评论列表
  if (snapshot.data && snapshot.data.comments && snapshot.data.comments.length > 0) {
    console.log(colors.bright + colors.green + '💬 最近评�?' + colors.reset);
    snapshot.data.comments.forEach((comment, index) => {
      console.log(`  ${index + 1}. ${comment.authorName || 'Unknown'}`);
      console.log(`     ${comment.content || '(无内�?'}`);
      console.log(`     ❤️ ${comment.likeCount || 0} | 💬 ${comment.replyCount || 0}`);
      console.log('');
    });
  }

  console.log(colors.cyan + '════════════════════════════════════════════════════════════════' + colors.reset);
}

/**
 * 主函�?
 */
function main() {
  const accountId = process.argv[2];

  console.clear();
  console.log(colors.bright + colors.cyan + '\n📸 数据快照查看器\n' + colors.reset);

  // 查找日志文件
  let logFile;
  if (accountId) {
    // 指定账户
    logFile = path.join(LOG_DIR, `douyin-data_acc-${accountId}.log`);
    if (!fs.existsSync(logFile)) {
      console.log(colors.yellow + `�?未找到账�?${accountId} 的日志文件` + colors.reset);
      console.log(colors.yellow + `\n查找路径: ${logFile}\n` + colors.reset);
      process.exit(1);
    }
  } else {
    // 查找最新的日志文件
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith('douyin-data_acc-') && f.endsWith('.log') && !f.includes('error'))
      .map(f => ({
        path: path.join(LOG_DIR, f),
        mtime: fs.statSync(path.join(LOG_DIR, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
      console.log(colors.yellow + '�?未找到数据日志文�? + colors.reset);
      console.log(colors.yellow + '\n请确保：' + colors.reset);
      console.log('  1. Master 服务器正在运�?);
      console.log('  2. 账户已登�?);
      console.log('  3. 爬虫已启动（DataManager 已创建）\n');
      process.exit(1);
    }

    logFile = files[0].path;
    console.log(colors.green + '📁 使用最新日志文�?' + colors.reset, path.basename(logFile));
    console.log('');
  }

  // 读取日志文件
  const content = fs.readFileSync(logFile, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  // 查找快照
  const snapshots = lines.filter(l => l.includes('Data Snapshot'));

  if (snapshots.length === 0) {
    console.log(colors.yellow + '⚠️  日志文件中没有快照数�? + colors.reset);
    console.log(colors.yellow + '\n可能的原因：' + colors.reset);
    console.log('  1. DataManager 刚刚创建，还未生成快照（默认 30 秒间隔）');
    console.log('  2. 账户未登录，爬虫未运�?);
    console.log('  3. 日志文件是旧版本创建的（不支持快照功能）\n');
    process.exit(1);
  }

  console.log(colors.green + `�?找到 ${snapshots.length} 个快照\n` + colors.reset);

  // 显示最新快�?
  const latestSnapshotLine = snapshots[snapshots.length - 1];

  try {
    const logEntry = JSON.parse(latestSnapshotLine);

    if (!logEntry.snapshot) {
      console.log(colors.yellow + '�?快照数据格式错误' + colors.reset);
      process.exit(1);
    }

    printSnapshot(logEntry.snapshot);

    // 提示
    console.log(colors.cyan + '\n💡 提示:' + colors.reset);
    console.log(`  - 共有 ${snapshots.length} 个快照可查看`);
    console.log(`  - 使用实时监控脚本查看持续更新：`);
    console.log(`    node tests/实时监控数据快照日志-Windows.js`);
    console.log('');

  } catch (error) {
    console.log(colors.yellow + '�?解析快照数据失败:' + colors.reset, error.message);
    console.log(colors.yellow + '\n原始数据:' + colors.reset);
    console.log(latestSnapshotLine.substring(0, 200) + '...');
    console.log('');
    process.exit(1);
  }
}

// 运行
try {
  main();
} catch (error) {
  console.error(colors.yellow + '\n�?错误:' + colors.reset, error.message);
  process.exit(1);
}
