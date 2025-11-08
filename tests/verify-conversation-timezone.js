/**
 * 验证脚本: 检查私信会话的时间戳显示是否正�? *
 * 目的: 诊断客户端截图中显示的日�?11/01, 10/28, 01/21)来源
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 验证私信会话时间戳显�?                              �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 查询所有私信会�?const conversations = db.prepare(`
  SELECT
    id,
    json_extract(data, '$.conversationId') as conversation_id,
    json_extract(data, '$.userName') as user_name,
    json_extract(data, '$.createdAt') as created_at,
    json_extract(data, '$.updatedAt') as updated_at,
    json_extract(data, '$.lastMessageTime') as last_message_time,
    json_extract(data, '$.lastMessageContent') as last_message_content
  FROM cache_conversations
  WHERE account_id = ?
  ORDER BY json_extract(data, '$.lastMessageTime') DESC
  LIMIT 10
`).all(accountId);

console.log(`找到 ${conversations.length} 个私信会话\n`);

if (conversations.length === 0) {
  console.log('⚠️  数据库中还没有私信会话数�?);
  db.close();
  process.exit(0);
}

console.log('【最新的私信会话】\n');

conversations.forEach((conv, index) => {
  const lastMessageTime = conv.last_message_time;

  console.log(`${index + 1}. ${conv.user_name}`);
  console.log(`   内容: ${conv.last_message_content?.substring(0, 30)}...`);
  console.log(`   lastMessageTime 时间�? ${lastMessageTime}`);

  // 判断时间戳格�?  if (lastMessageTime) {
    const isMilliseconds = lastMessageTime > 10000000000;
    const timestampMs = isMilliseconds ? lastMessageTime : (lastMessageTime * 1000);

    const date = new Date(timestampMs);
    console.log(`   格式: ${isMilliseconds ? '毫秒�?(13�?' : '秒级 (10�?'}`);
    console.log(`   UTC时间: ${date.toUTCString()}`);
    console.log(`   本地时间 (UTC+8): ${date.toLocaleString('zh-CN')}`);
    console.log(`   客户端应显示: ${date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}`);

    // 检查时间是否合�?    const now = Date.now();
    const ageInMs = now - timestampMs;
    const ageInHours = ageInMs / 3600 / 1000;

    if (ageInHours < 0) {
      console.log(`   �?错误: 时间戳在未来�?${Math.abs(ageInHours).toFixed(1)} 小时�?`);
    } else if (ageInHours > 24 * 365) {
      console.log(`   �?错误: 时间戳太老！(${(ageInHours / 24 / 365).toFixed(1)} 年前)`);
    } else if (ageInHours > 24 * 30) {
      console.log(`   ⚠️  警告: 时间戳较�?(${(ageInHours / 24).toFixed(1)} 天前)`);
    } else {
      console.log(`   �?时间合理 (${ageInHours.toFixed(1)} 小时�?`);
    }
  } else {
    console.log(`   �?时间戳缺失`);
  }

  console.log('');
});

console.log('═══════════════════════════════════════════════════════\n');
console.log('💡 如何验证:');
console.log('   1. 对比客户端截图中显示的日�?);
console.log('   2. 检�?"客户端应显示" 是否匹配截图');
console.log('   3. 如果不匹配，说明可能还有时区问题\n');

db.close();
