/**
 * 简化版：假设浏览器已经打开并且在私信详情页
 * 直接连接并提取数据
 */

const { chromium } = require('playwright');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

async function manualCheckMessageProperties() {
  console.log('🔍 手动检查消息属性（需要手动打开页面）\n');

  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ?').get('douyin');
  if (!account) {
    console.log('❌ 未找到抖音账户');
    db.close();
    return;
  }

  console.log(`📱 使用账户: ${account.platform_username || account.id}`);

  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);

  console.log('\n请手动操作：');
  console.log('1. 浏览器即将打开');
  console.log('2. 请手动导航到抖音私信页面');
  console.log('3. 点击任意一个会话，显示消息列表');
  console.log('4. 等待脚本自动提取数据\n');
  console.log('按任意键继续...');

  // 等待用户按键
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  console.log('\n🌐 启动浏览器...');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  try {
    console.log(`📍 当前 URL: ${page.url()}\n`);

    console.log('⏳ 请手动完成以下操作（60秒内）：');
    console.log('  1. 导航到抖音私信页面');
    console.log('  2. 点击任意一个有消息的会话');
    console.log('  3. 等待消息列表加载完成\n');

    // 等待60秒让用户操作
    for (let i = 60; i > 0; i--) {
      process.stdout.write(`\r倒计时: ${i} 秒 (按 Ctrl+C 提前开始提取)`);
      await page.waitForTimeout(1000);
    }

    console.log('\n\n' + '='.repeat(60));
    console.log('📋 开始提取消息元素的所有属性');
    console.log('='.repeat(60) + '\n');

    console.log(`📍 最终 URL: ${page.url()}\n`);

    // 提取消息属性
    const result = await page.evaluate(() => {
      console.log('=== 浏览器环境开始执行 ===\n');

      // 测试选择器
      const selectors = [
        '[class*="message"]',
        '[class*="item"]',
        '[role*="article"]'
      ];

      const matchCounts = selectors.map(sel => ({
        selector: sel,
        count: document.querySelectorAll(sel).length
      }));

      console.log('选择器匹配统计:');
      matchCounts.forEach(m => console.log(`  ${m.selector}: ${m.count} 个`));

      const allElements = document.querySelectorAll('[class*="message"], [class*="item"], [role*="article"]');
      console.log(`\n使用组合选择器找到: ${allElements.length} 个元素\n`);

      const messages = [];
      let analyzed = 0;

      allElements.forEach((element, index) => {
        // 查找 React Fiber
        const fiberKey = Object.keys(element).find(key =>
          key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
        );

        if (!fiberKey) {
          return;
        }

        let current = element[fiberKey];
        let depth = 0;
        let found = false;

        // 向上遍历
        while (current && depth < 20 && !found) {
          if (current.memoizedProps) {
            const props = current.memoizedProps;

            // 检查是否有消息数据
            if (props.conversationId || props.serverId || props.content || props.message) {
              analyzed++;

              if (analyzed <= 5) {
                console.log(`\n消息 ${analyzed} (元素 ${index}, 深度 ${depth}):`);
                console.log('  Props 键:', Object.keys(props).join(', '));
              }

              const messageData = {
                index: index,
                depth: depth,

                // 核心
                serverId: props.serverId,
                conversationId: props.conversationId,
                messageId: props.messageId,
                isFromMe: props.isFromMe,
                type: props.type,

                // 内容
                text: props.content?.text,

                // 用户信息（所有可能的键）
                user: props.user,
                sender: props.sender,
                senderInfo: props.senderInfo,
                fromUser: props.fromUser,
                toUser: props.toUser,
                userInfo: props.userInfo,

                // 头像
                avatar: props.avatar,
                avatarUrl: props.avatarUrl,
                senderAvatar: props.senderAvatar,
                avatarUri: props.avatarUri,
                avatarThumb: props.avatarThumb,

                // 昵称
                nickname: props.nickname,
                senderNickname: props.senderNickname,
                userName: props.userName,
                name: props.name,
                displayName: props.displayName,
                nickName: props.nickName,

                // 所有键
                allPropsKeys: Object.keys(props)
              };

              messages.push(messageData);
              found = true;
            }
          }

          current = current.return;
          depth++;
        }
      });

      console.log(`\n分析完成: ${allElements.length} 个元素, ${analyzed} 条消息\n`);

      return {
        url: window.location.href,
        totalElements: allElements.length,
        analyzedMessages: analyzed,
        messages: messages
      };
    });

    console.log(`URL: ${result.url}`);
    console.log(`总元素数: ${result.totalElements}`);
    console.log(`有效消息数: ${result.analyzedMessages}\n`);

    if (result.messages.length === 0) {
      console.log('❌ 未提取到任何消息数据\n');
      console.log('可能原因：');
      console.log('  1. 页面还没有完全加载');
      console.log('  2. 没有点击会话显示消息列表');
      console.log('  3. 选择器不匹配');
      console.log('  4. React Fiber 结构发生变化\n');

      await page.screenshot({ path: 'tests/debug-manual-check.png' });
      console.log('📸 已保存截图: tests/debug-manual-check.png');

    } else {
      console.log('✅ 成功提取消息数据\n');

      // 详细输出前 5 条
      result.messages.slice(0, 5).forEach((msg, i) => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📝 消息 ${i + 1}`);
        console.log(`${'='.repeat(60)}`);
        console.log(`元素索引: ${msg.index}, Fiber深度: ${msg.depth}\n`);

        console.log(`【核心标识】`);
        console.log(`  serverId: ${msg.serverId}`);
        console.log(`  conversationId: ${msg.conversationId}`);
        console.log(`  text: ${(msg.text || '').substring(0, 60)}...\n`);

        console.log(`【用户信息】`);
        if (msg.user) console.log(`  user:`, JSON.stringify(msg.user, null, 2));
        if (msg.sender) console.log(`  sender:`, JSON.stringify(msg.sender, null, 2));
        if (msg.senderInfo) console.log(`  senderInfo:`, JSON.stringify(msg.senderInfo, null, 2));
        if (msg.fromUser) console.log(`  fromUser:`, JSON.stringify(msg.fromUser, null, 2));
        if (msg.toUser) console.log(`  toUser:`, JSON.stringify(msg.toUser, null, 2));
        if (msg.userInfo) console.log(`  userInfo:`, JSON.stringify(msg.userInfo, null, 2));
        if (!msg.user && !msg.sender && !msg.senderInfo && !msg.fromUser && !msg.toUser && !msg.userInfo) {
          console.log(`  ❌ 无用户信息`);
        }

        console.log(`\n【头像】`);
        console.log(`  avatar: ${msg.avatar}`);
        console.log(`  avatarUrl: ${msg.avatarUrl}`);
        console.log(`  senderAvatar: ${msg.senderAvatar}`);
        console.log(`  avatarUri: ${msg.avatarUri}`);
        console.log(`  avatarThumb: ${msg.avatarThumb}`);

        console.log(`\n【昵称】`);
        console.log(`  nickname: ${msg.nickname}`);
        console.log(`  senderNickname: ${msg.senderNickname}`);
        console.log(`  userName: ${msg.userName}`);
        console.log(`  name: ${msg.name}`);
        console.log(`  displayName: ${msg.displayName}`);
        console.log(`  nickName: ${msg.nickName}`);

        console.log(`\n【所有属性键】 (${msg.allPropsKeys.length} 个)`);
        console.log(`  ${msg.allPropsKeys.join(', ')}`);
      });

      // 统计
      console.log(`\n\n${'='.repeat(60)}`);
      console.log('📊 统计结果');
      console.log(`${'='.repeat(60)}\n`);

      const hasUser = result.messages.filter(m =>
        m.user || m.sender || m.senderInfo || m.fromUser || m.toUser || m.userInfo
      ).length;
      const hasAvatar = result.messages.filter(m =>
        m.avatar || m.avatarUrl || m.senderAvatar || m.avatarUri || m.avatarThumb
      ).length;
      const hasNickname = result.messages.filter(m =>
        m.nickname || m.senderNickname || m.userName || m.name || m.displayName || m.nickName
      ).length;

      console.log(`包含用户信息的消息: ${hasUser}/${result.messages.length} ${hasUser > 0 ? '✅' : '❌'}`);
      console.log(`包含头像的消息: ${hasAvatar}/${result.messages.length} ${hasAvatar > 0 ? '✅' : '❌'}`);
      console.log(`包含昵称的消息: ${hasNickname}/${result.messages.length} ${hasNickname > 0 ? '✅' : '❌'}`);

      // 保存结果
      const outputPath = path.join(__dirname, 'message-properties-result.json');
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\n📁 完整数据已保存到: ${outputPath}`);
    }

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
  } finally {
    console.log('\n\n⏳ 保持浏览器打开 15 秒，请查看结果...');
    await page.waitForTimeout(15000);

    console.log('🔒 关闭浏览器...');
    await context.close();
    db.close();
  }
}

manualCheckMessageProperties();
