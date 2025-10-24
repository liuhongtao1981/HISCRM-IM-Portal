/**
 * 测试评论讨论完整抓取流程
 * 1. 点击选择视频
 * 2. 滚动加载所有评论
 * 3. 点击所有 "查看X条回复" 按钮
 * 4. 验证API拦截
 */

const Database = require('better-sqlite3');
const path = require('path');

async function testCommentDiscussionFlow() {
  console.log('📋 测试评论讨论完整抓取流程\n');

  // 1. 读取账户信息
  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  if (!account) {
    console.log('❌ 未找到抖音账户');
    process.exit(1);
  }

  console.log(`✅ 找到账户: ${account.id}\n`);

  // 2. 连接到浏览器
  const { chromium } = require('playwright');

  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  // 3. 设置API拦截器
  const interceptedAPIs = {
    comments: [],
    discussions: [],
  };

  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';

    if (!contentType.includes('application/json')) {
      return;
    }

    try {
      // 评论API
      if (/comment.*list/i.test(url)) {
        const json = await response.json();
        if (json.comment_info_list && Array.isArray(json.comment_info_list)) {
          interceptedAPIs.comments.push({
            url,
            count: json.comment_info_list.length,
            has_more: json.has_more,
          });
          console.log(`  🔍 拦截评论API: ${json.comment_info_list.length} 条评论`);
        }
      }

      // 讨论/回复API
      if (/comment.*reply/i.test(url)) {
        const json = await response.json();
        if (json.reply_list && Array.isArray(json.reply_list)) {
          interceptedAPIs.discussions.push({
            url,
            count: json.reply_list.length,
            data: json.reply_list[0], // 保存第一条用于分析
          });
          console.log(`  🔍 拦截讨论API: ${json.reply_list.length} 条回复`);

          // 输出第一条回复的完整结构
          if (json.reply_list[0]) {
            console.log('\n📝 第一条回复对象结构:');
            console.log(JSON.stringify(json.reply_list[0], null, 2).substring(0, 2000));
            console.log('\n');
          }
        }
      }
    } catch (error) {
      // 忽略JSON解析错误
    }
  });

  console.log('✅ API拦截器已启动\n');

  // 4. 导航到评论管理页面
  console.log('📍 导航到评论管理页面...');
  await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  await page.waitForTimeout(3000);
  console.log('✅ 页面加载完成\n');

  // 5. 点击"选择作品"按钮
  console.log('📍 点击"选择作品"按钮...');
  try {
    await page.click('span:has-text("选择作品")', { timeout: 5000 });
    await page.waitForTimeout(2000);
    console.log('✅ 选择作品模态框已打开\n');
  } catch (error) {
    console.log('⚠️  选择作品按钮可能已打开或不需要点击\n');
  }

  // 6. 查找有评论的视频
  const videos = await page.evaluate(() => {
    const containers = document.querySelectorAll('.container-Lkxos9');
    const results = [];

    containers.forEach((container, idx) => {
      const titleEl = container.querySelector('.title-LUOP3b');
      const commentCountEl = container.querySelector('.right-os7ZB9 > div:last-child');

      if (titleEl) {
        const commentCount = parseInt(commentCountEl?.innerText?.trim() || '0');
        if (commentCount > 0) {
          results.push({
            index: idx,
            title: titleEl.innerText?.trim() || '',
            commentCount,
          });
        }
      }
    });

    return results.sort((a, b) => b.commentCount - a.commentCount); // 评论多的排前面
  });

  console.log(`📊 找到 ${videos.length} 个有评论的视频:`);
  videos.slice(0, 3).forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.title.substring(0, 40)}... (${v.commentCount} 条评论)`);
  });
  console.log('');

  if (videos.length === 0) {
    console.log('❌ 没有找到有评论的视频');
    await context.close();
    db.close();
    return;
  }

  // 7. 选择第一个视频(评论最多的)
  const targetVideo = videos[0];
  console.log(`🎯 选择视频: ${targetVideo.title.substring(0, 50)}... (${targetVideo.commentCount} 条评论)\n`);

  await page.evaluate((idx) => {
    const containers = document.querySelectorAll('.container-Lkxos9');
    if (idx < containers.length) {
      containers[idx].click();
    }
  }, targetVideo.index);

  console.log('⏳ 等待评论加载...');
  await page.waitForTimeout(3000);

  // 8. 滚动加载所有评论
  console.log('\n📜 开始滚动加载所有评论...');
  let scrollAttempts = 0;
  const maxScrolls = 10;
  let lastCommentCount = 0;

  while (scrollAttempts < maxScrolls) {
    const currentCommentCount = await page.evaluate(() => {
      // 滚动评论区到底部
      const commentContainers = document.querySelectorAll('[class*="comment"]');
      for (const container of commentContainers) {
        if (container.scrollHeight > container.clientHeight) {
          container.scrollTo(0, container.scrollHeight);
        }
      }

      // 查找"加载更多"按钮
      const loadMoreButtons = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent || '';
        return text.includes('加载') || text.includes('更多');
      });

      if (loadMoreButtons.length > 0) {
        loadMoreButtons[0].click();
      }

      // 返回当前评论数
      return document.querySelectorAll('[class*="comment-item"]').length;
    });

    if (currentCommentCount > lastCommentCount) {
      console.log(`  📊 当前已加载 ${currentCommentCount} 条评论`);
      lastCommentCount = currentCommentCount;
      await page.waitForTimeout(2000);
      scrollAttempts++;
    } else {
      console.log(`  ✅ 评论加载完成 (共 ${currentCommentCount} 条)\n`);
      break;
    }
  }

  // 9. 查找并点击所有 "查看X条回复" 按钮
  console.log('🔍 查找所有 "查看X条回复" 按钮...\n');

  const replyButtonsInfo = await page.evaluate(() => {
    const allElements = Array.from(document.querySelectorAll('*'));
    const buttons = [];

    allElements.forEach((el, idx) => {
      const text = el.textContent || '';
      const match = text.match(/^查看(\d+)条回复$/);

      if (match && el.offsetParent !== null) {
        buttons.push({
          index: idx,
          text,
          replyCount: parseInt(match[1]),
          className: el.className,
        });
      }
    });

    return buttons;
  });

  console.log(`📊 找到 ${replyButtonsInfo.length} 个回复按钮:`);
  replyButtonsInfo.forEach((btn, i) => {
    console.log(`  ${i + 1}. ${btn.text} (${btn.replyCount} 条)`);
  });
  console.log('');

  if (replyButtonsInfo.length === 0) {
    console.log('⚠️  没有找到回复按钮\n');
  } else {
    console.log(`🖱️  开始依次点击所有回复按钮...\n`);

    for (let i = 0; i < replyButtonsInfo.length; i++) {
      const btn = replyButtonsInfo[i];
      console.log(`  [${i + 1}/${replyButtonsInfo.length}] 点击: ${btn.text}`);

      const clicked = await page.evaluate((btnText) => {
        const allElements = Array.from(document.querySelectorAll('*'));
        const target = allElements.find(el => {
          const text = el.textContent || '';
          return text === btnText && el.offsetParent !== null;
        });

        if (target) {
          target.click();
          return true;
        }
        return false;
      }, btn.text);

      if (clicked) {
        console.log(`    ✅ 点击成功`);
        await page.waitForTimeout(1500); // 等待API响应
      } else {
        console.log(`    ❌ 点击失败`);
      }
    }

    console.log('\n✅ 所有回复按钮点击完成\n');
  }

  // 10. 等待所有API响应完成
  console.log('⏳ 等待最后的API响应...');
  await page.waitForTimeout(2000);

  // 11. 统计结果
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 API拦截统计结果');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`评论API拦截次数: ${interceptedAPIs.comments.length}`);
  interceptedAPIs.comments.forEach((api, i) => {
    console.log(`  ${i + 1}. ${api.count} 条评论 (has_more: ${api.has_more})`);
  });

  console.log(`\n讨论API拦截次数: ${interceptedAPIs.discussions.length}`);
  interceptedAPIs.discussions.forEach((api, i) => {
    console.log(`  ${i + 1}. ${api.count} 条回复`);
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (interceptedAPIs.discussions.length > 0) {
    console.log('✅ 讨论API拦截成功! 流程验证通过\n');
    console.log('🔑 关键发现:');
    console.log('  - 讨论API只在点击"查看X条回复"后触发');
    console.log('  - API URL 包含 "reply"');
    console.log('  - 返回字段: reply_list[]\n');
  } else {
    console.log('❌ 未拦截到讨论API\n');
  }

  // 等待查看
  console.log('⏸️  等待 10 秒,可以手动查看页面...');
  await page.waitForTimeout(10000);

  await context.close();
  db.close();
  console.log('\n✅ 测试完成');
}

testCommentDiscussionFlow().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
