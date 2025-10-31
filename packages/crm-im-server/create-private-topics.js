/**
 * 为私信消息创建对应的主题记录
 * 私信消息存在,但缺少对应的topic记录,导致监控页面无法显示私信列表
 */

const fs = require('fs');
const path = require('path');

const messagesPath = path.join(__dirname, 'config', 'messages.json');
const topicsPath = path.join(__dirname, 'config', 'topics.json');
const channelsPath = path.join(__dirname, 'config', 'channels.json');

// 读取数据
console.log('正在读取配置文件...');
const messagesData = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
const topicsData = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
const channelsData = JSON.parse(fs.readFileSync(channelsPath, 'utf8'));

console.log(`消息总数: ${messagesData.messages.length}`);
console.log(`主题总数: ${topicsData.topics.length}`);

// 查找所有私信消息
const privateMessages = messagesData.messages.filter(msg =>
  msg.messageCategory === 'private'
);

console.log(`找到 ${privateMessages.length} 条私信消息`);

// 按 topicId 分组私信
const privateMessagesByTopic = {};
privateMessages.forEach(msg => {
  if (!privateMessagesByTopic[msg.topicId]) {
    privateMessagesByTopic[msg.topicId] = [];
  }
  privateMessagesByTopic[msg.topicId].push(msg);
});

const uniquePrivateTopics = Object.keys(privateMessagesByTopic);
console.log(`私信涉及 ${uniquePrivateTopics.length} 个唯一主题:`);
uniquePrivateTopics.forEach(topicId => {
  console.log(`  - ${topicId}: ${privateMessagesByTopic[topicId].length} 条消息`);
});

// 创建备份
const backupPath = topicsPath + `.backup_${Date.now()}`;
console.log(`\n创建备份: ${backupPath}`);
fs.writeFileSync(backupPath, JSON.stringify(topicsData, null, 2), 'utf8');

// 为每个私信主题创建topic记录
let addedCount = 0;

uniquePrivateTopics.forEach(topicId => {
  // 检查是否已存在
  const existingTopic = topicsData.topics.find(t => t.id === topicId);
  if (existingTopic) {
    console.log(`主题 ${topicId} 已存在,跳过`);
    return;
  }

  const msgs = privateMessagesByTopic[topicId];
  const latestMsg = msgs.reduce((latest, current) =>
    current.timestamp > latest.timestamp ? current : latest
  );

  // 从 topicId 中提取信息
  // 格式可能是: private_10001_to_user_0001 或 private_10001
  let channelId = msgs[0].channelId;
  let fromUserName = latestMsg.fromName;
  let fromUserId = latestMsg.fromId;

  // 查找对应的频道
  const channel = channelsData.channels.find(ch => ch.id === channelId);
  const channelName = channel ? channel.name : channelId;

  // 创建主题
  const newTopic = {
    id: topicId,
    channelId: channelId,
    title: `私信: ${fromUserName}`,
    description: `与 ${fromUserName} (${fromUserId}) 的私信对话`,
    createdTime: msgs[0].timestamp,
    lastMessageTime: latestMsg.timestamp,
    messageCount: msgs.length,
    isPinned: false,
    lastMessage: latestMsg.content.substring(0, 50),
    isPrivate: true  // 标记为私信主题
  };

  topicsData.topics.push(newTopic);
  addedCount++;
  console.log(`✓ 创建私信主题: ${newTopic.title} (${msgs.length} 条消息)`);
});

// 保存更新后的主题配置
if (addedCount > 0) {
  fs.writeFileSync(topicsPath, JSON.stringify(topicsData, null, 2), 'utf8');
  console.log(`\n成功添加 ${addedCount} 个私信主题到 topics.json`);
  console.log(`新的主题总数: ${topicsData.topics.length}`);
} else {
  console.log('\n没有需要添加的私信主题');
}

console.log('\n完成!');
