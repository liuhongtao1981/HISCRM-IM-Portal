/**
 * 修复 messages.json 中的编码乱码问题
 * 这个脚本会查找并移除或修复包含乱码的消息记录
 */

const fs = require('fs');
const path = require('path');

const messagesPath = path.join(__dirname, 'config', 'messages.json');

// 读取消息文件
console.log('正在读取 messages.json...');
const rawData = fs.readFileSync(messagesPath, 'utf8');
const data = JSON.parse(rawData);

console.log(`总消息数: ${data.messages.length}`);

// 检测乱码的函数
function hasGarbledText(text) {
  if (!text) return false;

  // 检查是否包含常见的UTF-8乱码特征
  // 如: ����, �, 连续的问号等
  const garbledPatterns = [
    /\ufffd{2,}/,  // Unicode 替换字符 (�) 出现2次或以上
    /[\x00-\x08\x0B\x0C\x0E-\x1F]/,  // 控制字符
  ];

  return garbledPatterns.some(pattern => pattern.test(text));
}

// 查找乱码消息
const garbledMessages = data.messages.filter(msg => {
  return hasGarbledText(msg.content) || hasGarbledText(msg.fromName);
});

console.log(`发现 ${garbledMessages.length} 条包含乱码的消息:`);
garbledMessages.forEach(msg => {
  console.log(`  - ID: ${msg.id}`);
  console.log(`    发送人: ${msg.fromName}`);
  console.log(`    内容: ${msg.content}`);
  console.log(`    时间: ${new Date(msg.timestamp).toLocaleString('zh-CN')}`);
  console.log('');
});

// 创建备份
const backupPath = messagesPath + `.backup_${Date.now()}`;
console.log(`创建备份: ${backupPath}`);
fs.writeFileSync(backupPath, rawData, 'utf8');

// 移除乱码消息
const cleanMessages = data.messages.filter(msg => {
  return !hasGarbledText(msg.content) && !hasGarbledText(msg.fromName);
});

console.log(`移除后剩余消息数: ${cleanMessages.length}`);
console.log(`已删除 ${data.messages.length - cleanMessages.length} 条乱码消息`);

// 保存清理后的数据
data.messages = cleanMessages;
fs.writeFileSync(messagesPath, JSON.stringify(data, null, 2), 'utf8');

console.log('修复完成!');
console.log('如需恢复,请使用备份文件:', backupPath);
