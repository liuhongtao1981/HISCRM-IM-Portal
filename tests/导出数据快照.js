/**
 * �?DataManager 日志中提取完整的数据快照并保存为 JSON
 */

const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, '../packages/worker/logs/douyin-data_acc-98296c87-2e42-447a-9d8b-8be008ddb6e4.log');
const outputDir = path.join(__dirname, '../packages/worker/data/snapshots');

// 确保输出目录存在
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('📖 读取日志文件...');
const logContent = fs.readFileSync(logPath, 'utf8');
const lines = logContent.split('\n').filter(line => line.trim());

console.log(`总共 ${lines.length} 行日志\n`);

// 查找所有数据快�?
const snapshots = [];
lines.forEach((line, index) => {
  try {
    const log = JSON.parse(line);
    if (log.message === '📸 Data Snapshot' && log.snapshot) {
      snapshots.push({
        line: index + 1,
        timestamp: log.timestamp,
        snapshot: log.snapshot
      });
    }
  } catch (err) {
    // 忽略�?JSON �?
  }
});

console.log(`找到 ${snapshots.length} 个数据快照\n`);

if (snapshots.length === 0) {
  console.log('�?未找到数据快�?);
  process.exit(1);
}

// 获取最新的快照
const latest = snapshots[snapshots.length - 1];
console.log(`📸 最新快�?`);
console.log(`   时间: ${latest.timestamp}`);
console.log(`   行号: ${latest.line}`);
console.log(`   账户: ${latest.snapshot.accountId}`);
console.log(`   平台: ${latest.snapshot.platform}\n`);

// 统计数据
const data = latest.snapshot.data;
const stats = latest.snapshot.stats;

console.log(`📊 数据统计:`);
console.log(`   评论 (comments): ${data.comments?.length || 0} 条`);
console.log(`   作品 (contents): ${data.contents?.length || 0} 个`);
console.log(`   会话 (conversations): ${data.conversations?.length || 0} 个`);
console.log(`   私信 (messages): ${data.messages?.length || 0} 条`);
console.log(`   通知 (notifications): ${data.notifications?.length || 0} 条\n`);

// 保存完整快照
const timestamp = new Date(latest.snapshot.timestamp).getTime();
const snapshotFile = path.join(outputDir, `snapshot-${timestamp}.json`);
fs.writeFileSync(snapshotFile, JSON.stringify(latest.snapshot, null, 2), 'utf8');
console.log(`�?完整快照已保�? ${snapshotFile}\n`);

// 保存各个数据集合
const collections = ['comments', 'contents', 'conversations', 'messages', 'notifications'];
collections.forEach(collection => {
  if (data[collection] && data[collection].length > 0) {
    const collectionFile = path.join(outputDir, `${collection}-${timestamp}.json`);
    fs.writeFileSync(collectionFile, JSON.stringify(data[collection], null, 2), 'utf8');
    console.log(`   �?${collection}: ${data[collection].length} �?-> ${path.basename(collectionFile)}`);
  }
});

console.log('\n📋 数据关系验证准备:');
console.log('=' .repeat(80));

// 验证 1: 会话与私信的关系
console.log('\n1️⃣ 会话 (conversations) �?私信 (messages)');
console.log('-'.repeat(80));

const conversationIds = new Set(data.conversations?.map(c => c.conversationId) || []);
const messageConvIds = new Set(data.messages?.map(m => m.conversationId) || []);

console.log(`   会话�? ${conversationIds.size}`);
console.log(`   私信中提到的会话�? ${messageConvIds.size}`);

// 找出有私信的会话
const convsWithMessages = Array.from(conversationIds).filter(id => messageConvIds.has(id));
console.log(`   有私信的会话: ${convsWithMessages.length} 个`);

// 找出没有私信的会�?
const convsWithoutMessages = Array.from(conversationIds).filter(id => !messageConvIds.has(id));
console.log(`   没有私信的会�? ${convsWithoutMessages.length} 个`);

// 找出孤儿私信（没有对应会话）
const orphanMessages = data.messages?.filter(m => !conversationIds.has(m.conversationId)) || [];
console.log(`   孤儿私信（无会话�? ${orphanMessages.length} 条`);

// 验证 2: 作品与评论的关系
console.log('\n2️⃣ 作品 (contents) �?评论 (comments)');
console.log('-'.repeat(80));

const contentIds = new Set(data.contents?.map(c => c.contentId) || []);
const commentContentIds = new Set(data.comments?.map(c => c.contentId) || []);

console.log(`   作品�? ${contentIds.size}`);
console.log(`   评论中提到的作品�? ${commentContentIds.size}`);

// 找出有评论的作品
const contentsWithComments = Array.from(contentIds).filter(id => commentContentIds.has(id));
console.log(`   有评论的作品: ${contentsWithComments.length} 个`);

// 找出没有评论的作�?
const contentsWithoutComments = Array.from(contentIds).filter(id => !commentContentIds.has(id));
console.log(`   没有评论的作�? ${contentsWithoutComments.length} 个`);

// 找出孤儿评论（没有对应作品）
const orphanComments = data.comments?.filter(c => !contentIds.has(c.contentId)) || [];
console.log(`   孤儿评论（无作品�? ${orphanComments.length} 条`);

// 详细展示有评论的作品
if (contentsWithComments.length > 0) {
  console.log('\n   📝 有评论的作品详情:');
  contentsWithComments.forEach((contentId, index) => {
    const content = data.contents.find(c => c.contentId === contentId);
    const comments = data.comments.filter(c => c.contentId === contentId);
    console.log(`   ${index + 1}. ${content.title.substring(0, 50)}...`);
    console.log(`      作品 ID: ${contentId.substring(0, 40)}...`);
    console.log(`      评论�? ${comments.length} 条`);
  });
}

// 验证 3: 评论与讨论（回复）的关系
console.log('\n3️⃣ 评论 (comments) �?讨论/回复 (discussions)');
console.log('-'.repeat(80));

// 检查是否有 replyCount > 0 的评�?
const commentsWithReplies = data.comments?.filter(c => c.replyCount > 0) || [];
console.log(`   有回复的评论: ${commentsWithReplies.length} 条`);

if (commentsWithReplies.length > 0) {
  console.log('\n   📝 有回复的评论详情:');
  commentsWithReplies.forEach((comment, index) => {
    console.log(`   ${index + 1}. ${comment.content.substring(0, 40)}...`);
    console.log(`      评论 ID: ${comment.commentId}`);
    console.log(`      回复�? ${comment.replyCount}`);
    console.log(`      作�? ${comment.authorName}`);
  });
}

// 保存验证报告
const reportFile = path.join(outputDir, `validation-report-${timestamp}.txt`);
const report = `
数据关系验证报告
================================================================================
生成时间: ${new Date(latest.snapshot.timestamp).toLocaleString('zh-CN')}
账户 ID: ${latest.snapshot.accountId}
平台: ${latest.snapshot.platform}

数据统计
--------------------------------------------------------------------------------
评论 (comments):       ${data.comments?.length || 0} �?
作品 (contents):        ${data.contents?.length || 0} �?
会话 (conversations):   ${data.conversations?.length || 0} �?
私信 (messages):        ${data.messages?.length || 0} �?
通知 (notifications):   ${data.notifications?.length || 0} �?

关系验证
--------------------------------------------------------------------------------

1. 会话 �?私信
   �?会话总数: ${conversationIds.size}
   �?有私信的会话: ${convsWithMessages.length} �?
   �?没有私信的会�? ${convsWithoutMessages.length} �?
   ${orphanMessages.length > 0 ? `�?孤儿私信: ${orphanMessages.length} 条` : '�?无孤儿私�?}

2. 作品 �?评论
   �?作品总数: ${contentIds.size}
   �?有评论的作品: ${contentsWithComments.length} �?
   �?没有评论的作�? ${contentsWithoutComments.length} �?
   ${orphanComments.length > 0 ? `�?孤儿评论: ${orphanComments.length} 条` : '�?无孤儿评�?}

3. 评论 �?回复/讨论
   �?有回复的评论: ${commentsWithReplies.length} �?

数据完整�?
--------------------------------------------------------------------------------
${orphanMessages.length === 0 && orphanComments.length === 0 ? '�?所有数据关系完整，无孤儿记�? : '⚠️  存在孤儿记录，需要检�?}

================================================================================
`;

fs.writeFileSync(reportFile, report, 'utf8');
console.log(`\n�?验证报告已保�? ${reportFile}`);

console.log('\n�?完成！所有数据已导出�?', outputDir);
