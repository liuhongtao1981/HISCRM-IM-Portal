/**
 * 分析评论和作品的匹配情况
 * 目标：理解为什么有孤儿评论
 */

const fs = require('fs');
const path = require('path');

// 读取最新快照
const snapshotsDir = path.join(__dirname, '../packages/worker/data/snapshots');
const files = fs.readdirSync(snapshotsDir)
  .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
  .sort()
  .reverse();

if (files.length === 0) {
  console.log('没有找到快照文件');
  process.exit(1);
}

const latestSnapshot = JSON.parse(
  fs.readFileSync(path.join(snapshotsDir, files[0]), 'utf8')
);

console.log('📊 评论-作品匹配分析');
console.log('='.repeat(80));
console.log();

const comments = latestSnapshot.data.comments || [];
const contents = latestSnapshot.data.contents || [];

console.log(`评论总数: ${comments.length}`);
console.log(`作品总数: ${contents.length}`);
console.log();

// 创建作品ID集合
const contentIds = new Set(contents.map(c => c.contentId));
console.log('作品ID列表:');
contentIds.forEach(id => {
  const content = contents.find(c => c.contentId === id);
  console.log(`  - ${id} (${content.title.substring(0, 30)}...)`);
});
console.log();

// 分析每条评论
console.log('评论匹配情况:');
console.log('-'.repeat(80));

let matchedCount = 0;
let orphanCount = 0;
const orphanContentIds = new Set();

comments.forEach((comment, index) => {
  const matched = contentIds.has(comment.contentId);
  const status = matched ? '✅' : '❌';

  console.log(`${index + 1}. ${status} ${comment.content.substring(0, 30)}...`);
  console.log(`   作品ID: ${comment.contentId}`);
  console.log(`   匹配状态: ${matched ? '成功' : '失败 - 作品不存在'}`);
  console.log();

  if (matched) {
    matchedCount++;
  } else {
    orphanCount++;
    orphanContentIds.add(comment.contentId);
  }
});

console.log('='.repeat(80));
console.log(`✅ 成功匹配: ${matchedCount} 条`);
console.log(`❌ 孤儿评论: ${orphanCount} 条`);
console.log();

if (orphanContentIds.size > 0) {
  console.log(`孤儿评论涉及的作品ID (${orphanContentIds.size} 个):`);
  orphanContentIds.forEach(id => {
    const commentsForThisId = comments.filter(c => c.contentId === id);
    console.log(`  - ${id} (${commentsForThisId.length} 条评论)`);
  });
  console.log();
}

console.log('💡 分析结论:');
console.log('='.repeat(80));

if (orphanCount === 0) {
  console.log('✅ 所有评论都成功匹配到作品！');
} else {
  console.log(`⚠️  有 ${orphanCount} 条评论无法匹配到作品`);
  console.log();
  console.log('可能的原因:');
  console.log('1. 这些评论来自更早期的视频（不在当前作品列表中）');
  console.log('2. 作品 API 只返回最近的视频（如最新20个）');
  console.log('3. 评论 API 返回了所有历史评论');
  console.log();
  console.log('解决方案:');
  console.log('1. 增加作品爬取范围（翻页）');
  console.log('2. 或者只保留能匹配到作品的评论');
  console.log('3. 或者为孤儿评论单独爬取对应的作品详情');
}
