/**
 * 直接读取 Master DataStore 检查评论的 isHandled 状态
 */

const io = require('socket.io-client');

console.log('================================================================================');
console.log('🔍 直接读取 Master DataStore 检查评论的 isHandled 状态');
console.log('================================================================================\n');

// 连接到 Master 的 /admin 命名空间
const socket = io('http://localhost:3000/admin', {
  transports: ['websocket'],
  reconnection: false
});

socket.on('connect', () => {
  console.log('✅ 已连接到 Master /admin 命名空间\n');

  // 请求 DataStore 快照
  socket.emit('requestDataStoreSnapshot', {
    accountId: 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  });
});

socket.on('dataStoreSnapshot', (data) => {
  console.log('📊 收到 DataStore 快照\n');

  const { comments, contents } = data;

  console.log(`评论数: ${comments.length}`);
  console.log(`作品数: ${contents.length}\n`);

  // 统计 isHandled 状态
  const handled = comments.filter(c => c.isHandled === true);
  const unhandled = comments.filter(c => c.isHandled === false || c.isHandled === undefined);

  console.log('================================================================================');
  console.log('📋 isHandled 状态统计');
  console.log('================================================================================');
  console.log(`总评论数: ${comments.length}`);
  console.log(`已处理 (isHandled === true): ${handled.length}`);
  console.log(`未处理 (isHandled === false 或 undefined): ${unhandled.length}\n`);

  // 按 contentId 分组
  const groupedByContent = {};
  comments.forEach(c => {
    if (!groupedByContent[c.contentId]) {
      groupedByContent[c.contentId] = {
        comments: [],
        handled: 0,
        unhandled: 0
      };
    }
    groupedByContent[c.contentId].comments.push(c);
    if (c.isHandled === true) {
      groupedByContent[c.contentId].handled++;
    } else {
      groupedByContent[c.contentId].unhandled++;
    }
  });

  // 创建 contentId 到 title 的映射
  const contentMap = {};
  contents.forEach(c => {
    contentMap[c.contentId] = c.title || '(无标题)';
  });

  console.log('================================================================================');
  console.log('📊 按作品分组的 isHandled 统计');
  console.log('================================================================================\n');

  const contentIds = Object.keys(groupedByContent).sort();

  contentIds.forEach((contentId, idx) => {
    const stats = groupedByContent[contentId];
    const title = contentMap[contentId] || '(未知标题)';

    console.log(`作品 ${idx + 1}: ${title}`);
    console.log(`  contentId: ${contentId}`);
    console.log(`  总评论: ${stats.comments.length}`);
    console.log(`  已处理: ${stats.handled}`);
    console.log(`  未处理: ${stats.unhandled}`);
    console.log(`  ${stats.unhandled > 0 ? '✅' : '❌'} 会在 PC IM 中显示（需要 unhandled > 0）`);
    console.log('');
  });

  console.log('================================================================================');
  console.log('📝 详细评论数据');
  console.log('================================================================================\n');

  comments.forEach((comment, idx) => {
    const title = contentMap[comment.contentId] || '(未知标题)';
    console.log(`评论 ${idx + 1}:`);
    console.log(`  作品: ${title.substring(0, 30)}...`);
    console.log(`  contentId: ${comment.contentId}`);
    console.log(`  内容: ${comment.content?.substring(0, 30) || '(无内容)'}...`);
    console.log(`  isHandled: ${comment.isHandled ?? '(未定义)'}`);
    console.log(`  isNew: ${comment.isNew ?? '(未定义)'}`);
    console.log(`  createdAt: ${new Date(comment.createdAt).toLocaleString('zh-CN')}`);
    console.log('');
  });

  console.log('================================================================================');
  console.log('✅ 检查完成');
  console.log('================================================================================');

  setTimeout(() => process.exit(0), 1000);
});

socket.on('error', (err) => {
  console.error('❌ 错误:', err);
  process.exit(1);
});

socket.on('connect_error', (err) => {
  console.error('❌ 连接错误:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ 超时 - 可能 /admin 命名空间不支持 requestDataStoreSnapshot');
  console.log('\n尝试使用备用方案...');
  process.exit(1);
}, 10000);
