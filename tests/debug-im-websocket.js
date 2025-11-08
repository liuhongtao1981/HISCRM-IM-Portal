/**
 * 调试 IM WebSocket 私信显示问题
 * 验证 DataStore �?WebSocket �?客户端数据流
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

const ACCOUNT_ID = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('\n' + '='.repeat(80));
console.log('私信会话和消息调试报�?);
console.log('='.repeat(80) + '\n');

try {
  // 1. 查询会话总数
  console.log('【步�?1�?会话数量统计\n');

  const convCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM cache_conversations
    WHERE account_id = ?
  `).get(ACCOUNT_ID);

  console.log(`  总会话数: ${convCount.count}`);

  // 2. 列出�?10 个会话及其消息数
  console.log('\n【步�?2�?会话列表（前10个，按最后消息时间倒序）\n');

  const conversations = db.prepare(`
    SELECT id, user_id, data, last_message_time
    FROM cache_conversations
    WHERE account_id = ?
    ORDER BY last_message_time DESC
    LIMIT 10
  `).all(ACCOUNT_ID);

  conversations.forEach((conv, idx) => {
    const data = JSON.parse(conv.data);

    // 查询该会话的消息�?    const msgCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM cache_messages
      WHERE account_id = ? AND conversation_id = ?
    `).get(ACCOUNT_ID, conv.id);

    console.log(`  ${idx + 1}. conversationId: ${conv.id}`);
    console.log(`     userName: ${data.userName || '未知'}`);
    console.log(`     userId: ${conv.user_id || '未知'}`);
    console.log(`     消息�? ${msgCount.count}`);
    console.log(`     lastMessageTime: ${conv.last_message_time ? new Date(conv.last_message_time).toLocaleString('zh-CN') : '�?}`);
    console.log('');
  });

  // 3. 查询消息总数
  console.log('【步�?3�?消息数量统计\n');

  const msgCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM cache_messages
    WHERE account_id = ?
  `).get(ACCOUNT_ID);

  console.log(`  总消息数: ${msgCount.count}`);

  // 4. 按会话ID分组的消息数�?  console.log('\n【步�?4�?消息分布（按会话ID）\n');

  const msgDistribution = db.prepare(`
    SELECT conversation_id, COUNT(*) as count
    FROM cache_messages
    WHERE account_id = ?
    GROUP BY conversation_id
    ORDER BY count DESC
    LIMIT 10
  `).all(ACCOUNT_ID);

  msgDistribution.forEach((row, idx) => {
    // 查找会话名称
    const conv = conversations.find(c => c.id === row.conversation_id);
    const convData = conv ? JSON.parse(conv.data) : null;
    const userName = convData?.userName || '未知';

    console.log(`  ${idx + 1}. conversationId: ${row.conversation_id}`);
    console.log(`     会话名称: ${userName}`);
    console.log(`     消息数量: ${row.count}`);
    console.log('');
  });

  // 5. 查看第一个会话的�?条消�?  console.log('【步�?5�?示例消息内容（第一个会话的�?条）\n');

  if (conversations.length > 0) {
    const firstConv = conversations[0];
    const messages = db.prepare(`
      SELECT id, conversation_id, data, created_at
      FROM cache_messages
      WHERE account_id = ? AND conversation_id = ?
      ORDER BY created_at DESC
      LIMIT 5
    `).all(ACCOUNT_ID, firstConv.id);

    messages.forEach((msg, idx) => {
      const data = JSON.parse(msg.data);

      console.log(`  ${idx + 1}. messageId: ${data.messageId}`);
      console.log(`     conversationId: ${msg.conversation_id}`);
      console.log(`     senderName: ${data.senderName || '未知'}`);
      console.log(`     content: ${data.content?.substring(0, 50) || '(无内�?'}...`);
      console.log(`     direction: ${data.direction || '未知'}`);
      console.log(`     createdAt: ${msg.created_at ? new Date(msg.created_at).toLocaleString('zh-CN') : '�?}`);
      console.log('');
    });
  }

  // 6. 验证 DataStore 需要的数据结构
  console.log('【步�?6�?DataStore 兼容性验证\n');

  console.log('  �?conversations 表包含必需字段:');
  console.log('     - id (conversationId)');
  console.log('     - user_id (userId)');
  console.log('     - data.userName');
  console.log('     - last_message_time');
  console.log('');

  console.log('  �?messages 表包含必需字段:');
  console.log('     - id (messageId)');
  console.log('     - conversation_id');
  console.log('     - data.senderName');
  console.log('     - data.content');
  console.log('     - data.direction');
  console.log('     - created_at');
  console.log('');

  // 7. 生成 WebSocket 测试命令
  console.log('【步�?7�?WebSocket 调试命令\n');

  console.log('  在浏览器 Console 中执行以下命令测试：\n');

  console.log('  // 1. 请求 topics (会话列表)');
  console.log(`  websocketService.emit('monitor:request_topics', {`);
  console.log(`    channelId: '${ACCOUNT_ID}'`);
  console.log(`  });\n`);

  if (conversations.length > 0) {
    console.log('  // 2. 请求第一个会话的消息');
    console.log(`  websocketService.emit('monitor:request_messages', {`);
    console.log(`    topicId: '${conversations[0].id}'`);
    console.log(`  });\n`);
  }

  console.log('  // 3. 检�?Redux store');
  console.log(`  const state = store.getState();`);
  console.log(`  console.log('Topics:', state.monitor.topics);`);
  console.log(`  console.log('Messages:', state.monitor.messages);\n`);

  // 8. 预期结果
  console.log('【步�?8�?预期结果\n');

  console.log(`  �?应该接收�?${convCount.count} �?topics (私信会话)`);
  console.log(`  �?每个 topic 应该包含 isPrivate: true`);
  console.log(`  �?总共应该�?${msgCount.count} 条消息`);
  console.log(`  �?每条消息应该包含 messageCategory: 'private'`);
  console.log('');

  console.log('='.repeat(80));
  console.log('调试完成！请对照此报告检查客户端接收到的数据�?);
  console.log('='.repeat(80) + '\n');

} catch (error) {
  console.error('查询失败:', error.message);
  console.error(error.stack);
} finally {
  db.close();
}
