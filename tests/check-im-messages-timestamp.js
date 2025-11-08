/**
 * 测试脚本: 检查IM WebSocket服务器发送的消息时间戳格�? *
 * 目的: 验证getMessagesFromDataStore()方法返回的消息是否包含正确格式的时间�? */

const Database = require('better-sqlite3');
const path = require('path');

// 加载DataStore和IM WebSocket服务器代�?const DataStore = require('../packages/master/src/datastore/datastore');
const ImWebSocketServer = require('../packages/master/src/communication/im-websocket-server');

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 测试 IM WebSocket 消息时间戳格�?                   �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 1. 初始化DataStore
const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('📦 初始�?DataStore...\n');
const dataStore = new DataStore();

// 2. 加载账户数据到DataStore
const cacheData = db.prepare(`
  SELECT
    account_id,
    type,
    data
  FROM cache_data
  WHERE account_id = ?
`).all(accountId);

console.log(`找到 ${cacheData.length} 条缓存数据\n`);

// 将数据加载到DataStore
const accountData = {
  accountId: accountId,
  platform: 'douyin',
  lastUpdate: Date.now(),
  data: {}
};

cacheData.forEach(row => {
  const type = row.type; // 'contents', 'comments', 'conversations', 'messages'
  const data = JSON.parse(row.data);

  if (type === 'comments') {
    accountData.data.comments = data;
  } else if (type === 'messages') {
    accountData.data.messages = data;
  } else if (type === 'contents') {
    accountData.data.contents = data;
  } else if (type === 'conversations') {
    accountData.data.conversations = data;
  }
});

dataStore.accounts.set(accountId, accountData);

console.log('�?DataStore 加载完成\n');
console.log(`账户数据包含:`);
console.log(`  - 评论�? ${accountData.data.comments ? accountData.data.comments.length : 0}`);
console.log(`  - 私信�? ${accountData.data.messages ? accountData.data.messages.length : 0}`);
console.log(`  - 作品�? ${accountData.data.contents ? accountData.data.contents.length : 0}`);
console.log(`  - 会话�? ${accountData.data.conversations ? accountData.data.conversations.length : 0}\n`);

// 3. 创建ImWebSocketServer实例
const imWsServer = new ImWebSocketServer(null, dataStore);

// 4. 测试getMessagesFromDataStore()方法
console.log('══════════════════════════════════════════════════════�?);
console.log('测试 getMessagesFromDataStore() 方法');
console.log('═══════════════════════════════════════════════════════\n');

// 获取第一个作品的ID (contentId)
const contents = accountData.data.contents || [];
if (contents.length === 0) {
  console.log('�?没有找到任何作品，无法测�?);
  db.close();
  process.exit(1);
}

const firstContent = contents[0];
const topicId = firstContent.contentId;

console.log(`📝 测试作品: ${firstContent.title?.substring(0, 40) || '无标�?}...`);
console.log(`   contentId: ${topicId}\n`);

// 调用getMessagesFromDataStore()
const messages = imWsServer.getMessagesFromDataStore(topicId);

console.log(`找到 ${messages.length} 条消息\n`);

if (messages.length > 0) {
  console.log('【消息时间戳检查】\n');

  // 检查前5条消�?  const samplesToCheck = Math.min(5, messages.length);

  for (let i = 0; i < samplesToCheck; i++) {
    const msg = messages[i];

    console.log(`${i + 1}. 消息ID: ${msg.id}`);
    console.log(`   类型: ${msg.type} (分类: ${msg.messageCategory})`);
    console.log(`   内容: ${msg.content.substring(0, 30)}...`);
    console.log(`   发送�? ${msg.fromName}`);

    // 检查timestamp
    const timestamp = msg.timestamp;
    const isNumber = typeof timestamp === 'number';
    const isMilliseconds = isNumber && timestamp >= 10000000000 && timestamp < 10000000000000;

    console.log(`   timestamp: ${timestamp}`);
    console.log(`   类型: ${typeof timestamp}`);

    if (!isNumber) {
      console.log(`   �?错误: timestamp 不是数字类型!`);
    } else if (!isMilliseconds) {
      console.log(`   �?错误: timestamp 不是13位毫秒级!`);
      if (timestamp < 10000000000) {
        console.log(`      (看起来是秒级: ${timestamp})`);
      }
    } else {
      console.log(`   �?正确: 13位毫秒级时间戳`);
    }

    // 转换为日�?    const date = new Date(timestamp);
    console.log(`   转换为日�? ${date.toLocaleString('zh-CN')}`);

    console.log('');
  }

  // 统计
  console.log('══════════════════════════════════════════════════════�?);
  console.log('统计结果');
  console.log('═══════════════════════════════════════════════════════\n');

  const invalidTimestamps = messages.filter(m => {
    const ts = m.timestamp;
    return typeof ts !== 'number' || ts < 10000000000 || ts >= 10000000000000;
  });

  if (invalidTimestamps.length === 0) {
    console.log('�?所有消息的时间戳格式正�?(13位毫秒级)\n');
  } else {
    console.log(`�?发现 ${invalidTimestamps.length} 条消息的时间戳格式错�?\n`);
    invalidTimestamps.slice(0, 3).forEach(m => {
      console.log(`  - ID: ${m.id}`);
      console.log(`    timestamp: ${m.timestamp} (${typeof m.timestamp})`);
      console.log(`    转换为日�? ${new Date(m.timestamp).toLocaleString('zh-CN')}\n`);
    });
  }
}

// 5. 测试私信主题
console.log('\n══════════════════════════════════════════════════════�?);
console.log('测试私信消息时间�?);
console.log('═══════════════════════════════════════════════════════\n');

const conversations = accountData.data.conversations || [];
if (conversations.length > 0) {
  const firstConv = conversations[0];
  const convId = firstConv.conversationId;

  console.log(`💬 测试会话: ${firstConv.userName || '未知用户'}`);
  console.log(`   conversationId: ${convId}\n`);

  const privateMessages = imWsServer.getMessagesFromDataStore(convId);

  console.log(`找到 ${privateMessages.length} 条私信\n`);

  if (privateMessages.length > 0) {
    const firstMsg = privateMessages[0];

    console.log('检查第一条私�?');
    console.log(`  timestamp: ${firstMsg.timestamp}`);
    console.log(`  类型: ${typeof firstMsg.timestamp}`);

    const isValid = typeof firstMsg.timestamp === 'number' &&
                    firstMsg.timestamp >= 10000000000 &&
                    firstMsg.timestamp < 10000000000000;

    if (isValid) {
      console.log(`  �?时间戳格式正�?(13位毫秒级)`);
    } else {
      console.log(`  �?时间戳格式错误`);
    }

    console.log(`  转换为日�? ${new Date(firstMsg.timestamp).toLocaleString('zh-CN')}\n`);
  }
} else {
  console.log('⚠️  没有找到任何会话数据\n');
}

console.log('═══════════════════════════════════════════════════════\n');

db.close();
