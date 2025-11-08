/**
 * 检查评论API的完整数据结�?
 * 查看是否包含讨论/回复数据
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

async function checkCommentAPIData() {
  console.log('📋 检查评论API完整数据结构\n');

  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);
  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  if (!account) {
    console.log('�?未找到抖音账�?);
    process.exit(1);
  }

  const { chromium } = require('playwright');
  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  // 拦截评论API
  let commentAPIData = null;

  page.on('response', async (response) => {
    const url = response.url();

    if (url.includes('comment') && url.includes('list')) {
      try {
        const json = await response.json();

        if (json.comment_info_list && json.comment_info_list.length > 0) {
          console.log(`\n🔍 拦截到评论API:`);
          console.log(`  URL: ${url.substring(0, 120)}...`);
          console.log(`  评论数量: ${json.comment_info_list.length}\n`);

          // 保存第一条评论的完整数据
          const firstComment = json.comment_info_list[0];
          commentAPIData = firstComment;

          console.log(`📝 第一条评论的完整结构:\n`);
          console.log(JSON.stringify(firstComment, null, 2));
          console.log('\n');

          // 检查是否有reply相关字段
          console.log(`🔍 检查回复相关字�?`);

          const replyFields = Object.keys(firstComment).filter(key =>
            key.toLowerCase().includes('reply') ||
            key.toLowerCase().includes('子评�?) ||
            key.toLowerCase().includes('discussion')
          );

          if (replyFields.length > 0) {
            console.log(`  �?找到 ${replyFields.length} 个回复相关字�?`);
            replyFields.forEach(field => {
              const value = firstComment[field];
              console.log(`\n  字段: ${field}`);
              console.log(`  类型: ${typeof value}`);
              if (Array.isArray(value)) {
                console.log(`  数组长度: ${value.length}`);
                if (value.length > 0) {
                  console.log(`  第一个元�?`);
                  console.log(JSON.stringify(value[0], null, 2).substring(0, 500));
                }
              } else {
                console.log(`  �? ${JSON.stringify(value).substring(0, 200)}`);
              }
            });
          } else {
            console.log(`  �?没有找到回复相关字段`);
          }

          console.log(`\n\n🔍 所有字段列�?(${Object.keys(firstComment).length} �?:`);
          console.log(Object.keys(firstComment).sort().join(', '));
          console.log('\n');

          // 保存完整数据到文�?
          const outputPath = path.join(__dirname, 'comment-api-data.json');
          fs.writeFileSync(outputPath, JSON.stringify({
            url,
            total_comments: json.comment_info_list.length,
            first_comment: firstComment,
            all_field_names: Object.keys(firstComment).sort(),
          }, null, 2));

          console.log(`💾 完整数据已保存到: ${outputPath}\n`);
        }
      } catch (error) {
        console.log(`  ⚠️  解析失败: ${error.message}`);
      }
    }
  });

  console.log('�?API拦截器已启动\n');

  // 导航到评论页�?
  console.log('📍 导航到评论管理页�?..');
  await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await page.waitForTimeout(2000);

  // 点击选择作品
  console.log('📍 点击选择作品...');
  try {
    await page.click('span:has-text("选择作品")', { timeout: 5000 });
    await page.waitForTimeout(1500);
  } catch (e) {}

  // 选择77条评论的视频
  console.log('📍 选择�?7条评论的视频...\n');
  await page.evaluate(() => {
    const containers = document.querySelectorAll('.container-Lkxos9');
    for (const container of containers) {
      const commentCountEl = container.querySelector('.right-os7ZB9 > div:last-child');
      const text = commentCountEl?.innerText?.trim() || '';
      if (text === '77') {
        container.click();
        return;
      }
    }
  });

  console.log('�?等待评论API响应...');
  await page.waitForTimeout(5000);

  if (!commentAPIData) {
    console.log('\n�?未拦截到评论API数据\n');
  }

  console.log('\n⏸️  等待 10 �?..');
  await page.waitForTimeout(10000);

  await context.close();
  db.close();
  console.log('\n�?测试完成');
}

checkCommentAPIData().catch(error => {
  console.error('�?测试失败:', error);
  process.exit(1);
});
