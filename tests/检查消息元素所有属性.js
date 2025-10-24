/**
 * 检查私信消息元素中的所有可用属性
 * 包括：头像、昵称、用户信息等
 */

const { chromium } = require('playwright');
const Database = require('better-sqlite3');
const path = require('path');

async function checkAllMessageProperties() {
  console.log('🔍 检查消息元素的所有可用属性\n');

  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ?').get('douyin');
  if (!account) {
    console.log('❌ 未找到抖音账户');
    db.close();
    return;
  }

  console.log(`📱 使用账户: ${account.platform_username || account.id}\n`);

  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    // 导航到私信页面
    console.log('🌐 导航到私信页面...');
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(3000);

    // 点击第一个会话
    console.log('\n📋 查找会话列表...');

    // 尝试多种选择器
    const selectors = [
      '[class*="conversation-item"]',
      '[class*="session-item"]',
      '[class*="chat-item"]',
      '[role="listitem"]',
      'div[class*="list"] > div'
    ];

    let conversations = [];
    for (const selector of selectors) {
      conversations = await page.$$(selector);
      if (conversations.length > 0) {
        console.log(`✅ 使用选择器 "${selector}" 找到 ${conversations.length} 个会话`);
        break;
      }
    }

    if (conversations.length === 0) {
      console.log('❌ 未找到会话，尝试查看页面结构...');

      // 打印页面的主要结构
      const structure = await page.evaluate(() => {
        const selectors = ['[class*="list"]', '[class*="conversation"]', '[role="list"]', '[role="listitem"]'];
        return selectors.map(sel => ({
          selector: sel,
          count: document.querySelectorAll(sel).length
        }));
      });

      console.log('页面结构:', structure);
      await context.close();
      db.close();
      return;
    }

    console.log(`✅ 找到 ${conversations.length} 个会话\n`);
    console.log('🖱️ 点击第一个会话...');
    await conversations[0].click();
    await page.waitForTimeout(3000);

    // 等待消息加载
    console.log('⏳ 等待消息加载...');
    try {
      await page.waitForSelector('[class*="message"]', { timeout: 5000 });
    } catch (e) {
      console.log('⚠️ 未检测到消息元素，继续尝试...');
    }
    await page.waitForTimeout(2000);

    // 提取所有消息元素的完整属性
    console.log('\n🔍 分析消息元素的所有属性...\n');

    const result = await page.evaluate(() => {
      const allElements = document.querySelectorAll('[class*="message"], [class*="item"], [role*="article"]');
      console.log(`找到 ${allElements.length} 个元素`);

      const messages = [];
      let analyzed = 0;

      allElements.forEach((element, index) => {
        const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance'));
        if (!fiberKey) return;

        let current = element[fiberKey];
        let depth = 0;
        let found = false;

        // 向上遍历 Fiber 树
        while (current && depth < 20 && !found) {
          if (current.memoizedProps) {
            const props = current.memoizedProps;

            // 检查是否有消息相关数据
            if (props.conversationId || props.serverId || props.content || props.message) {
              analyzed++;

              // 提取所有可能的属性
              const messageData = {
                index: index,
                depth: depth,
                // 核心属性
                serverId: props.serverId,
                conversationId: props.conversationId,
                messageId: props.messageId,
                isFromMe: props.isFromMe,
                type: props.type,

                // 内容
                content: props.content,
                text: props.content?.text,

                // 时间
                createdAt: props.createdAt,
                timestamp: props.timestamp,

                // 用户信息
                user: props.user,
                sender: props.sender,
                senderInfo: props.senderInfo,
                fromUser: props.fromUser,
                toUser: props.toUser,

                // 头像
                avatar: props.avatar,
                avatarUrl: props.avatarUrl,
                senderAvatar: props.senderAvatar,

                // 昵称
                nickname: props.nickname,
                senderNickname: props.senderNickname,
                userName: props.userName,
                name: props.name,

                // 其他可能的字段
                status: props.status,
                read: props.read,
                messageType: props.messageType,

                // 打印所有 props 的键
                allPropsKeys: Object.keys(props)
              };

              messages.push(messageData);
              found = true;

              // 只分析前 5 条消息
              if (analyzed <= 5) {
                console.log(`\n📝 消息 ${analyzed} (元素 ${index}, 深度 ${depth}):`);
                console.log('所有属性键:', Object.keys(props).join(', '));

                // 打印完整的 props 对象（只打印前两层）
                console.log('\n完整属性结构:');
                Object.keys(props).forEach(key => {
                  const value = props[key];
                  if (value && typeof value === 'object') {
                    console.log(`  ${key}:`, Object.keys(value).join(', '));
                  } else {
                    console.log(`  ${key}:`, value);
                  }
                });
              }
            }
          }

          current = current.return;
          depth++;
        }
      });

      return {
        totalElements: allElements.length,
        analyzedMessages: analyzed,
        messages: messages
      };
    });

    console.log('\n' + '='.repeat(60));
    console.log('📊 分析结果汇总');
    console.log('='.repeat(60));
    console.log(`总元素数: ${result.totalElements}`);
    console.log(`有效消息数: ${result.analyzedMessages}`);
    console.log(`\n前 5 条消息的完整数据:\n`);

    result.messages.slice(0, 5).forEach((msg, i) => {
      console.log(`\n消息 ${i + 1}:`);
      console.log('─'.repeat(40));
      console.log(`索引: ${msg.index}, Fiber深度: ${msg.depth}`);
      console.log(`\n核心标识:`);
      console.log(`  serverId: ${msg.serverId}`);
      console.log(`  conversationId: ${msg.conversationId}`);
      console.log(`  messageId: ${msg.messageId}`);

      console.log(`\n消息内容:`);
      console.log(`  text: ${msg.text}`);
      console.log(`  isFromMe: ${msg.isFromMe}`);
      console.log(`  type: ${msg.type}`);

      console.log(`\n用户信息:`);
      console.log(`  user: ${JSON.stringify(msg.user)}`);
      console.log(`  sender: ${JSON.stringify(msg.sender)}`);
      console.log(`  senderInfo: ${JSON.stringify(msg.senderInfo)}`);
      console.log(`  fromUser: ${JSON.stringify(msg.fromUser)}`);
      console.log(`  toUser: ${JSON.stringify(msg.toUser)}`);

      console.log(`\n头像和昵称:`);
      console.log(`  avatar: ${msg.avatar}`);
      console.log(`  avatarUrl: ${msg.avatarUrl}`);
      console.log(`  senderAvatar: ${msg.senderAvatar}`);
      console.log(`  nickname: ${msg.nickname}`);
      console.log(`  senderNickname: ${msg.senderNickname}`);
      console.log(`  userName: ${msg.userName}`);
      console.log(`  name: ${msg.name}`);

      console.log(`\n所有属性键 (${msg.allPropsKeys.length} 个):`);
      console.log(`  ${msg.allPropsKeys.join(', ')}`);
    });

    console.log('\n\n' + '='.repeat(60));
    console.log('💡 结论');
    console.log('='.repeat(60));

    const hasUserInfo = result.messages.some(m => m.user || m.sender || m.senderInfo);
    const hasAvatar = result.messages.some(m => m.avatar || m.avatarUrl || m.senderAvatar);
    const hasNickname = result.messages.some(m => m.nickname || m.senderNickname || m.userName);

    console.log(`用户信息: ${hasUserInfo ? '✅ 有' : '❌ 无'}`);
    console.log(`头像: ${hasAvatar ? '✅ 有' : '❌ 无'}`);
    console.log(`昵称: ${hasNickname ? '✅ 有' : '❌ 无'}`);

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
  } finally {
    console.log('\n\n⏳ 等待 10 秒后关闭浏览器...');
    await page.waitForTimeout(10000);
    await context.close();
    db.close();
  }
}

checkAllMessageProperties();
