/**
 * 直接读取 Master DataStore 的评论数据
 * 检查每条评论的详细信息
 */

const io = require('socket.io-client');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('================================================================================');
console.log('🔍 读取 Master DataStore 的评论数据');
console.log('================================================================================\n');

const socket = io('http://localhost:3000/admin', {
  transports: ['websocket'],
  reconnection: false
});

socket.on('connect', () => {
  console.log('✅ 已连接到 Master /admin 命名空间\n');

  // 请求 DataStore 快照
  socket.emit('getDataStoreSnapshot', {
    accountId: accountId
  });
});

socket.on('dataStoreSnapshot', (data) => {
  console.log('📊 收到 DataStore 快照\n');

  const accountData = data.accounts?.[accountId];

  if (!accountData) {
    console.error('❌ 没有找到账户数据！');
    process.exit(1);
  }

  const { comments, contents, messages, conversations } = accountData.data;

  console.log(`评论数: ${comments?.length || 0}`);
  console.log(`作品数: ${contents?.length || 0}`);
  console.log(`私信数: ${messages?.length || 0}`);
  console.log(`会话数: ${conversations?.length || 0}\n`);

  if (!comments || comments.length === 0) {
    console.log('❌ DataStore 中没有评论数据！\n');
    process.exit(1);
  }

  console.log('================================================================================');
  console.log('📝 所有评论详细数据');
  console.log('================================================================================\n');

  // 按 contentId 分组
  const groupedByContent = {};
  comments.forEach(c => {
    if (!groupedByContent[c.contentId]) {
      groupedByContent[c.contentId] = [];
    }
    groupedByContent[c.contentId].push(c);
  });

  // 创建 contentId 到 title 的映射
  const contentMap = {};
  if (contents) {
    contents.forEach(c => {
      contentMap[c.contentId] = c.title || '(无标题)';
    });
  }

  console.log(`总评论数: ${comments.length}`);
  console.log(`涉及作品数: ${Object.keys(groupedByContent).length}\n`);

  Object.entries(groupedByContent).forEach(([contentId, commentList], idx) => {
    const title = contentMap[contentId] || '(未知标题)';
    console.log(`作品 ${idx + 1}: ${title.substring(0, 50)}...`);
    console.log(`  contentId: ${contentId}`);
    console.log(`  评论数: ${commentList.length}`);
    console.log('');

    commentList.forEach((comment, cIdx) => {
      console.log(`  评论 ${cIdx + 1}:`);
      console.log(`    commentId: ${comment.commentId || comment.platform_comment_id}`);
      console.log(`    内容: ${comment.content?.substring(0, 30)}...`);
      console.log(`    isHandled: ${comment.isHandled ?? '(未定义)'}`);
      console.log(`    isNew: ${comment.isNew ?? '(未定义)'}`);
      console.log(`    createdAt: ${new Date(comment.createdAt).toLocaleString('zh-CN')}`);
      console.log('');
    });
  });

  console.log('================================================================================');
  console.log('✅ 检查完成');
  console.log('================================================================================');

  setTimeout(() => process.exit(0), 1000);
});

socket.on('error', (err) => {
  console.error('❌ Socket 错误:', err);
  process.exit(1);
});

socket.on('connect_error', (err) => {
  console.error('❌ 连接错误:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ 超时 - /admin 命名空间可能不支持 getDataStoreSnapshot 事件');
  process.exit(1);
}, 10000);
