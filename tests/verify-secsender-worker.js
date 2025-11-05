/**
 * 验证 Worker 本地数据库中的 secSender 字段
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Worker 本地缓存数据库路径
const dbPath = path.join(__dirname, '../packages/worker/data/cache/worker1_cache.db');

if (!fs.existsSync(dbPath)) {
  console.log('❌ Worker 本地数据库不存在:', dbPath);
  console.log('请确保 Worker 已经启动并爬取了数据');
  process.exit(1);
}

console.log('数据库路径:', dbPath);
console.log('');

const db = new Database(dbPath);

console.log('='.repeat(80));
console.log('Worker 本地数据库验证报告');
console.log('='.repeat(80));
console.log('');

// 获取表结构
const pragma = db.prepare("PRAGMA table_info(messages)").all();
console.log('messages 表结构:');
pragma.forEach(col => {
  console.log(`  - ${col.name} (${col.type})`);
});
console.log('');

const msgs = db.prepare('SELECT COUNT(*) as count FROM messages').get();
console.log('📊 消息总数:', msgs.count, '条');
console.log('');

if (msgs.count > 0) {
  console.log('='.repeat(80));
  console.log('⭐ 验证前5条消息');
  console.log('='.repeat(80));
  console.log('');

  const messages = db.prepare('SELECT * FROM messages LIMIT 5').all();

  messages.forEach((msg, idx) => {
    console.log(`消息 #${idx + 1}:`);
    console.log('  platform_message_id:', msg.platform_message_id);
    console.log('  conversation_id:', msg.conversation_id ? msg.conversation_id.substring(0, 50) : '无');
    console.log('  sender_id:', msg.sender_id ? msg.sender_id.substring(0, 50) : '无');
    console.log('  content:', msg.content ? msg.content.substring(0, 30) : '无');

    // 检查data字段（JSON格式）
    if (msg.data) {
      try {
        const data = JSON.parse(msg.data);
        if (data.rawData) {
          console.log('  ⭐ rawData.secSender:', data.rawData.secSender ? data.rawData.secSender.substring(0, 50) + '...' : '❌ 无');
        } else {
          console.log('  ⚠️ 没有 rawData 对象');
        }
      } catch (e) {
        console.log('  ⚠️ data 字段解析失败');
      }
    }
    console.log('');
  });

  console.log('='.repeat(80));
  console.log('📊 统计所有消息');
  console.log('='.repeat(80));
  console.log('');

  const allMsgs = db.prepare('SELECT * FROM messages').all();

  let hasSecSender = 0;
  let noSecSender = 0;
  let hasEncryptedConvId = 0;
  let hasEncryptedSenderId = 0;

  allMsgs.forEach(msg => {
    const convId = msg.conversation_id;
    const senderId = msg.sender_id;

    // 检查 rawData.secSender
    if (msg.data) {
      try {
        const data = JSON.parse(msg.data);
        if (data.rawData?.secSender) {
          hasSecSender++;
        } else {
          noSecSender++;
        }
      } catch (e) {
        noSecSender++;
      }
    } else {
      noSecSender++;
    }

    // 检查外层字段是否使用加密ID
    if (convId && convId.startsWith('MS4wLjABAAAA')) {
      hasEncryptedConvId++;
    }

    if (senderId && senderId.startsWith('MS4wLjABAAAA')) {
      hasEncryptedSenderId++;
    }
  });

  console.log('rawData.secSender 字段:');
  console.log('  ✅ 有 secSender:', hasSecSender, '/', allMsgs.length, '条', `(${(hasSecSender / allMsgs.length * 100).toFixed(1)}%)`);
  console.log('  ❌ 无 secSender:', noSecSender, '/', allMsgs.length, '条', `(${(noSecSender / allMsgs.length * 100).toFixed(1)}%)`);
  console.log('');

  console.log('外层标准化字段:');
  console.log('  conversation_id 使用加密ID:', hasEncryptedConvId, '/', allMsgs.length, '条', `(${(hasEncryptedConvId / allMsgs.length * 100).toFixed(1)}%)`);
  console.log('  sender_id 使用加密ID:', hasEncryptedSenderId, '/', allMsgs.length, '条', `(${(hasEncryptedSenderId / allMsgs.length * 100).toFixed(1)}%)`);
  console.log('');

  console.log('='.repeat(80));
  console.log('🎯 结论:');
  console.log('='.repeat(80));
  console.log('');

  if (hasSecSender === allMsgs.length && hasEncryptedConvId === allMsgs.length && hasEncryptedSenderId === allMsgs.length) {
    console.log('🎉🎉🎉 完美！所有消息都符合标准化数据结构！');
    console.log('  ✅ 100% 消息包含 rawData.secSender');
    console.log('  ✅ 100% 消息的 conversation_id 使用加密ID');
    console.log('  ✅ 100% 消息的 sender_id 使用加密ID');
  } else {
    console.log('⚠️ 数据结构需要优化:');
    if (hasSecSender < allMsgs.length) {
      console.log(`  ❌ 仅 ${(hasSecSender / allMsgs.length * 100).toFixed(1)}% 消息包含 rawData.secSender`);
    }
    if (hasEncryptedConvId < allMsgs.length) {
      console.log(`  ⚠️ 仅 ${(hasEncryptedConvId / allMsgs.length * 100).toFixed(1)}% 消息的 conversation_id 使用加密ID`);
    }
    if (hasEncryptedSenderId < allMsgs.length) {
      console.log(`  ⚠️ 仅 ${(hasEncryptedSenderId / allMsgs.length * 100).toFixed(1)}% 消息的 sender_id 使用加密ID`);
    }
  }
}

console.log('');
console.log('='.repeat(80));

db.close();
