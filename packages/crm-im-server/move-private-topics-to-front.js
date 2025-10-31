/**
 * 将私信主题移动到主题列表的前面
 * 确保它们在前100个主题内,不会被截断
 */

const fs = require('fs');
const path = require('path');

const topicsPath = path.join(__dirname, 'config', 'topics.json');

// 读取主题配置
console.log('正在读取 topics.json...');
const topicsData = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));

console.log(`总主题数: ${topicsData.topics.length}`);

// 创建备份
const backupPath = topicsPath + `.backup_${Date.now()}`;
console.log(`创建备份: ${backupPath}`);
fs.writeFileSync(backupPath, JSON.stringify(topicsData, null, 2), 'utf8');

// 将主题分为私信和非私信
const privateTopics = [];
const regularTopics = [];

topicsData.topics.forEach(topic => {
  if (topic.isPrivate) {
    privateTopics.push(topic);
  } else {
    regularTopics.push(topic);
  }
});

console.log(`\n私信主题数: ${privateTopics.length}`);
console.log(`普通主题数: ${regularTopics.length}`);

// 重新排列:私信主题放在最前面
const reorderedTopics = [...privateTopics, ...regularTopics];

// 保存
topicsData.topics = reorderedTopics;
fs.writeFileSync(topicsPath, JSON.stringify(topicsData, null, 2), 'utf8');

console.log(`\n✓ 已将 ${privateTopics.length} 个私信主题移到列表最前面`);
console.log('私信主题:');
privateTopics.forEach((t, i) => {
  console.log(`  ${i}: ${t.id} (${t.channelId})`);
});

console.log('\n完成!');
