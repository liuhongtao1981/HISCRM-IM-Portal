/**
 * 自动应用messageCategory字段支持补丁
 */

const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.js');
const backupFile = path.join(__dirname, `server.js.backup_before_patch_${Date.now()}`);

try {
  // 读取原文件
  let content = fs.readFileSync(serverFile, 'utf8');

  // 创建备份
  fs.copyFileSync(serverFile, backupFile);
  console.log(`✓ 已备份到: ${backupFile}`);

  // 应用补丁1: 修改参数解构
  const oldParams = `const { channelId, topicId, content, fromUserId, fromUserName, parentId } = req.body`;
  const newParams = `const { channelId, topicId, content, fromUserId, fromUserName, parentId, messageType, messageCategory } = req.body`;

  if (content.includes(oldParams)) {
    content = content.replace(oldParams, newParams);
    console.log('✓ 已修改参数解构');
  } else {
    console.log('⚠ 参数解构已被修改或不存在');
  }

  // 应用补丁2: 添加messageCategory逻辑
  const oldLogic = `  // 如果提供了 parentId，则添加到消息对象中（用于评论的2级讨论）
  if (parentId !== undefined && parentId !== null) {
    message.parentId = parentId
  }`;

  const newLogic = `  // 添加消息分类字段(用于区分私信和评论)
  if (messageCategory) {
    message.messageCategory = messageCategory
  } else if (messageType === 'private') {
    // 如果明确指定了messageType为private,则设置为私信
    message.messageCategory = 'private'
  } else {
    // 默认为评论
    message.messageCategory = 'comment'
  }

  // 如果提供了 parentId，则添加到消息对象中（用于评论的2级讨论）
  if (parentId !== undefined && parentId !== null) {
    message.parentId = parentId
  }`;

  if (content.includes(oldLogic)) {
    content = content.replace(oldLogic, newLogic);
    console.log('✓ 已添加messageCategory逻辑');
  } else {
    console.log('⚠ 该逻辑已被修改或不存在');
  }

  // 写入修改后的文件
  fs.writeFileSync(serverFile, content, 'utf8');
  console.log('✓ 补丁应用成功!');
  console.log('\n请重启服务器以使更改生效:');
  console.log('  pkill -f "node server.js"');
  console.log('  node server.js');

} catch (error) {
  console.error('✗ 应用补丁失败:', error.message);
  process.exit(1);
}
