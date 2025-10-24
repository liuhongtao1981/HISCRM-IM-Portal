/**
 * 测试登录请求脚本
 *
 * 功能: 直接通过 Socket.IO 向 Master 发送登录请求
 */

const io = require('socket.io-client');

// 配置
const MASTER_URL = 'http://localhost:3000';
const ACCOUNT_ID = process.argv[2] || 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';
const WORKER_ID = process.argv[3] || 'worker1';

console.log('🧪 测试登录请求');
console.log('═'.repeat(60));
console.log(`Master URL: ${MASTER_URL}`);
console.log(`Account ID: ${ACCOUNT_ID}`);
console.log(`Worker ID: ${WORKER_ID}`);
console.log('═'.repeat(60));
console.log('');

// 连接到 Master 的 /admin 命名空间
const socket = io(`${MASTER_URL}/admin`, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

// 连接成功
socket.on('connect', () => {
  console.log(`✅ 已连接到 Master (socket ID: ${socket.id})\n`);

  // 生成会话ID
  const sessionId = `session-test-${Date.now()}`;

  console.log(`📋 发送登录请求...`);
  console.log(`   Account: ${ACCOUNT_ID}`);
  console.log(`   Worker: ${WORKER_ID}`);
  console.log(`   Session: ${sessionId}`);
  console.log('');

  // 发送登录请求
  socket.emit('master:login:start', {
    account_id: ACCOUNT_ID,
    worker_id: WORKER_ID,
    session_id: sessionId,
  });

  console.log('✅ 登录请求已发送');
  console.log('⏳ 等待 Worker 响应...\n');
});

// 监听登录状态更新（正确的事件名）
socket.on('login:status:update', (data) => {
  console.log(`📊 收到登录状态: ${JSON.stringify(data, null, 2)}\n`);

  if (data.status === 'qrcode_ready') {
    console.log('✅ 二维码已准备好！');
    console.log(`   二维码Base64长度: ${data.qrcode.length} 字符\n`);
  } else if (data.status === 'logged_in' || data.status === 'success') {
    console.log('✅ 登录成功！');
    socket.disconnect();
    process.exit(0);
  } else if (data.status === 'failed') {
    console.log(`❌ 登录失败: ${data.message}`);
    socket.disconnect();
    process.exit(1);
  }
});

// 监听二维码扫描事件
socket.on('master:login:qrcode_scanned', (data) => {
  console.log(`📱 二维码已扫描: ${JSON.stringify(data, null, 2)}\n`);
});

// 连接错误
socket.on('connect_error', (error) => {
  console.error('❌ 连接失败:', error.message);
  process.exit(1);
});

// 断开连接
socket.on('disconnect', (reason) => {
  console.log(`\n⚠️  已断开连接: ${reason}`);
});

// 30秒超时
setTimeout(() => {
  console.log('\n⏱️  30秒超时，测试结束');
  console.log('💡 如果没有看到响应，请检查:');
  console.log('   1. Master 是否正在运行');
  console.log('   2. Worker 是否已连接');
  console.log('   3. Worker 日志是否有错误');
  socket.disconnect();
  process.exit(0);
}, 30000);
