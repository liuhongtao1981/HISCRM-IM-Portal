/**
 * IM 客户端显示问题调试脚�? *
 * 用�? 连接�?Master，获取并分析私信数据结构
 * 验证: topics �?isPrivate 字段�?messages �?messageCategory 字段
 */

const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

console.log('='.repeat(80));
console.log('🔍 IM 客户端显示问题调�?);
console.log('='.repeat(80));
console.log('');
console.log(`连接�?Master: ${MASTER_URL}`);
console.log('');

const socket = io(MASTER_URL, {
  reconnection: false,
  transports: ['websocket', 'polling']
});

let channelId = null;
let privateTopicId = null;

socket.on('connect', () => {
  console.log('�?WebSocket 连接成功');
  console.log('');

  // 注册客户�?  socket.emit('monitor:register', {
    clientId: `debug_${Date.now()}`,
    clientType: 'monitor'
  });
});

socket.on('monitor:registered', (data) => {
  console.log('�?客户端注册成�?);
  console.log(`   频道�? ${data.channelCount}`);
  console.log('');
});

socket.on('monitor:channels', (data) => {
  const { channels } = data;
  console.log(`📡 收到 channels: ${channels.length} 个`);

  if (channels.length === 0) {
    console.log('�?没有频道数据，请确认 Worker 已爬取数�?);
    socket.disconnect();
    process.exit(1);
  }

  // 使用第一个频�?  channelId = channels[0].id;
  console.log(`   选择频道: ${channels[0].name} (${channelId})`);
  console.log('');

  // 请求该频道的 topics
  console.log('📤 请求 topics...');
  socket.emit('monitor:request_topics', { channelId });
});

socket.on('monitor:topics', (data) => {
  const { topics } = data;
  console.log('');
  console.log('='.repeat(80));
  console.log(`📡 收到 topics: ${topics.length} 个`);
  console.log('='.repeat(80));
  console.log('');

  if (topics.length === 0) {
    console.log('�?没有 topics 数据');
    socket.disconnect();
    process.exit(1);
  }

  // 分类统计
  const privateTopics = topics.filter(t => t.isPrivate === true);
  const contentTopics = topics.filter(t => !t.isPrivate);

  console.log(`📊 Topics 分类统计:`);
  console.log(`   私信主题 (isPrivate=true): ${privateTopics.length}`);
  console.log(`   作品主题 (�?isPrivate):   ${contentTopics.length}`);
  console.log('');

  if (privateTopics.length === 0) {
    console.log('⚠️  关键问题: 没有找到私信主题 (isPrivate=true)');
    console.log('');
    console.log('原因分析:');
    console.log('  1. DataStore 中没�?conversations 数据');
    console.log('  2. Master 代码未正确设�?isPrivate 字段');
    console.log('  3. Worker 未爬取私信数�?);
    console.log('');
    console.log('建议:');
    console.log('  检�?packages/master/src/communication/im-websocket-server.js:457');
    console.log('  确认 topic 对象包含: isPrivate: true');
    console.log('');
  } else {
    console.log('�?找到私信主题');
    console.log('');

    // 打印第一个私信主�?    const firstPrivate = privateTopics[0];
    privateTopicId = firstPrivate.id;

    console.log('📋 第一个私信主�?');
    console.log(JSON.stringify(firstPrivate, null, 2));
    console.log('');

    // 检查字�?    console.log('字段检�?');
    console.log(`  �?id:              ${firstPrivate.id}`);
    console.log(`  �?title:           ${firstPrivate.title}`);
    console.log(`  �?isPrivate:       ${firstPrivate.isPrivate}`);
    console.log(`  �?messageCount:    ${firstPrivate.messageCount}`);
    console.log('');

    // 请求该主题的消息
    console.log('📤 请求私信消息...');
    socket.emit('monitor:request_messages', { topicId: privateTopicId });
  }
});

socket.on('monitor:messages', (data) => {
  const { topicId, messages } = data;
  console.log('');
  console.log('='.repeat(80));
  console.log(`📡 收到 messages: ${messages.length} �?(topicId: ${topicId.substring(0, 20)}...)`);
  console.log('='.repeat(80));
  console.log('');

  if (messages.length === 0) {
    console.log('�?没有消息数据');
    socket.disconnect();
    process.exit(1);
  }

  // 分类统计
  const privateMessages = messages.filter(m => m.messageCategory === 'private');
  const commentMessages = messages.filter(m => m.messageCategory === 'comment');
  const unknownMessages = messages.filter(m => !m.messageCategory);

  console.log(`📊 Messages 分类统计:`);
  console.log(`   messageCategory='private':  ${privateMessages.length}`);
  console.log(`   messageCategory='comment':  ${commentMessages.length}`);
  console.log(`   �?messageCategory 字段:     ${unknownMessages.length}`);
  console.log('');

  if (privateMessages.length === 0 && topicId === privateTopicId) {
    console.log('⚠️  关键问题: 私信主题的消息没�?messageCategory="private"');
    console.log('');
    console.log('原因分析:');
    console.log('  Master 代码未正确设�?messageCategory 字段');
    console.log('');
    console.log('建议:');
    console.log('  检�?packages/master/src/communication/im-websocket-server.js:590');
    console.log('  确认 message 对象包含: messageCategory: "private"');
    console.log('');
  } else {
    console.log('�?找到私信消息');
    console.log('');

    // 打印第一条私信消�?    const firstMessage = privateMessages[0] || messages[0];
    console.log('📋 第一条消�?');
    console.log(JSON.stringify(firstMessage, null, 2));
    console.log('');

    // 检查字�?    console.log('字段检�?');
    console.log(`  �?id:                  ${firstMessage.id}`);
    console.log(`  �?content:             ${firstMessage.content.substring(0, 30)}...`);
    console.log(`  ${firstMessage.messageCategory === 'private' ? '�? : '�?} messageCategory:     ${firstMessage.messageCategory}`);
    console.log(`  �?fromName:            ${firstMessage.fromName}`);
    console.log(`  �?timestamp:           ${new Date(firstMessage.timestamp).toLocaleString('zh-CN')}`);
    console.log('');
  }

  // 最终结�?  console.log('='.repeat(80));
  console.log('🎯 诊断结论:');
  console.log('='.repeat(80));
  console.log('');

  const hasPrivateTopics = privateTopicId !== null;
  const hasPrivateMessages = privateMessages.length > 0;

  if (hasPrivateTopics && hasPrivateMessages) {
    console.log('�?Master 数据结构正确');
    console.log('   - Topics 包含 isPrivate=true');
    console.log('   - Messages 包含 messageCategory="private"');
    console.log('');
    console.log('💡 问题可能在客户端:');
    console.log('   1. WebSocket 事件未正确监�?);
    console.log('   2. Redux store 未更�?);
    console.log('   3. 过滤逻辑有问�?);
    console.log('   4. 消息与主题关联错�?);
    console.log('');
    console.log('下一�?');
    console.log('   1. 启动 IM PC 客户�? cd packages/crm-pc-im && npm run dev');
    console.log('   2. 打开浏览�?http://localhost:5173');
    console.log('   3. �?F12 打开开发者工�?);
    console.log('   4. 查看 Console 日志，确认是否收�?WebSocket 事件');
  } else if (!hasPrivateTopics) {
    console.log('�?Master 数据结构问题: Topics 缺少 isPrivate 字段');
    console.log('');
    console.log('修复步骤:');
    console.log('   1. 编辑 packages/master/src/communication/im-websocket-server.js');
    console.log('   2. 找到�?447 行附近的会话主题创建代码');
    console.log('   3. 确认包含: isPrivate: true');
    console.log('   4. 重启 Master');
  } else if (!hasPrivateMessages) {
    console.log('�?Master 数据结构问题: Messages 缺少 messageCategory 字段');
    console.log('');
    console.log('修复步骤:');
    console.log('   1. 编辑 packages/master/src/communication/im-websocket-server.js');
    console.log('   2. 找到�?582 行附近的私信消息创建代码');
    console.log('   3. 确认包含: messageCategory: "private"');
    console.log('   4. 重启 Master');
  }

  console.log('');
  socket.disconnect();
  process.exit(0);
});

socket.on('error', (error) => {
  console.error('');
  console.error('�?WebSocket 错误:', error.message);
  socket.disconnect();
  process.exit(1);
});

socket.on('connect_error', (error) => {
  console.error('');
  console.error('�?连接失败:', error.message);
  console.error('');
  console.error('请确�?');
  console.error('  1. Master 正在运行: cd packages/master && npm start');
  console.error('  2. 端口 3000 未被占用: netstat -ano | findstr :3000');
  process.exit(1);
});

// 10 秒超�?setTimeout(() => {
  console.error('');
  console.error('�?超时: 10秒内未完成验�?);
  socket.disconnect();
  process.exit(1);
}, 10000);
