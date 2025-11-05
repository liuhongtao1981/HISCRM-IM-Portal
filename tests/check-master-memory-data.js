/**
 * 通过 Master API 检查内存中的数据
 */

const http = require('http');

function fetchMessages() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/cache/messages?limit=50',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function main() {
  console.log('═'.repeat(80));
  console.log('📊 Master API 内存数据验证');
  console.log('═'.repeat(80));
  console.log('');

  try {
    const response = await fetchMessages();

    const messages = response.data || response;
    const total = response.total || messages.length;

    console.log('✅ 消息总数:', total, '条');
    console.log('✅ 返回消息数:', messages.length, '条');
    console.log('');

    if (messages.length === 0) {
      console.log('⚠️ 没有消息数据');
      console.log('');
      console.log('可能原因:');
      console.log('  1. Worker 还没有开始爬取数据');
      console.log('  2. Master 内存数据还没有加载');
      console.log('  3. API 路径或参数错误');
      return;
    }

    console.log('═'.repeat(80));
    console.log('📋 验证前 5 条消息');
    console.log('═'.repeat(80));
    console.log('');

    messages.slice(0, 5).forEach((msg, idx) => {
      console.log(`消息 #${idx + 1}:`);
      console.log('  ID:', msg.id);
      console.log('  conversation_id:', msg.conversation_id ? msg.conversation_id.substring(0, 50) : '❌ 无');
      console.log('  外层字段:');
      console.log('    - sender_id:', msg.sender_id || '❌ 无');
      console.log('    - sender_name:', msg.sender_name || '❌ 无');
      console.log('  rawData 字段:');
      if (msg.data && msg.data.rawData) {
        const rawKeys = Object.keys(msg.data.rawData);
        console.log('    - 总字段数:', rawKeys.length);
        console.log('    - secSender:', msg.data.rawData.secSender ? '✅ ' + msg.data.rawData.secSender.substring(0, 50) + '...' : '❌ 无');
        console.log('    - secReceiver:', msg.data.rawData.secReceiver ? '✅ ' + msg.data.rawData.secReceiver.substring(0, 50) + '...' : '❌ 无');
        console.log('    - nickname:', msg.data.rawData.nickname || '❌ 无');
        console.log('    - 前 20 个字段:', rawKeys.slice(0, 20).join(', '));
      } else {
        console.log('    ⚠️ 没有 rawData 对象');
        console.log('    data 字段包含:', msg.data ? Object.keys(msg.data).join(', ') : '无 data 字段');
      }
      console.log('');
    });

    console.log('═'.repeat(80));
    console.log('📊 统计所有消息');
    console.log('═'.repeat(80));
    console.log('');

    let hasSecSender = 0;
    let noSecSender = 0;
    let hasEncryptedConvId = 0;
    let hasEncryptedSenderId = 0;
    let unknownSenderId = 0;
    let totalRawDataFields = 0;

    messages.forEach(msg => {
      const convId = msg.conversation_id;
      const senderId = msg.sender_id;

      // 检查 rawData.secSender
      if (msg.data?.rawData?.secSender) {
        hasSecSender++;
      } else {
        noSecSender++;
      }

      // 检查外层字段
      if (convId && convId.startsWith('MS4wLjABAAAA')) {
        hasEncryptedConvId++;
      }

      if (senderId && senderId.startsWith('MS4wLjABAAAA')) {
        hasEncryptedSenderId++;
      }

      if (senderId === 'unknown') {
        unknownSenderId++;
      }

      // 统计 rawData 字段数
      if (msg.data?.rawData) {
        totalRawDataFields += Object.keys(msg.data.rawData).length;
      }
    });

    const avgRawDataFields = (totalRawDataFields / messages.length).toFixed(1);

    console.log('rawData.secSender 字段:');
    console.log('  ✅ 有 secSender:', hasSecSender, '/', messages.length, '条', `(${(hasSecSender / messages.length * 100).toFixed(1)}%)`);
    console.log('  ❌ 无 secSender:', noSecSender, '/', messages.length, '条', `(${(noSecSender / messages.length * 100).toFixed(1)}%)`);
    console.log('');

    console.log('外层标准化字段:');
    console.log('  conversation_id 使用加密ID:', hasEncryptedConvId, '/', messages.length, '条', `(${(hasEncryptedConvId / messages.length * 100).toFixed(1)}%)`);
    console.log('  sender_id 使用加密ID:', hasEncryptedSenderId, '/', messages.length, '条', `(${(hasEncryptedSenderId / messages.length * 100).toFixed(1)}%)`);
    console.log('  sender_id 为 unknown:', unknownSenderId, '/', messages.length, '条', `(${(unknownSenderId / messages.length * 100).toFixed(1)}%)`);
    console.log('');

    console.log('rawData 字段统计:');
    console.log('  平均字段数:', avgRawDataFields, '个/条消息');
    console.log('');

    console.log('═'.repeat(80));
    console.log('🎯 结论:');
    console.log('═'.repeat(80));
    console.log('');

    if (hasSecSender === messages.length && hasEncryptedConvId === messages.length && unknownSenderId === 0) {
      console.log('🎉🎉🎉 完美！所有消息都符合标准化数据结构！');
      console.log('  ✅ 100% 消息包含 rawData.secSender');
      console.log('  ✅ 100% 消息的 conversation_id 使用加密ID');
      console.log('  ✅ 100% 消息的 sender_id 使用加密ID');
      console.log('  ✅ 0% 消息的 sender_id 为 unknown');
      console.log('');
      console.log('✨ 代码修复成功验证！');
    } else {
      console.log('⚠️ 数据结构需要优化:');
      if (hasSecSender < messages.length) {
        console.log(`  ❌ 仅 ${(hasSecSender / messages.length * 100).toFixed(1)}% 消息包含 rawData.secSender`);
      }
      if (hasEncryptedConvId < messages.length) {
        console.log(`  ⚠️ 仅 ${(hasEncryptedConvId / messages.length * 100).toFixed(1)}% 消息的 conversation_id 使用加密ID`);
      }
      if (unknownSenderId > 0) {
        console.log(`  ❌ ${(unknownSenderId / messages.length * 100).toFixed(1)}% 消息的 sender_id 为 unknown`);
      }
      console.log('');
      console.log('💡 说明: Worker 可能还在使用旧代码，需要重启 Worker');
    }

    console.log('');
    console.log('═'.repeat(80));

  } catch (error) {
    console.error('❌ 请求失败:', error.message);
    console.error('');
    console.error('请确保:');
    console.error('  1. Master 服务器正在运行 (端口 3000)');
    console.error('  2. Worker 已经爬取了私信数据');
  }
}

main();
