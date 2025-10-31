/**
 * 自动应用messageCategory字段支持补丁 V2
 * 更精确的定位和替换
 */

const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.js');

try {
  // 读取原文件
  let content = fs.readFileSync(serverFile, 'utf8');

  // 查找插入点: parentId检查之前
  const marker = `  // 如果提供了 parentId，则添加到消息对象中（用于评论的2级讨论）`;

  if (content.includes(marker)) {
    // 要插入的代码
    const insertCode = `  // 添加消息分类字段(用于区分私信和评论)
  if (messageCategory) {
    message.messageCategory = messageCategory
  } else if (messageType === 'private') {
    // 如果明确指定了messageType为private,则设置为私信
    message.messageCategory = 'private'
  } else {
    // 默认为评论
    message.messageCategory = 'comment'
  }

`;

    // 在marker前插入代码
    content = content.replace(marker, insertCode + marker);

    // 写入修改后的文件
    fs.writeFileSync(serverFile, content, 'utf8');
    console.log('✓ 成功添加messageCategory逻辑!');
    console.log('\n请重启服务器以使更改生效:');
    console.log('  pkill -f "node server.js"');
    console.log('  node server.js');
  } else {
    console.log('⚠ 未找到插入标记,可能已经应用过补丁');
  }

} catch (error) {
  console.error('✗ 应用补丁失败:', error.message);
  process.exit(1);
}
