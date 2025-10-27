/**
 * 测试正式爬虫中的按钮点击功能
 * 验证在实际运行中是否能正确点击"查看回复"按钮
 */

const path = require('path');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');
const { crawlComments } = require('../packages/worker/src/platforms/douyin/crawl-comments');

async function testOfficialCrawler() {
  console.log('🧪 测试正式爬虫的按钮点击功能\n');

  // 1. 连接数据库获取账户
  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  if (!account) {
    console.log('❌ 未找到抖音账户');
    db.close();
    process.exit(1);
  }

  console.log(`✅ 账户: ${account.platform_username} (ID: ${account.id})`);
  console.log(`   平台用户ID: ${account.platform_user_id || '未设置'}\n`);

  // 2. 启动浏览器
  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 开始执行正式爬虫流程');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 3. 调用正式的 crawlComments 函数
    const result = await crawlComments(page, account, {
      maxVideos: 1,  // 只处理1个视频
      includeDiscussions: true,
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 爬取结果统计');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`评论数量: ${result.comments.length}`);
    console.log(`讨论数量: ${result.discussions.length}`);
    console.log(`作品数量: ${result.contents.length}\n`);

    if (result.discussions.length === 0) {
      console.log('❌ 讨论数量为 0！按钮点击可能未执行\n');
      console.log('可能原因:');
      console.log('  1. 选择的视频评论没有回复');
      console.log('  2. 按钮选择器未匹配到元素');
      console.log('  3. 点击事件未触发\n');

      // 检查评论中有回复的数量
      const commentsWithReplies = result.comments.filter(c => c.reply_count > 0);
      console.log(`评论中有回复的数量: ${commentsWithReplies.length}`);
      if (commentsWithReplies.length > 0) {
        console.log('前3条有回复的评论:');
        commentsWithReplies.slice(0, 3).forEach((c, i) => {
          console.log(`  ${i + 1}. ${c.author_name}: ${c.content.substring(0, 30)}...`);
          console.log(`     reply_count: ${c.reply_count}`);
        });
        console.log('\n⚠️  有评论显示有回复,但未抓取到讨论数据!');
        console.log('   说明按钮点击功能未正常工作\n');
      }
    } else {
      console.log('✅ 成功抓取到讨论数据!\n');
      console.log('前5条讨论:');
      result.discussions.slice(0, 5).forEach((d, i) => {
        const createTime = new Date(d.create_time * 1000);
        console.log(`  ${i + 1}. ${d.author_name}: ${d.content}`);
        console.log(`     父评论ID: ${d.parent_comment_id.substring(0, 40)}...`);
        console.log(`     ⏰ ${createTime.toLocaleString('zh-CN')}\n`);
      });
    }

    // 统计信息
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 详细统计');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`总评论数: ${result.comments.length}`);
    console.log(`总讨论数: ${result.discussions.length}`);
    console.log(`有回复的评论: ${result.comments.filter(c => c.reply_count > 0).length}`);
    console.log(`评论总回复数: ${result.comments.reduce((sum, c) => sum + c.reply_count, 0)}`);

    if (result.discussions.length > 0) {
      console.log(`\n✅ 测试通过! 按钮点击功能正常`);
    } else {
      console.log(`\n❌ 测试失败! 按钮点击未执行或未生效`);
    }

  } catch (error) {
    console.error('\n❌ 爬取失败:', error);
    console.error(error.stack);
  } finally {
    console.log('\n⏸️  等待10秒后关闭浏览器...');
    await page.waitForTimeout(10000);

    await context.close();
    db.close();
    console.log('\n✅ 测试完成');
  }
}

testOfficialCrawler().catch(error => {
  console.error('❌ 测试脚本执行失败:', error);
  process.exit(1);
});
