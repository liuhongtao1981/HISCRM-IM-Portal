/**
 * 手动触发爬虫测试脚本
 *
 * 功能:
 * 1. 通过 Socket.IO 连接�?Master
 * 2. 发送消息给指定 Worker,触发爬虫执行
 * 3. 监听爬取结果
 *
 * 用法:
 * node tests/手动触发爬虫测试.js [workerId] [accountId]
 */

const io = require('socket.io-client');
const path = require('path');

// 配置
const MASTER_URL = 'http://localhost:3000';
const WORKER_ID = process.argv[2] || 'worker1';
const ACCOUNT_ID = process.argv[3] || 'acc-40dab768-fee1-4718-b64b-eb3a7c23beac';

console.log('🚀 手动触发爬虫测试');
console.log('�?.repeat(60));
console.log(`Master URL: ${MASTER_URL}`);
console.log(`Worker ID: ${WORKER_ID}`);
console.log(`Account ID: ${ACCOUNT_ID}`);
console.log('�?.repeat(60));
console.log('');

// 连接�?Master �?/admin 命名空间 (测试�?
const socket = io(`${MASTER_URL}/admin`, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

// 连接成功
socket.on('connect', () => {
  console.log(`�?已连接到 Master (socket ID: ${socket.id})\n`);

  // 发送爬取指�?
  triggerCrawl();
});

// 连接错误
socket.on('connect_error', (error) => {
  console.error('�?连接失败:', error.message);
  process.exit(1);
});

// 断开连接
socket.on('disconnect', (reason) => {
  console.log(`\n⚠️  已断开连接: ${reason}`);
});

/**
 * 触发爬虫任务
 */
function triggerCrawl() {
  console.log('📋 发送爬取指�?..\n');

  // 方法1: 通过 Master 的房间系统发送消息给特定 Worker
  // Master 会将消息路由�?worker:${WORKER_ID} 房间

  // 发送评�?讨论爬取指令
  console.log('1️⃣  触发评论和讨论爬�?..');
  socket.emit('admin:trigger_crawl', {
    worker_id: WORKER_ID,
    account_id: ACCOUNT_ID,
    crawl_type: 'comments', // comments, direct_messages, contents
    options: {
      includeDiscussions: true, // 同时爬取讨论
    },
  });

  // 等待3秒后触发私信爬取
  setTimeout(() => {
    console.log('2️⃣  触发私信和会话爬�?..');
    socket.emit('admin:trigger_crawl', {
      worker_id: WORKER_ID,
      account_id: ACCOUNT_ID,
      crawl_type: 'direct_messages',
      options: {},
    });
  }, 3000);

  // 等待6秒后触发作品爬取
  setTimeout(() => {
    console.log('3️⃣  触发作品爬取...');
    socket.emit('admin:trigger_crawl', {
      worker_id: WORKER_ID,
      account_id: ACCOUNT_ID,
      crawl_type: 'contents',
      options: {},
    });
  }, 6000);

  console.log('\n�?已发送所有爬取指�?);
  console.log('�?等待爬取完成...\n');
  console.log('提示: 你可以查�?Master �?Worker 的日志输�?);
  console.log('');

  // 监听爬取结果通知
  listenForResults();
}

/**
 * 监听爬取结果
 */
function listenForResults() {
  // 监听评论数据
  socket.on('worker:bulk_insert_comments', (data) => {
    console.log(`📊 收到评论数据: ${data.comments?.length || 0} 条评论`);
  });

  // 监听讨论数据
  socket.on('worker:bulk_insert_discussions', (data) => {
    console.log(`📊 收到讨论数据: ${data.discussions?.length || 0} 条讨论`);
  });

  // 监听私信数据
  socket.on('worker:bulk_insert_direct_messages', (data) => {
    console.log(`📊 收到私信数据: ${data.direct_messages?.length || 0} 条私信`);
  });

  // 监听会话数据
  socket.on('worker:bulk_insert_conversations', (data) => {
    console.log(`📊 收到会话数据: ${data.conversations?.length || 0} 个会话`);
  });

  // 监听作品数据
  socket.on('worker:bulk_insert_works', (data) => {
    console.log(`📊 收到作品数据: ${data.contents?.length || 0} 个作品`);
  });

  // 监听通知 (Master 广播�?
  socket.on('master:notification:push', (notification) => {
    console.log(`🔔 收到通知: ${notification.message || notification.title}`);
  });

  // 30秒后自动退�?
  setTimeout(() => {
    console.log('\n⏱️  30秒超时，测试结束');
    console.log('💡 如果没有看到数据，请检�?');
    console.log('   1. 账户是否已登�?(login_status = "logged_in")');
    console.log('   2. Worker 是否正常运行');
    console.log('   3. Master �?Worker 的日志输�?);
    socket.disconnect();
    process.exit(0);
  }, 30000);
}
