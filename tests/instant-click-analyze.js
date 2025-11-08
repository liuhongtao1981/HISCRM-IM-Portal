/**
 * 立即点击会话并分析（无等待）
 */

const { chromium } = require('playwright');
const path = require('path');

async function instantClickAnalyze() {
  console.log('\n' + '='.repeat(80));
  console.log('立即点击会话并分�?);
  console.log('='.repeat(80) + '\n');

  const userDataDir = path.join(__dirname, '../test-browser-data-manual');

  let context;
  try {
    console.log('连接到浏览器...');
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    console.log('�?已连接\n');

    const url = page.url();
    if (!url.includes('creator.douyin.com')) {
      console.log('导航到私信页�?..');
      await page.goto('https://creator.douyin.com/creator-micro/data/following/chat');
      await page.waitForTimeout(2000);
    }

    console.log('查找并点击会�?..\n');

    const clickResult = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('li, div'));

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const text = item.textContent || '';

        if (text.length > 20 && text.length < 500 &&
            !text.includes('首页') &&
            !text.includes('管理') &&
            !text.includes('数据中心')) {

          item.click();
          return { success: true, index: i, text: text.substring(0, 60) };
        }
      }

      return { success: false };
    });

    if (!clickResult.success) {
      console.log('�?未找到会话\n');
      await page.waitForTimeout(60000);
      await context.close();
      return;
    }

    console.log(`�?已点�? ${clickResult.text}...\n`);
    await page.waitForTimeout(3000);

    console.log('='.repeat(80));
    console.log('分析虚拟列表');
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
          position: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          childCount: innerContainer ? innerContainer.children.length : 0,
          innerClassName: innerContainer ? innerContainer.className : '',
          firstChildText: innerContainer && innerContainer.children[0] ? innerContainer.children[0].textContent.substring(0, 100).replace(/\s+/g, ' ') : ''
        });
      });

      return result;
    });

    console.log(`找到 ${containers.length} 个容器\n`);

    containers.forEach(c => {
      console.log(`容器 #${c.index}:`);
      console.log(`  位置: (${c.position.x}, ${c.position.y}), ${c.position.width}×${c.position.height}`);
      console.log(`  类名: ${c.className}`);
      console.log(`  子元素数: ${c.childCount}`);
      console.log(`  第一个子元素: ${c.firstChildText}`);
      console.log('');
    });

    console.log('='.repeat(80));
    console.log('深度分析 React Fiber');
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
                  sample[key] = `{${objKeys.slice(0, 8).join(', ')}${objKeys.length > 8 ? '...' : ''}}`;
                } else {
                  sample[key] = String(val).substring(0, 150);
                }
              });

              findings.push({
                depth,
                totalKeys: allKeys.length,
                msgKeys,
                sample,
                allKeys: allKeys.slice(0, 40)
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
              allFindings.push({ elementIndex: i, findings: findings.slice(0, 3) });
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
    console.log('分析完成！浏览器将保持打开 90 �?);
    console.log('='.repeat(80) + '\n');

    await page.waitForTimeout(90000);
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

instantClickAnalyze().catch(err => {
  console.error('脚本失败:', err);
  process.exit(1);
});
