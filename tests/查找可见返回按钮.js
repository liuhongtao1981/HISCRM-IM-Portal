/**
 * 查找讨论API的真实URL
 * 打印所有网络请�?
 */

const Database = require('better-sqlite3');
const path = require('path');

async function findDiscussionAPI() {
  console.log('📋 查找讨论API的真实URL\n');

  // 1. 读取账户信息
  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  if (!account) {
    console.log('�?未找到抖音账�?);
    process.exit(1);
  }

  console.log(`�?找到账户: ${account.id}\n`);

  // 2. 连接到浏览器
  const { chromium } = require('playwright');

  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  // 3. 拦截所有包含creator.douyin.com的API请求
  const allAPIs = [];

  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';

    // 只记录creator.douyin.com的JSON API
    if (url.includes('creator.douyin.com') && contentType.includes('application/json')) {
      allAPIs.push({
        url,
        status: response.status(),
        contentType,
      });

      // 如果URL包含comment或reply,打印详细信息
      if (url.includes('comment') || url.includes('reply')) {
        console.log(`\n🔍 发现相关API:`);
        console.log(`  URL: ${url}`);
        console.log(`  Status: ${response.status()}`);

        try {
          const json = await response.json();
          console.log(`  Response keys: ${Object.keys(json).join(', ')}`);

          // 如果有reply_list,打印第一�?
          if (json.reply_list && json.reply_list.length > 0) {
            console.log('\n📝 第一条回复数�?');
            console.log(JSON.stringify(json.reply_list[0], null, 2).substring(0, 2000));
          }

          // 如果有comment_info_list,只打印数�?
          if (json.comment_info_list) {
            console.log(`  评论数量: ${json.comment_info_list.length}`);
          }
        } catch (error) {
          console.log(`  ⚠️  无法解析JSON: ${error.message}`);
        }

        console.log('');
      }
    }
  });

  console.log('�?API拦截器已启动(记录所有creator.douyin.com JSON API)\n');

  // 4. 导航到评论管理页�?
  console.log('📍 导航到评论管理页�?..');
  await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  await page.waitForTimeout(3000);
  console.log('�?页面加载完成\n');

  // 5. 点击"选择作品"
  console.log('📍 点击"选择作品"...');
  try {
    await page.click('span:has-text("选择作品")', { timeout: 5000 });
    await page.waitForTimeout(2000);
  } catch (error) {
    console.log('⚠️  选择作品可能已打开\n');
  }

  // 6. 选择第一个有评论的视�?
  const videoClicked = await page.evaluate(() => {
    const containers = document.querySelectorAll('.container-Lkxos9');
    for (let i = 0; i < containers.length; i++) {
      const commentCountEl = containers[i].querySelector('.right-os7ZB9 > div:last-child');
      const commentCount = parseInt(commentCountEl?.innerText?.trim() || '0');

      if (commentCount > 0) {
        containers[i].click();
        return true;
      }
    }
    return false;
  });

  if (!videoClicked) {
    console.log('�?没有找到有评论的视频');
    await context.close();
    db.close();
    return;
  }

  console.log('�?已选择视频,等待评论加载...');
  await page.waitForTimeout(3000);

  // 7. 查找并点击第一�?查看X条回�?按钮
  console.log('\n🖱�? 查找并点击第一�?查看X条回�?按钮...\n');

  const clicked = await page.evaluate(() => {
    const allElements = Array.from(document.querySelectorAll('*'));
    const target = allElements.find(el => {
      const text = el.textContent || '';
      return /^查看\d+条回�?/.test(text) && el.offsetParent !== null;
    });

    if (target) {
      console.log(`找到按钮: ${target.textContent}`);
      target.click();
      return true;
    }
    return false;
  });

  if (clicked) {
    console.log('�?点击成功,等待API响应...\n');
    await page.waitForTimeout(3000);
  } else {
    console.log('�?没有找到"查看X条回�?按钮\n');
  }

  // 8. 统计所有API
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 所有creator.douyin.com API统计');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`总共拦截 ${allAPIs.length} 个API:\n`);

  allAPIs.forEach((api, i) => {
    const urlShort = api.url.length > 100 ? api.url.substring(0, 100) + '...' : api.url;
    console.log(`${i + 1}. ${urlShort}`);
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 等待查看
  console.log('⏸️  等待 10 �?..');
  await page.waitForTimeout(10000);

  await context.close();
  db.close();
  console.log('\n�?测试完成');
}

findDiscussionAPI().catch(error => {
  console.error('�?测试失败:', error);
  process.exit(1);
});
