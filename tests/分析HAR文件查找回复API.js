/**
 * 分析 HAR 文件查找评论和回�?API
 */

const fs = require('fs');
const path = require('path');

const harPath = path.join(__dirname, 'creator.douyin.com.har');
const harData = JSON.parse(fs.readFileSync(harPath, 'utf8'));

console.log('🔍 分析 HAR 文件...\n');

const commentAPIs = [];
const replyAPIs = [];
const otherAPIs = [];

harData.log.entries.forEach(entry => {
  const url = entry.request.url;
  const method = entry.request.method;

  // 分类 API
  if (url.includes('comment')) {
    if (url.includes('reply')) {
      replyAPIs.push({
        method,
        url,
        status: entry.response.status,
        size: entry.response.content.size
      });
    } else {
      commentAPIs.push({
        method,
        url,
        status: entry.response.status,
        size: entry.response.content.size
      });
    }
  } else if (url.includes('interactive') || url.includes('aweme')) {
    otherAPIs.push({
      method,
      url,
      status: entry.response.status
    });
  }
});

console.log('📝 评论列表 API�?);
console.log('='.repeat(100));
commentAPIs.forEach((api, i) => {
  console.log(`\n${i + 1}. [${api.method}] ${api.status}`);
  console.log(`   ${api.url}`);
  console.log(`   大小: ${api.size} 字节`);
});

console.log('\n\n💬 回复/讨论 API�?);
console.log('='.repeat(100));
if (replyAPIs.length === 0) {
  console.log('�?未找到回�?API（可�?HAR 文件录制时没有点�?查看回复"�?);
} else {
  replyAPIs.forEach((api, i) => {
    console.log(`\n${i + 1}. [${api.method}] ${api.status}`);
    console.log(`   ${api.url}`);
    console.log(`   大小: ${api.size} 字节`);
  });
}

console.log('\n\n📊 其他相关 API�?);
console.log('='.repeat(100));
otherAPIs.slice(0, 10).forEach((api, i) => {
  console.log(`${i + 1}. [${api.method}] ${api.url}`);
});

console.log(`\n\n总计: ${commentAPIs.length} 个评�?API, ${replyAPIs.length} 个回�?API, ${otherAPIs.length} 个其�?API`);
