/**
 * 调试 IM 客户端收到的 userInfo 数据
 * 验证 Master 是否正确推�?userInfo 字段
 */
const io = require('socket.io-client');

const MASTER_URL = 'http://localhost:3000';

console.log('=== 连接�?Master IM WebSocket (根命名空�? ===\n');

const socket = io(MASTER_URL, {
  transports: ['websocket'],
  reconnection: false
});

socket.on('connect', () => {
  console.log('�?已连接到 Master\n');

  // 监听所有事件用于调�?  socket.onAny((eventName, ...args) => {
    console.log(`📨 收到事件: ${eventName}`, JSON.stringify(args).substring(0, 100));
  });

  // 注册为监控客户端
  console.log('📤 发�?monitor:register 事件...');
  socket.emit('monitor:register', {
    clientId: 'debug-client',
    clientType: 'monitor'
  });

  // 等待2秒后请求频道列表
  setTimeout(() => {
    console.log('📤 发�?monitor:request_channels 事件...');
    socket.emit('monitor:request_channels');
  }, 2000);
});

socket.on('monitor:registered', (data) => {
  console.log('�?监控注册成功');
  console.log(`频道数量: ${data.channelCount}\n`);
});

socket.on('monitor:channels', (data) => {
  console.log('=== 收到 monitor:channels 事件 ===\n');
  const channels = data.channels || [];
  console.log(`频道数量: ${channels.length}\n`);

  channels.forEach((channel, index) => {
    console.log(`频道 ${index + 1}:`);
    console.log(`  id: ${channel.id}`);
    console.log(`  name: ${channel.name}`);
    console.log(`  avatar: ${channel.avatar ? channel.avatar.substring(0, 60) + '...' : 'null'}`);
    console.log(`  platform: ${channel.platform || 'null'}`);
    console.log(`  userInfo 字段: ${channel.userInfo ? '存在' : '�?不存�?}`);

    if (channel.userInfo) {
      console.log(`  userInfo 类型: ${typeof channel.userInfo}`);
      console.log(`  userInfo 长度: ${channel.userInfo.length} 字符`);

      try {
        const userInfo = JSON.parse(channel.userInfo);
        console.log(`  �?userInfo 解析成功:`);
        console.log(`    - nickname: ${userInfo.nickname || 'null'}`);
        console.log(`    - douyin_id: ${userInfo.douyin_id || 'null'}`);
        console.log(`    - platformUserId: ${userInfo.platformUserId || 'null'}`);
        console.log(`    - avatar: ${userInfo.avatar ? userInfo.avatar.substring(0, 60) + '...' : 'null'}`);
        console.log(`    - uid: ${userInfo.uid || 'null'}`);
      } catch (e) {
        console.log(`  �?userInfo JSON 解析失败: ${e.message}`);
        console.log(`  原始�? ${channel.userInfo.substring(0, 100)}...`);
      }
    } else {
      console.log(`  ⚠️  缺少 userInfo 字段！`);
      console.log(`  当前显示: ${channel.name} (应显示平台昵�?`);
    }

    console.log(`  unreadCount: ${channel.unreadCount}`);
    console.log(`  lastMessage: ${channel.lastMessage ? channel.lastMessage.substring(0, 30) : 'null'}`);
    console.log('');
  });

  console.log('\n=== 总结 ===');
  const hasUserInfo = channels.filter(c => c.userInfo).length;
  const noUserInfo = channels.filter(c => !c.userInfo).length;
  console.log(`�?包含 userInfo: ${hasUserInfo} 个频道`);
  console.log(`�?缺少 userInfo: ${noUserInfo} 个频道`);

  socket.disconnect();
  process.exit(0);
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
  process.exit(1);
}, 10000);
