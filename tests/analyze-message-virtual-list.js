/**
 * 分析抖音私信消息虚拟列表 - 使用全新浏览器目�? *
 * 目标�? * 1. 打开浏览器并导航到私信页�? * 2. 等待30秒让用户手动点击一个会�? * 3. 分析右侧消息列表的虚拟列表结�? * 4. 深度搜索 React Fiber 树找到消息数据的实际属性名
 */

const { chromium } = require('playwright');
const path = require('path');

async function analyzeMessageVirtualList() {
  console.log('\n' + '='.repeat(80));
  console.log('抖音私信消息虚拟列表分析（使用全新浏览器目录�?);
  console.log('='.repeat(80) + '\n');

  // 使用全新的测试目录，避免 Worker 的损坏数�?  const userDataDir = path.join(__dirname, '../test-browser-data-manual');

  let context;
  try {
    console.log('启动浏览器（全新配置�?..');
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    console.log('�?浏览器已启动\n');

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    // 导航到私信页�?    console.log('导航到私信页�?..');
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(3000);
    console.log('�?页面已加载\n');

    // 提示用户操作
    console.log('='.repeat(80));
    console.log('请在接下来的 30 秒内完成以下操作�?);
    console.log('  1. 如果需要，请登录抖音创作者平�?);
    console.log('  2. 点击左侧的一个会�?);
    console.log('  3. 确保右侧显示了消息列�?);
    console.log('  4. 可以滚动一下消息列表加载更多消�?);
    console.log('='.repeat(80));
    console.log('');

    // 倒计�?    for (let i = 30; i > 0; i -= 5) {
      console.log(`还剩 ${i} �?..`);
      await page.waitForTimeout(5000);
    }

    console.log('\n开始分�?..\n');
    console.log('='.repeat(80));

    // 步骤 1: 查找所有的虚拟列表容器
    console.log('步骤 1: 查找所有虚拟列表容�?);
    console.log('='.repeat(80) + '\n');

    const allContainers = await page.evaluate(() => {
      const containers = [];

      // 查找所�?role="grid" 元素
      const grids = document.querySelectorAll('[role="grid"]');

      grids.forEach((grid, index) => {
        const rect = grid.getBoundingClientRect();
        const innerContainer = grid.children[0];

        containers.push({
          index,
          type: 'role=grid',
          className: grid.className,
          position: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          childCount: innerContainer ? innerContainer.children.length : 0,
          innerClassName: innerContainer ? innerContainer.className : '(�?',
          // 获取第一个子元素的文本预览来判断内容
          firstChildText: innerContainer && innerContainer.children[0]
            ? innerContainer.children[0].textContent.substring(0, 80).replace(/\s+/g, ' ')
            : '(�?'
        });
      });

      return containers;
    });

    console.log(`找到 ${allContainers.length} 个虚拟列表容器\n`);

    allContainers.forEach(container => {
      console.log(`容器 #${container.index}:`);
      console.log(`  类型: ${container.type}`);
      console.log(`  类名: ${container.className}`);
      console.log(`  位置: x=${container.position.x}, y=${container.position.y}, 尺寸=${container.position.width}×${container.position.height}`);
      console.log(`  内部容器: ${container.innerClassName}`);
      console.log(`  子元素数: ${container.childCount}`);
      console.log(`  第一个子元素文本: ${container.firstChildText}`);
      console.log('');
    });

    // 步骤 2: 深度分析每个容器
    console.log('='.repeat(80));
    console.log('步骤 2: 深度分析每个容器�?React Fiber 结构');
    console.log('='.repeat(80) + '\n');

    for (let containerIdx = 0; containerIdx < allContainers.length; containerIdx++) {
      console.log(`\n【分析容�?#${containerIdx}】\n`);

      const analysis = await page.evaluate((idx) => {
        const grids = document.querySelectorAll('[role="grid"]');
        const grid = grids[idx];

        if (!grid || !grid.children[0]) {
          return { error: '容器或内部容器不存在' };
        }

        const innerContainer = grid.children[0];
        const children = Array.from(innerContainer.children);

        // 深度搜索 React Fiber �?        function deepSearchFiber(fiber, depth = 0, maxDepth = 15, path = '') {
          if (!fiber || depth > maxDepth) return [];

          const findings = [];

          if (fiber.memoizedProps) {
            const props = fiber.memoizedProps;
            const allKeys = Object.keys(props);

            // 查找所有可能的消息相关属�?            const messageRelatedKeys = allKeys.filter(key => {
              const lowerKey = key.toLowerCase();
              return lowerKey.includes('message') ||
                     lowerKey.includes('content') ||
                     lowerKey.includes('text') ||
                     lowerKey.includes('msg') ||
                     lowerKey.includes('conversation') ||
                     lowerKey.includes('sender') ||
                     lowerKey.includes('user') ||
                     lowerKey.includes('time') ||
                     lowerKey.includes('id') ||
                     lowerKey.includes('data');
            });

            if (messageRelatedKeys.length > 0) {
              const sampleData = {};

              // 获取这些键的值（限制长度�?              messageRelatedKeys.forEach(key => {
                const value = props[key];
                if (value === null || value === undefined) {
                  sampleData[key] = `(${typeof value})`;
                } else if (typeof value === 'object') {
                  // 如果是对象，显示其类型和�?                  const objKeys = Object.keys(value);
                  sampleData[key] = `{object: ${objKeys.slice(0, 5).join(', ')}${objKeys.length > 5 ? '...' : ''}}`;
                } else {
                  sampleData[key] = String(value).substring(0, 100);
                }
              });

              findings.push({
                path: path || 'root',
                depth,
                totalPropsCount: allKeys.length,
                messageRelatedKeys,
                sampleData,
                allPropsKeys: allKeys.slice(0, 20) // 只保存前20个键�?              });
            }
          }

          // 递归子节�?          if (fiber.child) {
            findings.push(...deepSearchFiber(fiber.child, depth + 1, maxDepth, path + '.child'));
          }

          // 递归兄弟节点（仅在前3层）
          if (depth < 3 && fiber.sibling) {
            findings.push(...deepSearchFiber(fiber.sibling, depth + 1, maxDepth, path + '.sibling'));
          }

          return findings;
        }

        const allFindings = [];

        // 分析�?0个子元素
        for (let i = 0; i < Math.min(10, children.length); i++) {
          const child = children[i];
          const fiberKey = Object.keys(child).find(key => key.startsWith('__react'));

          if (fiberKey) {
            const findings = deepSearchFiber(child[fiberKey], 0, 15, `element[${i}]`);
            allFindings.push(...findings);
          }
        }

        return {
          totalChildren: children.length,
          analyzedCount: Math.min(10, children.length),
          findings: allFindings
        };
      }, containerIdx);

      if (analysis.error) {
        console.log(`  �?错误: ${analysis.error}\n`);
        continue;
      }

      console.log(`  子元素总数: ${analysis.totalChildren}`);
      console.log(`  已分�? �?${analysis.analyzedCount} 个`);
      console.log(`  找到包含消息相关数据的节�? ${analysis.findings.length}\n`);

      if (analysis.findings.length > 0) {
        console.log(`  ✅✅�?发现消息相关数据！\n`);

        // 显示�?个发�?        analysis.findings.slice(0, 5).forEach((finding, idx) => {
          console.log(`  发现 #${idx + 1}:`);
          console.log(`    路径: ${finding.path}`);
          console.log(`    深度: ${finding.depth}`);
          console.log(`    总Props�? ${finding.totalPropsCount}`);
          console.log(`    所有Props�?(�?0�?: ${finding.allPropsKeys.join(', ')}`);
          console.log(`    消息相关�?(${finding.messageRelatedKeys.length}�?: ${finding.messageRelatedKeys.join(', ')}`);
          console.log(`    数据样本:`);
          Object.entries(finding.sampleData).forEach(([key, value]) => {
            console.log(`      📌 ${key}: ${value}`);
          });
          console.log('');
        });

        if (analysis.findings.length > 5) {
          console.log(`  ... 还有 ${analysis.findings.length - 5} 个发现未显示\n`);
        }
      } else {
        console.log(`  �?未找到消息相关数据\n`);
      }
    }

    console.log('='.repeat(80));
    console.log('分析完成�?);
    console.log('='.repeat(80));
    console.log('\n浏览器将保持打开 90 秒，请手动检查页�?..\n');

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

analyzeMessageVirtualList().catch(err => {
  console.error('脚本失败:', err);
  process.exit(1);
});
