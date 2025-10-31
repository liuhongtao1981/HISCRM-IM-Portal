/**
 * 手动从数据库加载数据到 DataStore
 * 用于测试 DataStore 功能
 */

const http = require('http');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

console.log('==================================================');
console.log('手动加载数据到 DataStore');
console.log('==================================================\n');

// 模拟从数据库读取的数据
const testData = {
  conversations: [
    {
      id: 'conv_test_1',
      accountId: accountId,
      platform: 'douyin',
      conversationId: 'test_conv_1',
      type: 'private',
      userId: 'user_001',
      userName: '测试用户1',
      userAvatar: 'https://example.com/avatar1.jpg',
      unreadCount: 5,
      lastMessageContent: '你好，这是一条测试私信',
      lastMessageTime: Date.now() - 3600000,
      status: 'new',
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 3600000,
    },
    {
      id: 'conv_test_2',
      accountId: accountId,
      platform: 'douyin',
      conversationId: 'test_conv_2',
      type: 'private',
      userId: 'user_002',
      userName: '测试用户2',
      userAvatar: 'https://example.com/avatar2.jpg',
      unreadCount: 3,
      lastMessageContent: '您的视频很棒！',
      lastMessageTime: Date.now() - 7200000,
      status: 'new',
      createdAt: Date.now() - 172800000,
      updatedAt: Date.now() - 7200000,
    },
  ],
  messages: [
    {
      id: 'msg_test_1',
      accountId: accountId,
      platform: 'douyin',
      conversationId: 'test_conv_1',
      messageId: 'msg_001',
      type: 'text',
      content: '你好，这是一条测试私信',
      senderId: 'user_001',
      receiverId: accountId,
      createdAt: Date.now() - 3600000,
      status: 'new',
    },
    {
      id: 'msg_test_2',
      accountId: accountId,
      platform: 'douyin',
      conversationId: 'test_conv_2',
      messageId: 'msg_002',
      type: 'text',
      content: '您的视频很棒！',
      senderId: 'user_002',
      receiverId: accountId,
      createdAt: Date.now() - 7200000,
      status: 'new',
    },
  ],
  comments: [
    {
      id: 'comment_test_1',
      accountId: accountId,
      platform: 'douyin',
      commentId: 'cmt_001',
      contentId: 'content_001',
      userId: 'user_003',
      userName: '粉丝A',
      text: '太赞了！支持！',
      createdAt: Date.now() - 1800000,
      status: 'new',
    },
    {
      id: 'comment_test_2',
      accountId: accountId,
      platform: 'douyin',
      commentId: 'cmt_002',
      contentId: 'content_001',
      userId: 'user_004',
      userName: '粉丝B',
      text: '讲得非常好',
      createdAt: Date.now() - 3600000,
      status: 'new',
    },
  ],
  contents: [
    {
      id: 'content_test_1',
      accountId: accountId,
      platform: 'douyin',
      contentId: 'content_001',
      title: '测试视频作品',
      type: 'video',
      coverUrl: 'https://example.com/cover1.jpg',
      createdAt: Date.now() - 86400000,
      stats: {
        views: 1250,
        likes: 89,
        comments: 12,
        shares: 5,
      },
    },
  ],
  notifications: [],
};

// 发送数据到 Master
async function loadDataToMaster() {
  const message = {
    type: 'worker:data:sync',
    payload: {
      accountId: accountId,
      platform: 'douyin',
      snapshot: {
        platform: 'douyin',
        data: testData,
      },
      timestamp: Date.now(),
    },
  };

  const postData = JSON.stringify(message);

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/test/data-sync',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
    timeout: 5000,
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 404) {
          console.log('⚠️ 测试接口不存在');
          console.log('   说明: Master 没有提供测试接口');
          console.log('   建议: 需要在 Master 中添加测试接口来手动推送数据\n');
          resolve({ statusCode: 404, error: 'Not Found' });
        } else {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

// 测试 IM API
async function testIMApis() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试 IM API（使用测试数据）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const apis = [
    { name: '会话列表', url: `http://localhost:3000/api/im/conversations?account_id=${accountId}&count=10` },
    { name: '私信列表', url: `http://localhost:3000/api/im/messages?account_id=${accountId}&count=10` },
    { name: '评论列表', url: `http://localhost:3000/api/im/discussions?account_id=${accountId}&count=10` },
    { name: '作品列表', url: `http://localhost:3000/api/im/contents?account_id=${accountId}&count=10` },
  ];

  for (const api of apis) {
    try {
      const response = await fetch(api.url);
      const data = await response.json();

      if (response.ok && data.status_code === 0) {
        const dataKey = Object.keys(data.data).find(k => Array.isArray(data.data[k]));
        const count = dataKey ? data.data[dataKey].length : 0;
        console.log(`✅ ${api.name}: ${count} 条数据`);
      } else {
        console.log(`❌ ${api.name}: HTTP ${response.status}`);
      }
    } catch (err) {
      console.log(`❌ ${api.name}: ${err.message}`);
    }
  }
}

// 主流程
async function main() {
  console.log('步骤 1: 尝试加载测试数据到 Master DataStore...\n');

  try {
    const result = await loadDataToMaster();
    if (result.statusCode === 200) {
      console.log('✅ 测试数据已加载到 DataStore\n');
    }
  } catch (err) {
    console.log(`⚠️ 无法加载测试数据: ${err.message}\n`);
  }

  console.log('步骤 2: 测试 IM API 接口...\n');
  await testIMApis();

  console.log('\n==================================================');
  console.log('💡 诊断结果');
  console.log('==================================================\n');

  console.log('问题诊断:');
  console.log('  1. 数据库中有数据（2条评论，40条私信，29个会话）');
  console.log('  2. 但 DataStore 为空（Worker 没有推送数据）');
  console.log('  3. Worker 状态显示 offline 和 not_logged_in\n');

  console.log('根本原因:');
  console.log('  Worker 账户状态检测有问题，导致：');
  console.log('  - Worker 认为账户未登录');
  console.log('  - 没有初始化 DouyinDataManager');
  console.log('  - 没有启动数据同步定时器');
  console.log('  - 数据库有数据，但 DataStore 是空的\n');

  console.log('解决方案:');
  console.log('  方案 1: 修复 Worker 账户状态检测逻辑');
  console.log('  方案 2: 在 Master 启动时从数据库加载数据到 DataStore');
  console.log('  方案 3: 添加手动触发数据同步的接口\n');

  console.log('==================================================\n');
}

main().catch(console.error);
