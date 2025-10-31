/**
 * 手动触发爬虫任务并验证数据同步
 */

const io = require('socket.io-client');

async function triggerCrawlAndVerifySync() {
  console.log('========================================');
  console.log('手动触发爬虫任务并验证数据同步');
  console.log('========================================\n');

  const socket = io('http://localhost:3000/worker', {
    reconnection: false
  });

  socket.on('connect', () => {
    console.log('✓ 已连接到 Master\n');

    // 1. 注册 Worker
    console.log('1. 注册 Worker...');
    socket.emit('worker:register', {
      workerId: 'test-trigger-worker',
      host: '127.0.0.1',
      port: 9999,
      version: '1.0.0',
      capabilities: ['douyin']
    });
  });

  socket.on('worker:register_ack', (data) => {
    console.log('   ✓ Worker 注册成功');
    console.log(`   分配账户数: ${data.accounts?.length || 0}\n`);

    if (data.accounts && data.accounts.length > 0) {
      const account = data.accounts[0];
      console.log(`2. 手动触发爬虫任务 (账户: ${account.id})...`);

      // 发送手动爬取请求
      socket.emit('worker:manual_crawl', {
        accountId: account.id,
        taskType: 'all'  // 爬取所有类型数据
      });

      console.log('   ✓ 已发送手动爬取请求');
      console.log('   等待爬虫执行和数据同步...\n');

      // 监听数据同步消息
      socket.on('worker:data_sync_ack', (ack) => {
        console.log('   ✓ 收到数据同步确认:', ack);
      });

      // 30秒后检查 Master DataStore
      setTimeout(async () => {
        console.log('\n3. 检查 Master DataStore...');

        const checkSocket = io('http://localhost:3000/admin', {
          reconnection: false
        });

        checkSocket.on('connect', () => {
          console.log('   ✓ 连接到 Admin 端口');

          // 请求 DataStore 统计
          checkSocket.emit('admin:get_datastore_stats');
        });

        checkSocket.on('admin:datastore_stats', (stats) => {
          console.log('   ✓ 收到 DataStore 统计:');
          console.log('   ', JSON.stringify(stats, null, 2));

          checkSocket.disconnect();
          socket.disconnect();

          console.log('\n========================================');
          console.log('测试完成');
          console.log('========================================');
          process.exit(0);
        });

        setTimeout(() => {
          console.log('   ⚠ 超时，未收到 DataStore 统计');
          checkSocket.disconnect();
          socket.disconnect();
          process.exit(1);
        }, 10000);
      }, 30000);
    } else {
      console.log('   ⚠ 没有分配到账户');
      socket.disconnect();
      process.exit(1);
    }
  });

  socket.on('connect_error', (error) => {
    console.error('❌ 连接错误:', error.message);
    process.exit(1);
  });

  socket.on('disconnect', () => {
    console.log('已断开连接');
  });
}

// 运行测试
triggerCrawlAndVerifySync().catch((error) => {
  console.error('测试失败:', error);
  process.exit(1);
});
