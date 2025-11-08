/**
 * 测试新的评论抓取流程
 * 验证: 逐个视频处理 + 滚动评论 + 点击回复按钮
 */

const path = require('path');
const Database = require('better-sqlite3');

async function testNewCommentCrawl() {
  console.log('📋 测试新的评论抓取流程\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. 加载账户
  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  if (!account) {
    console.log('�?未找到抖音账�?);
    process.exit(1);
  }

  console.log(`�?找到账户: ${account.id}`);
  console.log(`   平台用户ID: ${account.platform_user_id}\n`);

  // 2. 导入爬虫模块
  const { crawlComments } = require('../packages/worker/src/platforms/douyin/crawl-comments.js');
  const { chromium } = require('playwright');

  // 3. 创建浏览器上下文
  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  console.log('�?浏览器已启动\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // 4. 调用评论爬虫 (只处�?个视频进行测�?
    console.log('🚀 开始爬取评�?(maxVideos: 1, includeDiscussions: true)\n');

    const result = await crawlComments(page, account, {
      maxVideos: 1,  // 只测�?个视�?
      includeDiscussions: true,
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 爬取结果统计');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`评论数量: ${result.comments.length}`);
    console.log(`讨论数量: ${result.discussions.length}`);
    console.log(`作品数量: ${result.contents.length}`);
    console.log('');

    // 5. 显示详细数据
    if (result.comments.length > 0) {
      console.log('📝 �?条评�?');
      result.comments.slice(0, 3).forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.author_name}: ${c.content.substring(0, 50)}${c.content.length > 50 ? '...' : ''}`);
        console.log(`     👍 ${c.stats_like_count} 点赞 | 💬 ${c.reply_count} 回复 | �?${c.create_time_formatted}`);
      });
      console.log('');
    }

    if (result.discussions.length > 0) {
      console.log(`📝 �?条讨�?回复:`);
      result.discussions.slice(0, 5).forEach((d, i) => {
        console.log(`  ${i + 1}. ${d.author_name}: ${d.content.substring(0, 50)}${d.content.length > 50 ? '...' : ''}`);
        console.log(`     父评论ID: ${d.parent_comment_id?.substring(0, 20)}...`);
        console.log(`     �?${d.create_time_formatted}`);
      });
      console.log('');
    } else {
      console.log('⚠️  没有抓取到讨论数据\n');
      console.log('可能原因:');
      console.log('  1. 该视频的评论没有回复');
      console.log('  2. 滚动或点击回复按钮失�?);
      console.log('  3. 讨论API未触发\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 6. 验证结果
    const hasComments = result.comments.length > 0;
    const hasDiscussions = result.discussions.length > 0;

    console.log('�?测试结果:');
    console.log(`   评论抓取: ${hasComments ? '�?成功' : '�?失败'}`);
    console.log(`   讨论抓取: ${hasDiscussions ? '�?成功' : '⚠️  未获取到数据'}`);
    console.log('');

    if (hasComments && hasDiscussions) {
      console.log('🎉 测试通过! 新的评论抓取流程工作正常\n');
    } else if (hasComments && !hasDiscussions) {
      console.log('⚠️  部分通过: 评论抓取成功,但未获取到讨论数据\n');
      console.log('建议:');
      console.log('  1. 检查选中的视频是否有带回复的评论');
      console.log('  2. 查看Worker日志中是否有错误信息');
      console.log('  3. 手动验证"查看回复"按钮是否被点击\n');
    } else {
      console.log('�?测试失败: 未能抓取到评论数据\n');
    }

  } catch (error) {
    console.error('\n�?测试过程中发生错�?\n');
    console.error(error);
  } finally {
    console.log('⏸️  等待10秒后关闭浏览�?..');
    await page.waitForTimeout(10000);

    await context.close();
    db.close();

    console.log('\n�?测试完成');
  }
}

testNewCommentCrawl().catch(error => {
  console.error('�?测试脚本执行失败:', error);
  process.exit(1);
});
