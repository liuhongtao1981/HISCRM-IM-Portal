/**
 * 验证数据库中�?rawData.secSender 字段是否存在
 *
 * 目的：检查是否可以通过 secSender 匹配会话�?user_id
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('='.repeat(80));
console.log('验证 rawData.secSender 字段是否存在');
console.log('='.repeat(80));
console.log(`数据库路�? ${dbPath}\n`);

// 获取所有消�?const messages = db.prepare('SELECT data FROM cache_messages').all();

console.log(`总消息数: ${messages.length}\n`);

let hasSecSender = 0;
let noSecSender = 0;
const sampleMessages = [];

messages.forEach((msg, idx) => {
  const data = JSON.parse(msg.data);
  const secSender = data.rawData?.secSender;

  if (secSender) {
    hasSecSender++;
    if (sampleMessages.length < 5) {
      sampleMessages.push({
        index: idx + 1,
        conversation_id: data.conversationId,
        secSender: secSender
      });
    }
  } else {
    noSecSender++;
  }
});

console.log('='.repeat(80));
console.log('统计结果:');
console.log('='.repeat(80));
console.log(`  �?secSender: ${hasSecSender} �?(${(hasSecSender / messages.length * 100).toFixed(1)}%)`);
console.log(`  �?secSender: ${noSecSender} �?(${(noSecSender / messages.length * 100).toFixed(1)}%)`);
console.log('');

if (hasSecSender > 0) {
  console.log('='.repeat(80));
  console.log('�?条有 secSender 的消�?');
  console.log('='.repeat(80));

  sampleMessages.forEach(msg => {
    console.log(`\n消息 #${msg.index}:`);
    console.log(`  conversation_id: ${msg.conversation_id}`);
    console.log(`  secSender: ${msg.secSender.substring(0, 50)}...`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('验证匹配关系');
  console.log('='.repeat(80));

  // 获取所有会�?  const conversations = db.prepare('SELECT user_id, data FROM cache_conversations').all();
  console.log(`\n总会话数: ${conversations.length}\n`);

  let matchCount = 0;
  let noMatchCount = 0;

  sampleMessages.forEach(msg => {
    const match = conversations.find(c => c.user_id === msg.secSender);

    console.log(`secSender: ${msg.secSender.substring(0, 40)}...`);
    if (match) {
      const convData = JSON.parse(match.data);
      console.log(`  �?匹配到会�? ${convData.userName || '(无名�?'}`);
      matchCount++;
    } else {
      console.log(`  �?未找到匹配的会话`);
      noMatchCount++;
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('匹配结果统计:');
  console.log('='.repeat(80));
  console.log(`  成功匹配: ${matchCount} / ${sampleMessages.length}`);
  console.log(`  未能匹配: ${noMatchCount} / ${sampleMessages.length}`);
  console.log('');

  if (matchCount > 0) {
    console.log('✅✅�?成功！secSender 可以匹配到会话的 user_id�?);
    console.log('');
    console.log('📝 下一步行�?');
    console.log('   1. 修改 packages/crm-im-server/src/websocket-server.js');
    console.log('   2. 在查询逻辑中添�?rawData.secSender 匹配');
    console.log('   3. 重启 CRM-IM Server');
    console.log('   4. 测试客户端是否显示私�?);
  } else {
    console.log('⚠️ secSender 存在，但无法匹配到会�?);
    console.log('可能原因：secSender 对应的会话不在数据库�?);
  }

} else {
  console.log('='.repeat(80));
  console.log('⚠️ 未发�?secSender 字段');
  console.log('='.repeat(80));
  console.log('');
  console.log('📝 下一步行�?');
  console.log('   1. 修改 Worker 爬虫 (crawl-direct-messages-v2.js)');
  console.log('   2. 增加 secSender 字段提取逻辑');
  console.log('   3. 重启 Worker，重新爬取数�?);
  console.log('   4. 验证 rawData.secSender 是否存在');
}

console.log('\n' + '='.repeat(80));

db.close();
