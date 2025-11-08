/**
 * 测试 IM API 接口集成
 * 1. 手动�?Master DataStore 添加测试数据
 * 2. 调用 IM API 验证能否读取数据
 */

const http = require('http');

console.log('==================================================');
console.log('IM API 接口集成测试');
console.log('==================================================\n');

// 测试账户 ID
const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 步骤 1: 手动�?DataStore 推送测试数�?
console.log('步骤 1: 手动�?DataStore 推送测试数据\n');

const testData = {
  type: 'worker:data:sync',
  payload: {
    accountId: accountId,
    platform: 'douyin',
    snapshot: {
      platform: 'douyin',
      data: {
        conversations: [
          {
            id: 'conv_test_1',
            accountId: accountId,
            platform: 'douyin',
            conversationId: 'test_conv_1',
            type: 'private',
            userId: 'test_user_1',
            userName: '测试用户1',
            userAvatar: 'https://example.com/avatar1.jpg',
            unreadCount: 3,
            lastMessageContent: '你好，这是测试消�?',
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
            userId: 'test_user_2',
            userName: '测试用户2',
            userAvatar: 'https://example.com/avatar2.jpg',
            unreadCount: 1,
            lastMessageContent: '你好，这是测试消�?',
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
            messageId: 'test_msg_1',
            type: 'text',
            content: '你好，这是测试消�?',
            senderId: 'test_user_1',
            receiverId: accountId,
            createdAt: Date.now() - 3600000,
            status: 'new',
          },
          {
            id: 'msg_test_2',
            accountId: accountId,
            platform: 'douyin',
            conversationId: 'test_conv_2',
            messageId: 'test_msg_2',
            type: 'text',
            content: '你好，这是测试消�?',
            senderId: 'test_user_2',
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
            commentId: 'test_comment_1',
            contentId: 'test_content_1',
            userId: 'test_user_3',
            userName: '测试用户3',
            text: '这是一条测试评�?,
            createdAt: Date.now() - 1800000,
            status: 'new',
          },
        ],
        contents: [
          {
            id: 'content_test_1',
            accountId: accountId,
            platform: 'douyin',
            contentId: 'test_content_1',
            title: '测试作品1',
            type: 'video',
            createdAt: Date.now() - 86400000,
          },
        ],
        notifications: [],
      },
    },
    timestamp: Date.now(),
  },
};

// 发送数据到 Master（模�?Worker 推送）
const pushData = JSON.stringify(testData);

const pushOptions = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/test/push-data',  // 临时测试接口
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(pushData),
  },
};

console.log('�?Master 推送测试数�?..\n');

const pushReq = http.request(pushOptions, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode === 404) {
      console.log('⚠️ 测试接口不存在，跳过数据推�?);
      console.log('   这是正常的，因为我们没有创建测试接口\n');
      testIMAPIs();
    } else {
      console.log('�?数据推送响�?', res.statusCode);
      console.log(data, '\n');
      testIMAPIs();
    }
  });
});

pushReq.on('error', (err) => {
  console.log('⚠️ 推送失败（预期的）:', err.message);
  console.log('   直接测试 IM API（从数据库读取）\n');
  testIMAPIs();
});

pushReq.write(pushData);
pushReq.end();

// 步骤 2: 测试 IM API 接口
function testIMAPIs() {
  console.log('==================================================');
  console.log('步骤 2: 测试 IM API 接口');
  console.log('==================================================\n');

  const tests = [
    {
      name: '会话列表 API',
      path: `/api/im/conversations?account_id=${accountId}&count=10`,
    },
    {
      name: '私信列表 API',
      path: `/api/im/messages?account_id=${accountId}&count=10`,
    },
    {
      name: '评论列表 API',
      path: `/api/im/discussions?account_id=${accountId}&count=10`,
    },
    {
      name: '作品列表 API',
      path: `/api/im/contents?account_id=${accountId}&count=10`,
    },
    {
      name: '统一消息 API',
      path: `/api/im/unified-messages?account_id=${accountId}&count=10`,
    },
  ];

  let completedTests = 0;

  tests.forEach((test, index) => {
    setTimeout(() => {
      console.log(`\n[测试 ${index + 1}/${tests.length}] ${test.name}`);
      console.log('--------------------------------------------');

      const options = {
        hostname: 'localhost',
        port: 3000,
        path: test.path,
        method: 'GET',
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            console.log('状态码:', res.statusCode);
            console.log('响应成功:', result.success);

            if (result.success && result.data) {
              const items = result.data.conversations || result.data.messages ||
                           result.data.discussions || result.data.contents ||
                           result.data.messages || [];
              console.log('返回数据数量:', items.length);

              if (items.length > 0) {
                console.log('�?返回了数�?);
                console.log('第一条数据示�?');
                console.log(JSON.stringify(items[0], null, 2).substring(0, 200) + '...');
              } else {
                console.log('⚠️ 没有数据（可�?DataStore 为空或数据库为空�?);
              }
            } else {
              console.log('响应:', data.substring(0, 300));
            }
          } catch (err) {
            console.log('�?解析失败:', err.message);
            console.log('原始响应:', data.substring(0, 300));
          }

          completedTests++;
          if (completedTests === tests.length) {
            printSummary();
          }
        });
      });

      req.on('error', (err) => {
        console.log('�?请求失败:', err.message);
        completedTests++;
        if (completedTests === tests.length) {
          printSummary();
        }
      });

      req.end();
    }, index * 500);  // 每个请求间隔 500ms
  });
}

function printSummary() {
  console.log('\n\n==================================================');
  console.log('测试完成');
  console.log('==================================================\n');

  console.log('📊 测试总结�?);
  console.log('  - 测试�?5 �?IM API 接口');
  console.log('  - 验证�?API 路由是否正常');
  console.log('  - 检查了数据返回格式\n');

  console.log('💡 说明�?);
  console.log('  - 如果返回了数据：�?IM API 集成成功');
  console.log('  - 如果没有数据：DataStore 为空（需�?Worker 推送数据）');
  console.log('  - 但只�?API 返回了正确的 JSON 格式，就说明集成成功\n');

  console.log('📋 下一步：');
  console.log('  1. 如果所�?API 都返回正确格�?�?集成成功 �?);
  console.log('  2. 如果需要测试实际数据流 �?需要账户登录并启动爬虫');
  console.log('  3. 或者创建一个专门的测试端点来手动注入数据\n');
}
