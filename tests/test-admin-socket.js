/**
 * 测试 Admin Socket.IO 连接
 */

const io = require('socket.io-client');

console.log('连接到 Master Admin 命名空间...');

const socket = io('http://localhost:3000/admin', {
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('✅ Socket.IO 连接成功');
  console.log('   Socket ID:', socket.id);

  // 请求 workers 列表
  console.log('\n请求 workers 列表...');
  socket.emit('admin:get_workers');
});

socket.on('admin:workers_list', (data) => {
  console.log('\n✅ 收到 workers 列表:');
  console.log(JSON.stringify(data, null, 2));

  setTimeout(() => {
    socket.disconnect();
    process.exit(0);
  }, 1000);
});

socket.on('connect_error', (error) => {
  console.error('❌ 连接错误:', error.message);
  process.exit(1);
});

socket.on('error', (error) => {
  console.error('❌ Socket 错误:', error);
});

setTimeout(() => {
  console.log('⏱️  超时，未收到响应');
  socket.disconnect();
  process.exit(1);
}, 5000);
