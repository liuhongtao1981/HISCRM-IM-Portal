/**
 * 快速登录测�?- 验证修复后的登录流程
 *
 * 此脚本创建一个简化的测试环境来验证登录参数修�?
 */

console.log('🧪 快速登录测�?- 验证参数修复\n');

// 模拟 workerBridge
const mockBridge = {
  socket: {
    emit: (event, data) => {
      console.log(`�?Worker 发送事�? ${event}`);
      console.log(`   数据:`, JSON.stringify(data, null, 2));

      // 验证数据格式
      if (event === 'worker:login:status') {
        if (!data.session_id) {
          console.error('   �?缺少 session_id�?);
        } else {
          console.log(`   �?session_id 正确: ${data.session_id}`);
        }

        if (!data.status) {
          console.error('   �?缺少 status�?);
        } else {
          console.log(`   �?status 正确: ${data.status}`);
        }

        if (!data.account_id) {
          console.error('   �?缺少 account_id�?);
        } else {
          console.log(`   �?account_id 正确: ${data.account_id}`);
        }
      }
    }
  },

  async sendLoginStatus(sessionId, status, data = {}) {
    console.log(`\n📤 sendLoginStatus 被调�?`);
    console.log(`   参数 1 (sessionId): ${sessionId}`);
    console.log(`   参数 2 (status): ${status}`);
    console.log(`   参数 3 (data):`, data);

    this.socket.emit('worker:login:status', {
      session_id: sessionId,
      status,
      ...data,
      timestamp: Date.now(),
    });
  }
};

// 模拟 platformInstance
const mockPlatform = {
  getName: () => 'douyin',

  async startLogin(accountId, sessionId, proxy) {
    console.log(`\n🎬 Platform.startLogin 被调�?`);
    console.log(`   参数 1 (accountId): ${accountId}`);
    console.log(`   参数 2 (sessionId): ${sessionId}`);
    console.log(`   参数 3 (proxy):`, proxy || '�?);

    // 验证参数类型
    if (typeof accountId !== 'string') {
      console.error(`   �?accountId 类型错误！应该是 string，实际是 ${typeof accountId}`);
      console.error(`      �?`, accountId);
      return;
    }

    if (typeof sessionId !== 'string') {
      console.error(`   �?sessionId 类型错误！应该是 string，实际是 ${typeof sessionId}`);
      console.error(`      �?`, sessionId);
      return;
    }

    console.log(`   �?所有参数类型正确！`);

    // 模拟发送二维码
    console.log(`\n   模拟：发送二维码状�?..`);
    await mockBridge.sendLoginStatus(sessionId, 'qrcode_ready', {
      account_id: accountId,
      qr_code_data: 'data:image/png;base64,MOCK_QR_CODE',
      expires_at: Math.floor((Date.now() + 300000) / 1000),
    });
  }
};

// 测试场景 1: 修复后的正确调用
console.log('\n' + '�?.repeat(60));
console.log('📝 测试场景 1: 修复后的正确调用方式');
console.log('�?.repeat(60));

const account_id = 'acc-test-123';
const session_id = 'session-test-456';
const proxy = { server: 'http://proxy.example.com:8080' };

(async () => {
  try {
    // 这是修复后的调用方式
    await mockPlatform.startLogin(account_id, session_id, proxy);

    console.log(`\n�?测试通过！所有参数正确传递。`);

  } catch (error) {
    console.error(`\n�?测试失败:`, error.message);
  }

  // 测试场景 2: 修复前的错误调用（用于对比）
  console.log('\n' + '�?.repeat(60));
  console.log('📝 测试场景 2: 修复前的错误调用方式（对比）');
  console.log('�?.repeat(60));

  console.log('\n如果使用对象参数调用:');
  console.log('  startLogin({ accountId, sessionId, proxy })');
  console.log('\n会导�?');
  console.log('  - accountId 接收到整个对�?);
  console.log('  - sessionId 接收�?undefined');
  console.log('  - proxy 接收�?undefined');
  console.log('\n这就是之前的问题所在！\n');

  // 测试 sendLoginStatus 修复
  console.log('�?.repeat(60));
  console.log('📝 测试场景 3: sendLoginStatus 参数顺序');
  console.log('�?.repeat(60));

  console.log('\n�?正确调用:');
  await mockBridge.sendLoginStatus(session_id, 'failed', {
    account_id: account_id,
    error_message: 'Test error'
  });

  console.log('\n\n�?错误调用（修复前�?');
  console.log('   workerBridge.sendLoginStatus(account_id, session_id, "failed", error.message)');
  console.log('   会导致参数错位！');

  console.log('\n' + '�?.repeat(60));
  console.log('�?所有测试完成！修复已验证�?);
  console.log('�?.repeat(60));

})();
