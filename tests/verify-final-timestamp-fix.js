/**
 * 验证 Phase 3 修复 - 检查数据库�?conversation 的时间戳
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? Phase 3 修复验证 - 会话时间戳检�?                   �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 查询�?10 个会�?const conversations = db.prepare(`
  SELECT
    id,
    user_id,
    last_message_time,
    updated_at,
    json_extract(data, '$.userName') as user_name,
    json_extract(data, '$.lastMessageTime') as data_last_message_time
  FROM cache_conversations
  WHERE account_id = ?
  ORDER BY last_message_time DESC
  LIMIT 10
`).all(accountId);

console.log(`找到 ${conversations.length} 个会话\n`);

if (conversations.length === 0) {
  console.log('�?没有找到会话数据');
  console.log('   提示: Worker 可能还在抓取数据�?);
  process.exit(0);
}

console.log('【会话时间戳验证】\n');

let allValid = true;

conversations.forEach((conv, index) => {
  const isMilliseconds = conv.last_message_time >= 10000000000 && conv.last_message_time < 10000000000000;
  const status = isMilliseconds ? '�? : '�?;

  if (!isMilliseconds) allValid = false;

  console.log(`${index + 1}. ${status} ${conv.user_name || '未知用户'}`);
  console.log(`   last_message_time: ${conv.last_message_time}`);
  console.log(`     �?${new Date(conv.last_message_time).toLocaleString('zh-CN')}`);
  console.log(`   data.lastMessageTime: ${conv.data_last_message_time}`);
  console.log(`     �?${new Date(conv.data_last_message_time).toLocaleString('zh-CN')}`);
  console.log(`   格式: ${isMilliseconds ? '毫秒�?(13�?' : '�?格式错误!'}`);
  console.log('');
});

console.log('══════════════════════════════════════════════════════�?);
console.log('\n【验证结果】\n');

if (allValid) {
  console.log('🎉 所有会话时间戳都是毫秒�?(13�?!');
  console.log('');
  console.log('修复成功:');
  console.log('  �?Worker: normalizeTimestamp() 统一为毫秒级');
  console.log('  �?CacheDAO: 保持毫秒级不�?);
  console.log('  �?Database: 存储毫秒�?);
  console.log('  �?IM WebSocket: 应该使用 conversation.lastMessageTime');
  console.log('');
  console.log('IM 客户端应该正确显�?2025�?1�?�?的时�?);
} else {
  console.log('⚠️  仍有时间戳格式不正确');
}

console.log('\n═══════════════════════════════════════════════════════\n');

db.close();
