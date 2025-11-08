/**
 * 点击会话并分析消息虚拟列�? */

const { chromium } = require('playwright');
const path = require('path');

async function clickAndAnalyze() {
  console.log('\n' + '='.repeat(80));
  console.log('点击会话并分析消息虚拟列�?);
  console.log('='.repeat(80) + '\n');

  const userDataDir = path.join(__dirname, '../test-browser-data-manual');

  let context;
  try {
    console.log('启动浏览�?..');
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    console.log('�?浏览器已启动\n');

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    console.log('导航到私信页�?..');
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(3000);
    console.log('�?页面已加载\n');

    // 查找并点击第一个有效会�?    console.log('查找会话列表...');

    const conversations = await page.$$('li[class*="item"]');
    console.log(`找到 ${conversations.length} 个列表项\n`);

    let clicked = false;
    for (let i = 0; i < Math.min(conversations.length, 50); i++) {
      const text = await conversations[i].textContent().catch(() => '');

      // 跳过导航项，查找真实会话（包含用户名和消息预览）
      if (text && text.length > 20 &&
          !text.includes('首页') &&
          !text.includes('管理') &&
          !text.includes('数据中心') &&
          !text.includes('创作中心')) {

        console.log(`点击会话 #${i}: ${text.substring(0, 50)}...`);
        await conversations[i].click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      console.log('�?没有找到可点击的会话');
      await context.close();
      return;
    }

    console.log('�?已点击会话\n');

    // 等待消息加载
    console.log('等待消息加载...');
    await page.waitForTimeout(3000);

    // 查找所有虚拟列表容�?    console.log('='.repeat(80));
    console.log('查找虚拟列表容器');
    console.log('='.repeat(80) + '\n');

    const containers = await page.evaluate(() => {
      const result = [];
      const grids = document.querySelectorAll('[role="grid"]');

      grids.forEach((grid, index) => {
        const rect = grid.getBoundingClientRect();
        const innerContainer = grid.children[0];

        result.push({
          index,
          className: grid.className,
          position: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          childCount: innerContainer ? innerContainer.children.length : 0,
          innerClassName: innerContainer ? innerContainer.className : '',
          firstChildText: innerContainer && innerContainer.children[0]
            ? innerContainer.children[0].textContent.substring(0, 100).replace(/\s+/g, ' ')
            : ''
        });
      });

      return result;
    });

    console.log(`找到 ${containers.length} 个虚拟列表容器\n`);

    containers.forEach(c => {
      console.log(`容器 #${c.index}:`);
      console.log(`  位置: (${c.position.x}, ${c.position.y}), 尺寸: ${c.position.width}×${c.position.height}`);
      console.log(`  类名: ${c.className}`);
      console.log(`  内部容器: ${c.innerClassName}`);
      console.log(`  子元素数: ${c.childCount}`);
      console.log(`  第一个子元素: ${c.firstChildText}`);
      console.log('');
    });

    // 深度分析每个容器
    console.log('='.repeat(80));
    console.log('深度分析 React Fiber 结构');
    console.log('='.repeat(80) + '\n');

    for (let containerIdx = 0; containerIdx < containers.length; containerIdx++) {
      console.log(`\n【容�?#${containerIdx}】\n`);

      const analysis = await page.evaluate((idx) => {
        const grids = document.querySelectorAll('[role="grid"]');
        const grid = grids[idx];

        if (!grid || !grid.children[0]) {
          return { error: '容器不存�? };
        }

        const innerContainer = grid.children[0];
        const children = Array.from(innerContainer.children);

        function deepSearch(fiber, depth = 0, maxDepth = 15) {
          if (!fiber || depth > maxDepth) return [];

          const findings = [];

          if (fiber.memoizedProps) {
            const props = fiber.memoizedProps;
            const allKeys = Object.keys(props);

            // 查找消息相关�?            const msgKeys = allKeys.filter(k => {
              const lk = k.toLowerCase();
              return lk.includes('message') || lk.includes('content') ||
                     lk.includes('text') || lk.includes('msg') ||
                     lk.includes('conversation') || lk.includes('sender') ||
                     lk.includes('user') || lk.includes('time') ||
                     lk.includes('id') || lk.includes('data');
            });

            if (msgKeys.length > 0) {
              const sample = {};
              msgKeys.forEach(key => {
                const val = props[key];
                if (val === null || val === undefined) {
                  sample[key] = `(${typeof val})`;
                } else if (typeof val === 'object') {
                  const objKeys = Object.keys(val);
                  sample[key] = `{${objKeys.slice(0, 5).join(', ')}${objKeys.length > 5 ? '...' : ''}}`;
                } else {
                  sample[key] = String(val).substring(0, 100);
                }
              });

              findings.push({
                depth,
                totalKeys: allKeys.length,
                msgKeys,
                sample,
                allKeys: allKeys.slice(0, 30)
              });
            }
          }

          if (fiber.child) {
            findings.push(...deepSearch(fiber.child, depth + 1, maxDepth));
          }

          if (depth < 3 && fiber.sibling) {
            findings.push(...deepSearch(fiber.sibling, depth + 1, maxDepth));
          }

          return findings;
        }

        const allFindings = [];

        // 分析�?5个子元素
        for (let i = 0; i < Math.min(15, children.length); i++) {
          const child = children[i];
          const fiberKey = Object.keys(child).find(k => k.startsWith('__react'));

          if (fiberKey) {
            const findings = deepSearch(child[fiberKey]);
            if (findings.length > 0) {
              allFindings.push({
                elementIndex: i,
                findings: findings.slice(0, 3) // 每个元素只保留前3个发�?              });
            }
          }
        }

        return {
          totalChildren: children.length,
          elementsWithData: allFindings.length,
          allFindings
        };
      }, containerIdx);

      if (analysis.error) {
        console.log(`  �?${analysis.error}\n`);
        continue;
      }

      console.log(`  子元素总数: ${analysis.totalChildren}`);
      console.log(`  包含数据的元�? ${analysis.elementsWithData}\n`);

      if (analysis.elementsWithData > 0) {
        console.log(`  ✅✅�?找到消息数据！\n`);

        analysis.allFindings.forEach(elem => {
          console.log(`  元素 #${elem.elementIndex}:`);

          elem.findings.forEach((finding, idx) => {
            console.log(`    发现 #${idx + 1} (深度 ${finding.depth}):`);
            console.log(`      总Props�? ${finding.totalKeys}`);
            console.log(`      所有Props�? ${finding.allKeys.join(', ')}`);
            console.log(`      消息相关�?(${finding.msgKeys.length}�?: ${finding.msgKeys.join(', ')}`);
            console.log(`      数据样本:`);
            Object.entries(finding.sample).forEach(([k, v]) => {
              console.log(`        📌 ${k}: ${v}`);
            });
            console.log('');
          });
        });
      } else {
        console.log(`  �?未找到消息数据\n`);
      }
    }

    console.log('='.repeat(80));
    console.log('分析完成！浏览器将保持打开 120 �?);
    console.log('='.repeat(80) + '\n');

    await page.waitForTimeout(120000);

    await context.close();
    console.log('�?完成\n');

  } catch (error) {
    console.error('\n�?出错:', error.message);
    console.error(error.stack);
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

clickAndAnalyze().catch(err => {
  console.error('脚本失败:', err);
  process.exit(1);
});
