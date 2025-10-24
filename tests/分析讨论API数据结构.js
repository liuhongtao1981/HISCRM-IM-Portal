/**
 * 分析讨论/回复API的完整数据结构
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

async function analyzeReplyAPIStructure() {
  console.log('📋 分析讨论API数据结构\n');

  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);
  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  if (!account) {
    console.log('❌ 未找到抖音账户');
    process.exit(1);
  }

  const { chromium } = require('playwright');
  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  let replyAPIData = null;

  // API拦截器
  page.on('response', async (response) => {
    const url = response.url();

    if (url.includes('/comment/reply/list/')) {
      try {
        const data = await response.json();
        replyAPIData = {
          url,
          status: response.status(),
          data,
        };

        console.log('✅ 捕获到讨论API响应!\n');
      } catch (e) {
        console.error('解析API响应失败:', e.message);
      }
    }
  });

  try {
    // 1. 导航到评论页面
    console.log('📍 导航到评论管理页面...');
    await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // 2. 点击选择作品
    console.log('📍 点击选择作品...');
    try {
      await page.click('span:has-text("选择作品")', { timeout: 5000 });
      await page.waitForTimeout(1500);
    } catch (e) {}

    // 3. 选择有评论的视频
    console.log('📍 选择视频...');
    await page.evaluate(() => {
      const containers = document.querySelectorAll('.container-Lkxos9');
      if (containers.length > 0) {
        containers[0].click();
      }
    });

    await page.waitForTimeout(3000);

    // 4. 点击"查看回复"按钮
    console.log('🖱️  点击"查看回复"按钮...\n');

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('[class*="load-more"]'));
      const replyButton = buttons.find(btn => {
        const text = (btn.textContent || '').trim();
        const style = window.getComputedStyle(btn);
        return text.match(/^查看\d+条回复$/) && style.cursor === 'pointer';
      });

      if (replyButton) {
        replyButton.click();
      }
    });

    // 5. 等待API响应
    await page.waitForTimeout(3000);

    if (!replyAPIData) {
      console.log('❌ 没有捕获到讨论API响应\n');
      await context.close();
      db.close();
      return;
    }

    // 6. 分析数据结构
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 讨论API数据结构分析');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`API URL: ${replyAPIData.url}\n`);
    console.log(`状态码: ${replyAPIData.status}\n`);

    const { data } = replyAPIData;

    // 顶层字段
    console.log('顶层字段:');
    Object.keys(data).forEach(key => {
      const value = data[key];
      const type = Array.isArray(value) ? `Array(${value.length})` : typeof value;
      console.log(`  ${key}: ${type}`);
    });
    console.log('');

    // 分析 comment_info_list
    if (data.comment_info_list && data.comment_info_list.length > 0) {
      const firstComment = data.comment_info_list[0];

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('第一条讨论/回复的完整字段:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      Object.keys(firstComment).forEach(key => {
        const value = firstComment[key];
        let displayValue;

        if (typeof value === 'object' && value !== null) {
          displayValue = JSON.stringify(value);
        } else {
          displayValue = value;
        }

        console.log(`${key}: ${displayValue}`);
      });

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('user_info 字段结构:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      if (firstComment.user_info) {
        Object.keys(firstComment.user_info).forEach(key => {
          console.log(`  ${key}: ${firstComment.user_info[key]}`);
        });
      }

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('所有讨论数据:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      data.comment_info_list.forEach((comment, i) => {
        console.log(`${i + 1}. ${comment.user_info?.screen_name || '未知用户'}`);
        console.log(`   内容: ${comment.text || '无内容'}`);
        console.log(`   时间: ${new Date(parseInt(comment.create_time) * 1000).toLocaleString('zh-CN')}`);
        console.log(`   点赞: ${comment.digg_count}`);
        console.log(`   回复数: ${comment.reply_count}`);
        console.log(`   评论ID: ${comment.comment_id}`);
        console.log('');
      });
    }

    // 保存完整数据到文件
    const outputPath = path.join(__dirname, 'reply-api-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(replyAPIData, null, 2), 'utf8');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ 完整数据已保存到: ${outputPath}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    console.log('⏸️  等待10秒后关闭浏览器...');
    await page.waitForTimeout(10000);

    await context.close();
    db.close();
    console.log('\n✅ 测试完成');
  }
}

analyzeReplyAPIStructure().catch(error => {
  console.error('❌ 测试脚本执行失败:', error);
  process.exit(1);
});
