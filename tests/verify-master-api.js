/**
 * 验证 Master API 返回的消息数据中�?secSender 字段
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
  console.log('='.repeat(80));
  console.log('Master API 消息数据验证报告');
  console.log('='.repeat(80));
  console.log('');

  try {
    const response = await fetchMessages();

    const messages = response.data || response;
    const total = response.total || messages.length;

    console.log('📊 数据统计:');
    console.log('  总消息数:', total);
    console.log('  返回消息�?', messages.length);
    console.log('');

    if (messages.length === 0) {
      console.log('⚠️ 没有消息数据');
      return;
    }

    console.log('='.repeat(80));
    console.log('📋 �?条消息详�?');
    console.log('='.repeat(80));
    console.log('');

    messages.slice(0, 5).forEach((msg, idx) => {
      console.log(`消息 #${idx + 1}:`);
      console.log('  ID:', msg.id);
      console.log('  conversation_id:', msg.conversation_id ? msg.conversation_id.substring(0, 60) : '�?);
      console.log('  sender_id:', msg.sender_id ? msg.sender_id.substring(0, 60) : '�?);
      console.log('  content:', msg.content ? msg.content.substring(0, 40) : '�?);

      // 检�?data 字段中的 rawData
      if (msg.data) {
        const dataObj = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
        if (dataObj.rawData) {
          const secSender = dataObj.rawData.secSender;
          if (secSender) {
            console.log('  �?rawData.secSender:', secSender.substring(0, 60) + (secSender.length > 60 ? '...' : ''));
          } else {
            console.log('  �?rawData.secSender: �?);
          }

          // 显示其他 rawData 字段
          console.log('  rawData 其他字段:', Object.keys(dataObj.rawData).join(', '));
        } else {
          console.log('  ⚠️ 没有 rawData 对象');
          console.log('  data 字段包含:', Object.keys(dataObj).join(', '));
        }
      } else {
        console.log('  ⚠️ 没有 data 字段');
      }
      console.log('');
    });

    console.log('='.repeat(80));
    console.log('📊 统计所有消�?');
    console.log('='.repeat(80));
    console.log('');

    let hasSecSender = 0;
    let noSecSender = 0;
    let hasEncryptedConvId = 0;
    let hasEncryptedSenderId = 0;

    messages.forEach(msg => {
      const convId = msg.conversation_id;
      const senderId = msg.sender_id;

      // 检�?rawData.secSender
      if (msg.data) {
        const dataObj = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
        if (dataObj.rawData?.secSender) {
          hasSecSender++;
        } else {
          noSecSender++;
        }
      } else {
        noSecSender++;
      }

      // 检查外层字�?      if (convId && convId.startsWith('MS4wLjABAAAA')) {
        hasEncryptedConvId++;
      }

      if (senderId && senderId.startsWith('MS4wLjABAAAA')) {
        hasEncryptedSenderId++;
      }
    });

    console.log('rawData.secSender 字段:');
    console.log('  �?�?secSender:', hasSecSender, '/', messages.length, '�?, `(${(hasSecSender / messages.length * 100).toFixed(1)}%)`);
    console.log('  �?�?secSender:', noSecSender, '/', messages.length, '�?, `(${(noSecSender / messages.length * 100).toFixed(1)}%)`);
    console.log('');

    console.log('外层标准化字�?');
    console.log('  conversation_id 使用加密ID:', hasEncryptedConvId, '/', messages.length, '�?, `(${(hasEncryptedConvId / messages.length * 100).toFixed(1)}%)`);
    console.log('  sender_id 使用加密ID:', hasEncryptedSenderId, '/', messages.length, '�?, `(${(hasEncryptedSenderId / messages.length * 100).toFixed(1)}%)`);
    console.log('');

    console.log('='.repeat(80));
    console.log('🎯 最终结�?');
    console.log('='.repeat(80));
    console.log('');

    if (hasSecSender === messages.length && hasEncryptedConvId === messages.length && hasEncryptedSenderId === messages.length) {
      console.log('🎉🎉🎉 完美！所有消息都符合标准化数据结构！');
      console.log('  �?100% 消息包含 rawData.secSender');
      console.log('  �?100% 消息�?conversation_id 使用加密ID');
      console.log('  �?100% 消息�?sender_id 使用加密ID');
      console.log('');
      console.log('�?代码修复成功验证�?);
    } else {
      console.log('⚠️ 数据结构需要优�?');
      if (hasSecSender < messages.length) {
        console.log(`  �?�?${(hasSecSender / messages.length * 100).toFixed(1)}% 消息包含 rawData.secSender`);
      }
      if (hasEncryptedConvId < messages.length) {
        console.log(`  ⚠️ �?${(hasEncryptedConvId / messages.length * 100).toFixed(1)}% 消息�?conversation_id 使用加密ID`);
      }
      if (hasEncryptedSenderId < messages.length) {
        console.log(`  ⚠️ �?${(hasEncryptedSenderId / messages.length * 100).toFixed(1)}% 消息�?sender_id 使用加密ID`);
      }
    }

    console.log('');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('�?请求失败:', error.message);
    console.error('');
    console.error('请确�?');
    console.error('  1. Master 服务器正在运�?(端口 3000)');
    console.error('  2. Worker 已经爬取了私信数�?);
  }
}

main();
