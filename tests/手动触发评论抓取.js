/**
 * 手动触发评论抓取任务
 * 通过 Master 的 Socket.IO API 发送任务
 */

const io = require('socket.io-client');
const Database = require('better-sqlite3');
const path = require('path');

async function triggerCommentCrawl() {
  console.log('🚀 连接到 Master 服务器...\n');

  // 1. 连接数据库获取账户信息
  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  if (!account) {
    console.log('❌ 未找到抖音账户');
    db.close();
    process.exit(1);
  }

  console.log(`✅ 账户信息:`);
  console.log(`   ID: ${account.id}`);
  console.log(`   平台: ${account.platform}`);
  console.log(`   用户名: ${account.platform_username || '未设置'}`);
  console.log(`   平台用户ID: ${account.platform_user_id || '未设置'}`);
  console.log(`   Worker: ${account.worker_id || '未分配'}\n`);

  // 2. 连接到 Master 的 Admin 命名空间
  const socket = io('http://localhost:3000/admin');

  socket.on('connect', () => {
    console.log('✅ 已连接到 Master 服务器\n');

    // 3. 发送抓取评论任务
    console.log('📤 发送评论抓取任务...\n');

    const taskMessage = {
      type: 'ADMIN_TRIGGER_CRAWL',
      timestamp: Date.now(),
      payload: {
        accountId: account.id,
        crawlType: 'comments',  // 'comments', 'direct_messages', 'works'
        options: {
          maxVideos: 1,           // 只抓取1个视频
          includeDiscussions: true,  // 包含讨论(回复)
        }
      }
    };

    socket.emit('admin:trigger-crawl', taskMessage);
    console.log('✅ 任务已发送\n');
    console.log('任务详情:');
    console.log(JSON.stringify(taskMessage, null, 2));
    console.log('\n⏳ 等待抓取完成...');
  });

  socket.on('crawl:started', (data) => {
    console.log('\n🎬 抓取已开始');
    console.log(JSON.stringify(data, null, 2));
  });

  socket.on('crawl:progress', (data) => {
    console.log('\n📊 抓取进度更新');
    console.log(JSON.stringify(data, null, 2));
  });

  socket.on('crawl:completed', (data) => {
    console.log('\n✅ 抓取完成');
    console.log(JSON.stringify(data, null, 2));

    // 4. 查询数据库验证结果
    setTimeout(() => {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 数据库验证');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      const commentsCount = db.prepare('SELECT COUNT(*) as count FROM comments').get().count;
      const discussionsCount = db.prepare('SELECT COUNT(*) as count FROM discussions').get().count;
      const worksCount = db.prepare('SELECT COUNT(*) as count FROM douyin_videos').get().count;

      console.log(`评论数量: ${commentsCount}`);
      console.log(`讨论数量: ${discussionsCount}`);
      console.log(`作品数量: ${worksCount}\n`);

      if (discussionsCount > 0) {
        console.log('✅ 讨论数据抓取成功!\n');
        console.log('前5条讨论:');
        const discussions = db.prepare('SELECT * FROM discussions ORDER BY create_time DESC LIMIT 5').all();
        discussions.forEach((d, i) => {
          const createTime = new Date(d.create_time * 1000);
          console.log(`  ${i + 1}. ${d.author_name}: ${d.content}`);
          console.log(`     父评论ID: ${d.parent_comment_id.substring(0, 40)}...`);
          console.log(`     ⏰ ${createTime.toLocaleString('zh-CN')}\n`);
        });
      } else {
        console.log('⚠️  讨论数量为0\n');

        // 检查评论中有回复的数量
        const commentsWithReplies = db.prepare('SELECT * FROM comments WHERE reply_count > 0').all();
        console.log(`评论中有回复的数量: ${commentsWithReplies.length}`);
        if (commentsWithReplies.length > 0) {
          console.log('前3条有回复的评论:');
          commentsWithReplies.slice(0, 3).forEach((c, i) => {
            console.log(`  ${i + 1}. ${c.author_name}: ${c.content.substring(0, 30)}...`);
            console.log(`     reply_count: ${c.reply_count}`);
          });
          console.log('\n⚠️  有评论显示有回复,但未抓取到讨论数据!');
        }
      }

      db.close();
      socket.close();
      process.exit(0);
    }, 5000);
  });

  socket.on('crawl:error', (data) => {
    console.log('\n❌ 抓取失败');
    console.log(JSON.stringify(data, null, 2));

    db.close();
    socket.close();
    process.exit(1);
  });

  socket.on('disconnect', () => {
    console.log('\n⚠️  与 Master 服务器断开连接');
  });

  socket.on('error', (error) => {
    console.error('\n❌ Socket 错误:', error);
    db.close();
    socket.close();
    process.exit(1);
  });

  // 超时处理
  setTimeout(() => {
    console.log('\n⏱️  等待超时 (60秒)');
    db.close();
    socket.close();
    process.exit(1);
  }, 60000);
}

triggerCommentCrawl().catch(error => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
