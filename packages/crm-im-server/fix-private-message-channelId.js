const fs = require('fs');
const path = require('path');

// 读取messages.json
const messagesPath = path.join(__dirname, 'config', 'messages.json');
const messagesData = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));

console.log('开始修复私信消息的channelId...\n');

let fixedCount = 0;

// 遍历所有消息
messagesData.messages.forEach(msg => {
  // 如果是私信消息且channelId是private_messages
  if (msg.messageCategory === 'private' && msg.channelId === 'private_messages') {
    // 根据topicId判断应该属于哪个用户
    // private_10001 -> 张三发给用户1,所以channelId应该是user_0001
    // private_10001_to_user_0001 -> 用户1发给张三,也属于user_0001的账户

    // 从topicId中提取目标用户
    if (msg.topicId.includes('_to_user_')) {
      // 格式: private_10001_to_user_0001
      const match = msg.topicId.match(/_to_(user_\d+)/);
      if (match) {
        msg.channelId = match[1];
        console.log(`✓ 修复消息 ${msg.id}: channelId = ${msg.channelId}`);
        fixedCount++;
      }
    } else if (msg.topicId.startsWith('private_')) {
      // 格式: private_10001 (张三 -> 用户1)
      // 需要查看toId来确定channelId
      if (msg.toId) {
        // 如果toId是user_开头,说明发给某个用户
        if (msg.toId.startsWith('user_')) {
          msg.channelId = msg.toId;
          console.log(`✓ 修复消息 ${msg.id}: channelId = ${msg.channelId} (根据toId)`);
          fixedCount++;
        }
        // 如果toId是数字(如10001),说明是发给普通用户,接收方应该是user_0001
        else if (/^\d+$/.test(msg.toId)) {
          msg.channelId = 'user_0001'; // 默认接收方是用户1
          console.log(`✓ 修复消息 ${msg.id}: channelId = user_0001 (默认接收方)`);
          fixedCount++;
        }
      } else {
        // 如果没有toId,默认设为user_0001
        msg.channelId = 'user_0001';
        console.log(`✓ 修复消息 ${msg.id}: channelId = user_0001 (默认)`);
        fixedCount++;
      }
    }
  }
});

// 保存修复后的数据
fs.writeFileSync(messagesPath, JSON.stringify(messagesData, null, 2), 'utf8');

console.log(`\n✓ 修复完成!共修复 ${fixedCount} 条私信消息的channelId`);
console.log('请重启服务器以加载新的配置');
