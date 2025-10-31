/**
 * 修复私信主题的 channelId
 * 将 channelId: "private_messages" 改为对应的实际账户ID
 */

const fs = require('fs');
const path = require('path');

const topicsPath = path.join(__dirname, 'config', 'topics.json');
const messagesPath = path.join(__dirname, 'config', 'messages.json');

// 读取数据
console.log('正在读取配置文件...');
const topicsData = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
const messagesData = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));

console.log(`主题总数: ${topicsData.topics.length}`);

// 查找所有私信主题
const privateTopics = topicsData.topics.filter(t => t.isPrivate);
console.log(`找到 ${privateTopics.length} 个私信主题`);

// 创建备份
const backupPath = topicsPath + `.backup_${Date.now()}`;
console.log(`创建备份: ${backupPath}`);
fs.writeFileSync(backupPath, JSON.stringify(topicsData, null, 2), 'utf8');

let fixedCount = 0;

privateTopics.forEach(topic => {
  console.log(`\n检查私信主题: ${topic.id}`);
  console.log(`  当前 channelId: ${topic.channelId}`);

  // 如果 channelId 不是 "private_messages",则跳过
  if (topic.channelId !== 'private_messages') {
    console.log(`  ✓ channelId 正确,无需修改`);
    return;
  }

  // 查找该主题的消息,获取实际的 channelId
  const topicMessages = messagesData.messages.filter(msg => msg.topicId === topic.id);

  if (topicMessages.length === 0) {
    console.log(`  ⚠ 没有找到消息,无法确定正确的 channelId`);
    return;
  }

  // 获取第一条消息的 channelId
  const correctChannelId = topicMessages[0].channelId;

  // 如果还是 "private_messages",尝试从 topicId 中提取
  let finalChannelId = correctChannelId;

  if (finalChannelId === 'private_messages') {
    // topicId 格式: private_10001 或 private_10001_to_user_0001
    // 我们需要找到这个私信对应的账户
    // 通过查找其他 topicId 格式类似 "private_xxxxx_to_user_xxxx" 的消息来确定账户ID
    const relatedMsg = messagesData.messages.find(msg =>
      msg.topicId.startsWith('private_') &&
      msg.topicId.includes('_to_') &&
      msg.topicId.includes(topic.id.replace('private_', ''))
    );

    if (relatedMsg) {
      finalChannelId = relatedMsg.channelId;
    }
  }

  if (finalChannelId === 'private_messages') {
    console.log(`  ⚠ 仍然无法确定正确的 channelId`);
    return;
  }

  // 更新 channelId
  const topicIndex = topicsData.topics.findIndex(t => t.id === topic.id);
  topicsData.topics[topicIndex].channelId = finalChannelId;

  console.log(`  ✓ 已修改 channelId: ${topic.channelId} → ${finalChannelId}`);
  fixedCount++;
});

// 保存更新
if (fixedCount > 0) {
  fs.writeFileSync(topicsPath, JSON.stringify(topicsData, null, 2), 'utf8');
  console.log(`\n✓ 成功修复 ${fixedCount} 个私信主题的 channelId`);
} else {
  console.log(`\n没有需要修复的主题`);
}

console.log('完成!');
