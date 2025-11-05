/**
 * 打开浏览器，等待60秒供手动操作，然后自动分析
 */

const { chromium } = require('playwright');
const path = require('path');

async function openAndWait() {
  console.log('\n' + '='.repeat(80));
  console.log('打开浏览器供手动登录和分析');
  console.log('='.repeat(80) + '\n');

  const userDataDir = path.join(__dirname, '../test-browser-data-manual');

  let context;
  try {
    console.log('启动浏览器...');
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    console.log('✅ 浏览器已启动\n');

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    console.log('导航到抖音私信页面...');
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(2000);
    console.log('✅ 页面已加载\n');

    console.log('='.repeat(80));
    console.log('请在接下来的 60 秒内完成以下操作：');
    console.log('  1. 扫码登录抖音创作者平台（如果需要）');
    console.log('  2. 点击左侧的一个会话');
    console.log('  3. 确保右侧显示了消息列表');
    console.log('='.repeat(80) + '\n');

    // 倒计时
    for (let i = 60; i > 0; i -= 10) {
      console.log(`还剩 ${i} 秒...`);
      await page.waitForTimeout(10000);
    }

    console.log('\n开始分析...\n');

    // 查找虚拟列表容器
    console.log('='.repeat(80));
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

    if (containers.length === 0) {
      console.log('❌ 没有找到虚拟列表容器\n');
      console.log('可能原因：');
      console.log('  - 还没有点击会话');
      console.log('  - 页面结构已改变\n');
    } else {
      containers.forEach(c => {
        console.log(`容器 #${c.index}:`);
        console.log(`  位置: (${c.position.x}, ${c.position.y}), 尺寸: ${c.position.width}×${c.position.height}`);
        console.log(`  类名: ${c.className}`);
        console.log(`  内部容器: ${c.innerClassName}`);
        console.log(`  子元素数: ${c.childCount}`);
        console.log(`  第一个子元素: ${c.firstChildText}`);
        console.log('');
      });

      // 深度分析
      console.log('='.repeat(80));
      console.log('深度分析 React Fiber 结构');
      console.log('='.repeat(80) + '\n');

      for (let containerIdx = 0; containerIdx < containers.length; containerIdx++) {
        console.log(`\n【容器 #${containerIdx}】\n`);

        const analysis = await page.evaluate((idx) => {
          const grids = document.querySelectorAll('[role="grid"]');
          const grid = grids[idx];

          if (!grid || !grid.children[0]) {
            return { error: '容器不存在' };
          }

          const innerContainer = grid.children[0];
          const children = Array.from(innerContainer.children);

          function deepSearch(fiber, depth = 0, maxDepth = 15) {
            if (!fiber || depth > maxDepth) return [];

            const findings = [];

            if (fiber.memoizedProps) {
              const props = fiber.memoizedProps;
              const allKeys = Object.keys(props);

              const msgKeys = allKeys.filter(k => {
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

          for (let i = 0; i < Math.min(15, children.length); i++) {
            const child = children[i];
            const fiberKey = Object.keys(child).find(k => k.startsWith('__react'));

            if (fiberKey) {
              const findings = deepSearch(child[fiberKey]);
              if (findings.length > 0) {
                allFindings.push({
                  elementIndex: i,
                  findings: findings.slice(0, 3)
                });
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
          console.log(`  ❌ ${analysis.error}\n`);
          continue;
        }

        console.log(`  子元素总数: ${analysis.totalChildren}`);
        console.log(`  包含数据的元素: ${analysis.elementsWithData}\n`);

        if (analysis.elementsWithData > 0) {
          console.log(`  ✅✅✅ 找到消息数据！\n`);

          analysis.allFindings.forEach(elem => {
            console.log(`  元素 #${elem.elementIndex}:`);

            elem.findings.forEach((finding, idx) => {
              console.log(`    发现 #${idx + 1} (深度 ${finding.depth}):`);
              console.log(`      总Props数: ${finding.totalKeys}`);
              console.log(`      所有Props键 (前30个): ${finding.allKeys.join(', ')}`);
              console.log(`      消息相关键 (${finding.msgKeys.length}个): ${finding.msgKeys.join(', ')}`);
              console.log(`      数据样本:`);
              Object.entries(finding.sample).forEach(([k, v]) => {
                console.log(`        📌 ${k}: ${v}`);
              });
              console.log('');
            });
          });
        } else {
          console.log(`  ❌ 未找到消息数据\n`);
        }
      }
    }

    console.log('='.repeat(80));
    console.log('分析完成！浏览器将保持打开 120 秒');
    console.log('='.repeat(80) + '\n');

    await page.waitForTimeout(120000);

    await context.close();
    console.log('✅ 完成\n');

  } catch (error) {
    console.error('\n❌ 出错:', error.message);
    console.error(error.stack);
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

openAndWait().catch(err => {
  console.error('脚本失败:', err);
  process.exit(1);
});
