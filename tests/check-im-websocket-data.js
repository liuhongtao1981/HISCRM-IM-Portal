/**
 * 检�?IM 客户端收到的 WebSocket 数据
 */
const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

console.log('=== 连接�?Master IM WebSocket (/client) ===\n');

const socket = io(`${MASTER_URL}/client`, {
  transports: ['websocket'],
  reconnection: false
});

socket.on('connect', () => {
  console.log('�?已连接到 Master /client\n');
  console.log('发�?client:sync 请求...\n');

  // 请求同步数据
  socket.emit('client:sync', {});
});

// 监听所有事�?socket.onAny((eventName, ...args) => {
  console.log(`📨 收到事件: ${eventName}`);

  if (eventName === 'monitor:channels') {
    const data = args[0];
    const channels = data.channels || [];
    console.log(`\n=== monitor:channels 数据 ===`);
    console.log(`频道数量: ${channels.length}\n`);

    channels.forEach((channel, index) => {
      console.log(`频道 ${index + 1}:`);
      console.log(`  id: ${channel.id}`);
      console.log(`  name: ${channel.name}`);
      console.log(`  avatar: ${channel.avatar?.substring(0, 50) || 'null'}`);
      console.log(`  platform: ${channel.platform || 'null'}`);
      console.log(`  userInfo 类型: ${typeof channel.userInfo}`);
      console.log(`  userInfo �? ${channel.userInfo || 'null'}`);

      if (channel.userInfo) {
        console.log(`  userInfo 长度: ${channel.userInfo.length}`);
        try {
          const parsed = JSON.parse(channel.userInfo);
          console.log(`  �?解析成功:`);
          console.log(`     - nickname: ${parsed.nickname || 'null'}`);
          console.log(`     - douyin_id: ${parsed.douyin_id || 'null'}`);
          console.log(`     - avatar: ${parsed.avatar?.substring(0, 50) || 'null'}`);
        } catch (e) {
          console.log(`  �?JSON 解析失败: ${e.message}`);
        }
      }
      console.log('');
    });
  } else {
    console.log(`  数据:`, JSON.stringify(args, null, 2));
  }
});

socket.on('connect_error', (error) => {
  console.error('�?连接失败:', error.message);
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('🔌 连接已断开');
});

setTimeout(() => {
  console.log('\n⏱️  10秒超时，关闭连接');
  socket.disconnect();
  process.exit(0);
}, 10000);
