/**
 * 分析数据 ID 映射关系
 * 找出评论 API 中的 aweme_id 与作品列表中�?sec_item_id 的对应关�?
 */

const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, '../packages/worker/logs/douyin-data_acc-98296c87-2e42-447a-9d8b-8be008ddb6e4.log');

console.log('📖 读取日志文件...\n');
const logContent = fs.readFileSync(logPath, 'utf8');
const lines = logContent.split('\n').filter(line => line.trim());

// 查找最新的数据快照
const snapshots = lines
  .map((line, index) => {
    try {
      const log = JSON.parse(line);
      if (log.message === '📸 Data Snapshot' && log.snapshot) {
        return { line: index + 1, timestamp: log.timestamp, snapshot: log.snapshot };
      }
    } catch (err) {}
    return null;
  })
  .filter(s => s !== null);

const latest = snapshots[snapshots.length - 1];
const data = latest.snapshot.data;

console.log('📊 数据统计:');
console.log(`   评论: ${data.comments?.length || 0} 条`);
console.log(`   作品: ${data.contents?.length || 0} 个\n`);

// 分析评论中的 contentId (aweme_id)
console.log('📝 评论中的 contentId (aweme_id):');
console.log('='.repeat(80));
const commentContentIds = [...new Set(data.comments?.map(c => c.contentId) || [])];
commentContentIds.forEach((id, index) => {
  const comments = data.comments.filter(c => c.contentId === id);
  console.log(`${index + 1}. ${id} (${comments.length} 条评�?`);
});

// 分析作品中的 contentId (sec_item_id)
console.log('\n📦 作品中的 contentId (sec_item_id):');
console.log('='.repeat(80));
const contentIds = data.contents?.map(c => c.contentId) || [];
contentIds.forEach((id, index) => {
  const content = data.contents[index];
  console.log(`${index + 1}. ${id.substring(0, 60)}...`);
  console.log(`   标题: ${content.title.substring(0, 50)}...`);
  console.log(`   评论�? ${content.commentCount}`);
});

console.log('\n🔍 问题分析:');
console.log('='.repeat(80));
console.log('⚠️  评论使用 aweme_id（纯数字�?);
console.log('⚠️  作品使用 sec_item_id（Base64 编码�?);
console.log('⚠️  这两�?ID 无法直接匹配！\n');

console.log('💡 解决方案:');
console.log('='.repeat(80));
console.log('需要在数据收集时同时保存两�?ID�?);
console.log('1. 作品 API 响应中查�?aweme_id �?item_id');
console.log('2. 评论 API 响应中查�?sec_item_id（如果有�?);
console.log('3. 或者通过其他字段（如标题、发布时间）进行匹配\n');

// 尝试通过评论数匹�?
console.log('🧪 尝试通过评论数量匹配:');
console.log('='.repeat(80));

// 统计每个 aweme_id 的评论数
const commentCounts = {};
data.comments.forEach(c => {
  commentCounts[c.contentId] = (commentCounts[c.contentId] || 0) + 1;
});

// 尝试与作品的 commentCount 匹配
const matches = [];
Object.entries(commentCounts).forEach(([awemeId, count]) => {
  const matchingContents = data.contents.filter(c => c.commentCount === count);
  if (matchingContents.length === 1) {
    matches.push({
      awemeId,
      secItemId: matchingContents[0].contentId,
      commentCount: count,
      title: matchingContents[0].title
    });
    console.log(`�?可能的匹�?`);
    console.log(`   aweme_id: ${awemeId}`);
    console.log(`   sec_item_id: ${matchingContents[0].contentId.substring(0, 40)}...`);
    console.log(`   评论�? ${count}`);
    console.log(`   标题: ${matchingContents[0].title.substring(0, 50)}...\n`);
  } else if (matchingContents.length > 1) {
    console.log(`⚠️  无法匹配（多个作品有 ${count} 条评论）:`);
    console.log(`   aweme_id: ${awemeId}\n`);
  } else {
    console.log(`�?无法匹配（没有作品有 ${count} 条评论）:`);
    console.log(`   aweme_id: ${awemeId}\n`);
  }
});

console.log(`\n📊 匹配结果: ${matches.length} / ${Object.keys(commentCounts).length} 个成功匹配\n`);

// 检查原�?API 日志
console.log('🔍 检查爬取日志中的原�?API 数据:');
console.log('='.repeat(80));

// 读取评论爬取日志
const commentLogPath = path.join(__dirname, '../packages/worker/logs/douyin-crawl-comments.log');
if (fs.existsSync(commentLogPath)) {
  const commentLog = fs.readFileSync(commentLogPath, 'utf8');

  // 查找 API 触发日志
  const apiTriggers = commentLog.split('\n')
    .filter(line => line.includes('评论列表 API 触发'))
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return null;
      }
    })
    .filter(log => log !== null);

  console.log(`找到 ${apiTriggers.length} 次评�?API 触发记录\n`);

  if (apiTriggers.length > 0) {
    console.log('建议: 需要检查评�?API 的原始响应数据，看看是否包含 sec_item_id');
    console.log('      或者作�?API 的原始响应数据，看看是否包含 aweme_id\n');
  }
}

console.log('📋 下一步操作建�?');
console.log('='.repeat(80));
console.log('1. 检查评�?API 原始响应（从 HAR 文件或日志）');
console.log('2. 检查作�?API 原始响应（从日志�?);
console.log('3. 找出包含两种 ID �?API 响应');
console.log('4. 修改数据收集逻辑，同时保存两�?ID');
console.log('5. 重新运行爬虫验证修复效果\n');
