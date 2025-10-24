/**
 * 快速测试评论抓取
 * 直接通过数据库查询账户,然后手动执行爬虫
 */

const path = require('path');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');

async function quickTest() {
  console.log('🚀 快速测试评论抓取功能\n');

  // 1. 获取账户
  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ?').get('douyin');
  console.log('✅ 账户信息:');
  console.log('   ID:', account.id);
  console.log('   登录状态:', account.login_status);
  console.log('   Worker:', account.assigned_worker_id);
  console.log('   平台用户ID:', account.platform_user_id);
  console.log('');

  // 2. 启动浏览器
  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  console.log('🌐 启动浏览器...');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    // 3. 导入爬虫模块
    const { crawlComments } = require('../packages/worker/src/platforms/douyin/crawl-comments');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🕷️  开始执行评论抓取');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 4. 执行爬虫
    const result = await crawlComments(page, account, {
      maxVideos: 1,
      includeDiscussions: true,
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 抓取结果');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`评论数量: ${result.comments.length}`);
    console.log(`讨论数量: ${result.discussions.length}`);
    console.log(`作品数量: ${result.works.length}\n`);

    if (result.discussions.length > 0) {
      console.log('✅ 讨论数据抓取成功!\n');
      console.log('前5条讨论:');
      result.discussions.slice(0, 5).forEach((d, i) => {
        const createTime = new Date(d.create_time * 1000);
        console.log(`  ${i + 1}. ${d.author_name}: ${d.content}`);
        console.log(`     父评论ID: ${d.parent_comment_id.substring(0, 40)}...`);
        console.log(`     ⏰ ${createTime.toLocaleString('zh-CN')}\n`);
      });
    } else {
      console.log('⚠️  讨论数量为0\n');

      const commentsWithReplies = result.comments.filter(c => c.reply_count > 0);
      console.log(`评论中有回复的数量: ${commentsWithReplies.length}`);
      if (commentsWithReplies.length > 0) {
        console.log('前3条有回复的评论:');
        commentsWithReplies.slice(0, 3).forEach((c, i) => {
          console.log(`  ${i + 1}. ${c.author_name}: ${c.content.substring(0, 30)}...`);
          console.log(`     reply_count: ${c.reply_count}`);
        });
        console.log('\n❌ 按钮点击功能未生效!');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('\n❌ 抓取失败:', error);
    console.error(error.stack);
  } finally {
    console.log('\n⏸️  等待10秒后关闭浏览器...');
    await page.waitForTimeout(10000);

    await context.close();
    db.close();
    console.log('\n✅ 测试完成');
  }
}

quickTest().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
