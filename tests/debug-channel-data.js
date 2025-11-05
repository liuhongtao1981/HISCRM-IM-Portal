/**
 * 调试工具：检查 Master 推送给客户端的 Channel 数据
 */
const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

console.log('=== 连接到 Master IM WebSocket 服务器 ===\n');

const socket = io(`${MASTER_URL}/client`, {
  transports: ['websocket'],
  reconnection: false
});

socket.on('connect', () => {
  console.log('✅ 已连接到 Master\n');

  // 请求频道列表
  socket.emit('client:sync', {});
});

socket.on('channels:update', (channels) => {
  console.log('=== 收到 channels:update 事件 ===\n');
  console.log(`频道数量: ${channels.length}\n`);

  channels.forEach((channel, index) => {
    console.log(`频道 ${index + 1}:`);
    console.log(`  id: ${channel.id}`);
    console.log(`  name: ${channel.name}`);
    console.log(`  avatar: ${channel.avatar ? channel.avatar.substring(0, 60) + '...' : 'null'}`);
    console.log(`  platform: ${channel.platform || 'null'}`);
    console.log(`  userInfo: ${channel.userInfo || 'null'}`);

    if (channel.userInfo) {
      try {
        const userInfo = JSON.parse(channel.userInfo);
        console.log(`  解析后的 userInfo:`);
        console.log(`    - nickname: ${userInfo.nickname || 'null'}`);
        console.log(`    - douyin_id: ${userInfo.douyin_id || 'null'}`);
        console.log(`    - platformUserId: ${userInfo.platformUserId || 'null'}`);
        console.log(`    - avatar: ${userInfo.avatar ? userInfo.avatar.substring(0, 60) + '...' : 'null'}`);
      } catch (e) {
        console.log(`  ❌ JSON 解析失败: ${e.message}`);
      }
    } else {
      console.log(`  ❌ userInfo 字段不存在或为空`);
    }
    console.log('');
  });

  socket.disconnect();
  process.exit(0);
});

socket.on('connect_error', (error) => {
  console.error('❌ 连接失败:', error.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('⏱️  超时，未收到数据');
  socket.disconnect();
  process.exit(1);
}, 10000);
