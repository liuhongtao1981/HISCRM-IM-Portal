/**
 * 触发登录测试 - �?Master 发送登录请�?
 */

const io = require('socket.io-client');

console.log('🧪 登录触发测试\n');

// 连接�?Master �?/admin 命名空间
const socket = io('http://localhost:3000/admin', {
  auth: {
    token: 'admin',
    user_type: 'admin'
  },
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('�?已连接到 Master /admin 命名空间');
  console.log(`   Socket ID: ${socket.id}\n`);

  // 等待 1 秒后发送登录请�?
  setTimeout(() => {
    const loginData = {
      account_id: 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4',
      worker_id: 'worker1',
      session_id: `session-${Date.now()}-test`
    };

    console.log('📤 发送登录请�?');
    console.log('   account_id:', loginData.account_id);
    console.log('   worker_id:', loginData.worker_id);
    console.log('   session_id:', loginData.session_id);
    console.log('');

    socket.emit('master:login:start', loginData);
  }, 1000);
});

socket.on('connect_error', (error) => {
  console.error('�?连接错误:', error.message);
  process.exit(1);
});

// 监听登录状态更�?
socket.on('login:status:update', (data) => {
  console.log('�?收到登录状态更�?');
  console.log('   session_id:', data.session_id);
  console.log('   status:', data.status);
  console.log('   account_id:', data.account_id);

  if (data.error_message) {
    console.log('   �?错误:', data.error_message);
  }

  if (data.qr_code_data) {
    console.log('   �?二维码数据长�?', data.qr_code_data.length);
  }

  console.log('\n完整数据:', JSON.stringify(data, null, 2));

  // 如果是失败或成功,退�?
  if (data.status === 'failed' || data.status === 'success') {
    setTimeout(() => {
      socket.disconnect();
      process.exit(data.status === 'success' ? 0 : 1);
    }, 1000);
  }
});

socket.on('disconnect', () => {
  console.log('\n⚠️  �?Master 断开连接');
});

// 30 秒超�?
setTimeout(() => {
  console.log('\n�?测试超时 (30�?');
  socket.disconnect();
  process.exit(1);
}, 30000);
