const http = require('http');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 直接访问 Master 的内�?API（如果有）或者通过 HTTP 请求
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/debug/datastore',
  method: 'GET'
};

console.log('================================================================================');
console.log('检�?Master DataStore 中的评论数据');
console.log('================================================================================');
console.log('目标账户:', accountId);
console.log();

// 由于没有直接�?HTTP API，我们需要通过其他方式访问
// 让我们创建一个简单的检查脚�?
const accountsDataStore = require('../packages/master/src/data-store/accounts-data-store');

console.log('📊 DataStore 统计:');
console.log('账户�?', accountsDataStore.getAllAccounts().length);

const accountData = accountsDataStore.getAccountData(accountId);
if (!accountData) {
  console.error('�?未找到账户数�?);
  process.exit(1);
}

console.log('\n�?找到账户数据');
console.log('账户ID:', accountData.id);
console.log('平台:', accountData.platform);

// 检查评论数�?const comments = accountData.comments || [];
const videos = accountData.videos || [];

console.log('\n📹 作品信息:');
console.log('总作品数:', videos.length);

const videosWithComments = videos.filter(v => {
  const videoComments = comments.filter(c => c.contentId === v.videoId || c.contentId === v.id);
  return videoComments.length > 0;
});

console.log('有评论的作品�?', videosWithComments.length);

console.log('\n💬 评论信息:');
console.log('总评论数:', comments.length);

// 按作品分�?const commentsByVideo = {};
comments.forEach(comment => {
  const contentId = comment.contentId;
  if (!commentsByVideo[contentId]) {
    commentsByVideo[contentId] = [];
  }
  commentsByVideo[contentId].push(comment);
});

console.log('有评论的作品contentId�?', Object.keys(commentsByVideo).length);

console.log('\n详细信息:');
Object.entries(commentsByVideo).forEach(([contentId, videoComments], idx) => {
  const video = videos.find(v => v.videoId === contentId || v.id === contentId);
  console.log(`\n作品 ${idx + 1}:`);
  console.log('  contentId:', contentId);
  console.log('  作品标题:', video?.title || video?.description?.substring(0, 30) || '未知');
  console.log('  评论�?', videoComments.length);
  console.log('  评论内容示例:', videoComments[0]?.content?.substring(0, 50));
});
