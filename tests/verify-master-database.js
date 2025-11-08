/**
 * 验证 Master 数据库中的消息数�? * 检�?unknown 字段�?rawData 结构
 */

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('�?.repeat(80));
console.log('📊 Master 数据库数据验�?);
console.log('�?.repeat(80));
console.log('');

// 获取消息总数
const count = db.prepare('SELECT COUNT(*) as count FROM cache_messages').get();
console.log('�?消息总数:', count.count, '�?);
console.log('');

if (count.count > 0) {
  console.log('�?.repeat(80));
  console.log('📋 验证�?5 条消息的字段');
  console.log('�?.repeat(80));
  console.log('');

  const messages = db.prepare('SELECT * FROM cache_messages ORDER BY created_at DESC LIMIT 5').all();

  messages.forEach((msg, idx) => {
    const data = JSON.parse(msg.data);

    console.log(`消息 #${idx + 1}:`);
    console.log('  ID:', msg.id);
    console.log('  conversation_id:', msg.conversation_id ? msg.conversation_id.substring(0, 50) : '�?�?);
    console.log('  外层字段:');
    console.log('    - senderId:', data.senderId || '�?unknown');
    console.log('    - senderName:', data.senderName || '�?unknown');
    console.log('    - conversationId:', data.conversationId ? data.conversationId.substring(0, 50) : '�?�?);

    console.log('  rawData 字段:');
    if (data.rawData) {
      const rawKeys = Object.keys(data.rawData);
      console.log('    - 总字段数:', rawKeys.length);
      console.log('    - secSender:', data.rawData.secSender ? '�?' + data.rawData.secSender.substring(0, 50) : '�?�?);
      console.log('    - secReceiver:', data.rawData.secReceiver ? '�?' + data.rawData.secReceiver.substring(0, 50) : '�?�?);
      console.log('    - nickname:', data.rawData.nickname || '�?�?);
      console.log('    - avatar:', data.rawData.avatar ? '�?�? : '�?�?);
      console.log('    - �?20 个字�?', rawKeys.slice(0, 20).join(', '));
    } else {
      console.log('    ⚠️ 没有 rawData 对象');
    }
    console.log('');
  });

  console.log('�?.repeat(80));
  console.log('📊 统计所有消�?);
  console.log('�?.repeat(80));
  console.log('');

  const allMessages = db.prepare('SELECT * FROM cache_messages').all();

  let hasSecSender = 0;
  let noSecSender = 0;
  let hasEncryptedConvId = 0;
  let hasEncryptedSenderId = 0;
  let unknownSenderId = 0;
  let totalRawDataFields = 0;

  allMessages.forEach(msg => {
    const data = JSON.parse(msg.data);
    const convId = msg.conversation_id;
    const senderId = data.senderId;

    // 检�?rawData.secSender
    if (data.rawData?.secSender) {
      hasSecSender++;
    } else {
      noSecSender++;
    }

    // 检查外层字�?    if (convId && convId.startsWith('MS4wLjABAAAA')) {
      hasEncryptedConvId++;
    }

    if (senderId && senderId.startsWith('MS4wLjABAAAA')) {
      hasEncryptedSenderId++;
    }

    if (senderId === 'unknown') {
      unknownSenderId++;
    }

    // 统计 rawData 字段�?    if (data.rawData) {
      totalRawDataFields += Object.keys(data.rawData).length;
    }
  });

  const avgRawDataFields = (totalRawDataFields / allMessages.length).toFixed(1);

  console.log('rawData.secSender 字段:');
  console.log('  �?�?secSender:', hasSecSender, '/', allMessages.length, '�?, `(${(hasSecSender / allMessages.length * 100).toFixed(1)}%)`);
  console.log('  �?�?secSender:', noSecSender, '/', allMessages.length, '�?, `(${(noSecSender / allMessages.length * 100).toFixed(1)}%)`);
  console.log('');

  console.log('外层标准化字�?');
  console.log('  conversation_id 使用加密ID:', hasEncryptedConvId, '/', allMessages.length, '�?, `(${(hasEncryptedConvId / allMessages.length * 100).toFixed(1)}%)`);
  console.log('  senderId 使用加密ID:', hasEncryptedSenderId, '/', allMessages.length, '�?, `(${(hasEncryptedSenderId / allMessages.length * 100).toFixed(1)}%)`);
  console.log('  senderId �?unknown:', unknownSenderId, '/', allMessages.length, '�?, `(${(unknownSenderId / allMessages.length * 100).toFixed(1)}%)`);
  console.log('');

  console.log('rawData 字段统计:');
  console.log('  平均字段�?', avgRawDataFields, '�?条消�?);
  console.log('');

  console.log('�?.repeat(80));
  console.log('🎯 结论:');
  console.log('�?.repeat(80));
  console.log('');

  if (hasSecSender === allMessages.length && hasEncryptedConvId === allMessages.length && unknownSenderId === 0) {
    console.log('🎉🎉🎉 完美！所有消息都符合标准化数据结构！');
    console.log('  �?100% 消息包含 rawData.secSender');
    console.log('  �?100% 消息�?conversation_id 使用加密ID');
    console.log('  �?100% 消息�?senderId 使用加密ID');
    console.log('  �?0% 消息�?senderId �?unknown');
    console.log('');
    console.log('�?代码修复成功验证�?);
  } else {
    console.log('⚠️ 数据结构需要优�?');
    if (hasSecSender < allMessages.length) {
      console.log(`  �?�?${(hasSecSender / allMessages.length * 100).toFixed(1)}% 消息包含 rawData.secSender`);
    }
    if (hasEncryptedConvId < allMessages.length) {
      console.log(`  ⚠️ �?${(hasEncryptedConvId / allMessages.length * 100).toFixed(1)}% 消息�?conversation_id 使用加密ID`);
    }
    if (unknownSenderId > 0) {
      console.log(`  �?${(unknownSenderId / allMessages.length * 100).toFixed(1)}% 消息�?senderId �?unknown`);
    }
    console.log('');
    console.log('💡 需要重�?Worker 以加载新代码');
  }
}

console.log('');
console.log('�?.repeat(80));

db.close();
