/**
 * 统计快照数据
 *
 * 用途：
 * - 快速统计最新快照中的所有数据类型数�?
 * - 生成清晰的统计报�?
 *
 * 使用方法�?
 * node tests/统计快照数据.js
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
 * 主函�?
 */
function main() {
  console.log(colors.bright + colors.cyan);
  console.log('╔═══════════════════════════════════════════════════════════════�?);
  console.log('�?                  📊 数据快照统计报告                          �?);
  console.log('╚═══════════════════════════════════════════════════════════════�?);
  console.log(colors.reset + '\n');

  // 查找最新的日志文件
  const files = fs.readdirSync(LOG_DIR)
    .filter(f => f.startsWith('douyin-data_acc-') && f.endsWith('.log') && !f.includes('error'))
    .map(f => ({
      path: path.join(LOG_DIR, f),
      name: f,
      mtime: fs.statSync(path.join(LOG_DIR, f)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    console.log(colors.yellow + '�?未找到数据日志文件\n' + colors.reset);
    process.exit(1);
  }

  const logFile = files[0].path;
  console.log(colors.green + '📁 日志文件:' + colors.reset, path.basename(logFile));
  console.log(colors.green + '📅 更新时间:' + colors.reset, formatTimestamp(files[0].mtime.toISOString()));
  console.log('');

  // 读取日志文件
  const content = fs.readFileSync(logFile, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  // 查找所有快�?
  const snapshots = lines
    .filter(l => l.includes('Data Snapshot'))
    .map(line => {
      try {
        const logEntry = JSON.parse(line);
        return logEntry.snapshot;
      } catch (e) {
        return null;
      }
    })
    .filter(s => s !== null);

  if (snapshots.length === 0) {
    console.log(colors.yellow + '⚠️  日志文件中没有快照数据\n' + colors.reset);
    process.exit(1);
  }

  console.log(colors.green + `�?找到 ${snapshots.length} 个快照\n` + colors.reset);

  // 使用最新快�?
  const snapshot = snapshots[snapshots.length - 1];

  console.log(colors.bright + colors.yellow + '�?快照时间:' + colors.reset, formatTimestamp(snapshot.timestamp));
  console.log(colors.bright + colors.yellow + '📱 账户ID:' + colors.reset, snapshot.accountId);
  console.log(colors.bright + colors.yellow + '🎯 平台:' + colors.reset, snapshot.platform);
  console.log('');

  // 打印统计信息
  console.log(colors.bright + colors.cyan + '══════════════════════════════════════════════════════════════�? + colors.reset);
  console.log(colors.bright + colors.cyan + '                        📊 数据统计                             ' + colors.reset);
  console.log(colors.bright + colors.cyan + '══════════════════════════════════════════════════════════════�? + colors.reset);
  console.log('');

  if (snapshot.stats && snapshot.stats.collections) {
    const collections = snapshot.stats.collections;

    // 数据类型映射
    const dataTypes = {
      'conversations': { name: '会话 (Conversations)', icon: '💬', color: colors.magenta },
      'messages': { name: '消息 (Messages)', icon: '💌', color: colors.blue },
      'contents': { name: '视频/作品 (Contents)', icon: '🎬', color: colors.yellow },
      'comments': { name: '评论 (Comments)', icon: '💬', color: colors.green },
      'notifications': { name: '通知 (Notifications)', icon: '🔔', color: colors.cyan },
    };

    // 打印每种数据类型的统�?
    Object.entries(collections).forEach(([type, stats]) => {
      const typeInfo = dataTypes[type] || { name: type, icon: '📦', color: colors.reset };

      console.log(typeInfo.color + colors.bright + typeInfo.icon + ' ' + typeInfo.name + colors.reset);
      console.log('  ├─ 总数: ' + colors.bright + stats.total + colors.reset + ' �?);
      console.log('  ├─ 新增: ' + colors.green + stats.new + colors.reset + ' �?);
      console.log('  ├─ 已更�? ' + colors.yellow + stats.updated + colors.reset + ' �?);
      console.log('  ├─ 已同�? ' + colors.cyan + stats.synced + colors.reset + ' �?);
      console.log('  ├─ 已删�? ' + colors.magenta + stats.deleted + colors.reset + ' �?);
      console.log('  └─ 错误: ' + (stats.error > 0 ? colors.yellow : colors.green) + stats.error + colors.reset + ' �?);
      console.log('');
    });
  }

  // 打印同步状�?
  if (snapshot.stats && snapshot.stats.sync) {
    const sync = snapshot.stats.sync;

    console.log(colors.bright + colors.cyan + '══════════════════════════════════════════════════════════════�? + colors.reset);
    console.log(colors.bright + colors.cyan + '                        🔄 同步状�?                            ' + colors.reset);
    console.log(colors.bright + colors.cyan + '══════════════════════════════════════════════════════════════�? + colors.reset);
    console.log('');

    console.log('  ├─ 自动同步: ' + (sync.autoSync ? colors.green + '�?开�? : colors.yellow + '�?关闭') + colors.reset);
    console.log('  ├─ 同步间隔: ' + colors.cyan + sync.syncInterval + 'ms' + colors.reset);
    console.log('  ├─ 上次同步: ' + colors.yellow + (sync.lastSyncTime ? formatTimestamp(new Date(sync.lastSyncTime).toISOString()) : '未同�?) + colors.reset);
    console.log('  ├─ 已推�? ' + colors.green + sync.totalPushed + colors.reset + ' �?);
    console.log('  └─ 待同�? ' + (sync.pendingSync > 0 ? colors.yellow : colors.green) + sync.pendingSync + colors.reset + ' �?);
    console.log('');
  }

  // 打印数据示例
  console.log(colors.bright + colors.cyan + '══════════════════════════════════════════════════════════════�? + colors.reset);
  console.log(colors.bright + colors.cyan + '                        📋 数据详情                             ' + colors.reset);
  console.log(colors.bright + colors.cyan + '══════════════════════════════════════════════════════════════�? + colors.reset);
  console.log('');

  if (snapshot.data) {
    // 会话详情
    if (snapshot.data.conversations && snapshot.data.conversations.length > 0) {
      console.log(colors.magenta + colors.bright + '💬 会话列表 (�?�?:' + colors.reset);
      snapshot.data.conversations.slice(0, 5).forEach((conv, index) => {
        console.log(`  ${index + 1}. ${conv.userName || 'Unknown'}`);
        console.log(`     └─ 未读: ${conv.unreadCount} | 状�? ${conv.status}`);
      });
      console.log('');
    }

    // 消息详情
    if (snapshot.data.messages && snapshot.data.messages.length > 0) {
      console.log(colors.blue + colors.bright + '💌 最近消�?' + colors.reset);
      snapshot.data.messages.forEach((msg, index) => {
        const direction = msg.direction === 'incoming' ? '⬅️' : '➡️';
        console.log(`  ${index + 1}. ${direction} ${msg.senderName || 'Unknown'}: ${msg.content || '(无内�?'}`);
      });
      console.log('');
    }

    // 作品详情
    if (snapshot.data.contents && snapshot.data.contents.length > 0) {
      console.log(colors.yellow + colors.bright + '🎬 作品列表:' + colors.reset);
      snapshot.data.contents.forEach((content, index) => {
        console.log(`  ${index + 1}. ${content.title || '(无标�?'} (${content.type})`);
        console.log(`     └─ 👁�?${content.viewCount || 0} | ❤️ ${content.likeCount || 0} | 💬 ${content.commentCount || 0}`);
      });
      console.log('');
    }

    // 评论详情
    if (snapshot.data.comments && snapshot.data.comments.length > 0) {
      console.log(colors.green + colors.bright + '💬 评论列表:' + colors.reset);
      snapshot.data.comments.forEach((comment, index) => {
        console.log(`  ${index + 1}. ${comment.authorName || 'Unknown'}: ${comment.content || '(无内�?'}`);
        console.log(`     └─ ❤️ ${comment.likeCount || 0} | 💬 ${comment.replyCount || 0}`);
      });
      console.log('');
    }
  }

  // 快照历史
  console.log(colors.bright + colors.cyan + '══════════════════════════════════════════════════════════════�? + colors.reset);
  console.log(colors.bright + colors.cyan + '                        📈 快照历史                             ' + colors.reset);
  console.log(colors.bright + colors.cyan + '══════════════════════════════════════════════════════════════�? + colors.reset);
  console.log('');

  console.log(colors.green + `  总快照数: ${snapshots.length}` + colors.reset);
  console.log(colors.green + `  最早快�? ${formatTimestamp(snapshots[0].timestamp)}` + colors.reset);
  console.log(colors.green + `  最新快�? ${formatTimestamp(snapshots[snapshots.length - 1].timestamp)}` + colors.reset);
  console.log('');

  console.log(colors.bright + colors.cyan + '══════════════════════════════════════════════════════════════�? + colors.reset);
  console.log('');
}

// 运行
try {
  main();
} catch (error) {
  console.error(colors.yellow + '\n�?错误:' + colors.reset, error.message);
  process.exit(1);
}
