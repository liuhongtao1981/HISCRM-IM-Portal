/**
 * 交互式调试模板
 *
 * 用途：
 * - 快速验证选择器和 DOM 结构
 * - 测试数据提取逻辑
 * - 调试 React Fiber 访问
 * - 验证 API 拦截
 *
 * 使用方法：
 * 1. 复制此文件：cp debug-template.js debug-my-feature.js
 * 2. 修改 SITE_URL 指向你要测试的页面
 * 3. 运行：node debug-template.js
 * 4. 浏览器中手动完成登录/导航
 * 5. 按照提示在 Node.js 调试终端中测试代码
 */

const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// ============ 配置 ============

// 调整以下参数用于不同的测试场景
const CONFIG = {
  SITE_URL: 'https://www.douyin.com/',  // 目标网站
  HEADLESS: false,                        // 显示浏览器窗口
  SLOW_MO: 100,                          // 操作延迟（毫秒），便于观察
  TIMEOUT: 30000,                        // 页面加载超时
  VIEWPORT: { width: 1920, height: 1080 },
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// ============ 调试工具类 ============

class DebugHelper {
  constructor(page) {
    this.page = page;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * 截图保存到本地
   */
  async screenshot(filename = 'debug.png') {
    const screenshotPath = path.join(__dirname, 'screenshots', filename);
    const dir = path.dirname(screenshotPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`✅ 截图已保存：${screenshotPath}`);
    return screenshotPath;
  }

  /**
   * 执行选择器查询
   *
   * 示例：
   *   await debug.querySelector('.comment-item')
   *   await debug.querySelector('.comment-item', true)  // 获取所有
   */
  async querySelector(selector, all = false) {
    try {
      if (all) {
        const elements = await this.page.$$(selector);
        console.log(`✅ 找到 ${elements.length} 个匹配元素`);

        // 显示前 3 个元素的属性
        for (let i = 0; i < Math.min(3, elements.length); i++) {
          const html = await elements[i].evaluate(el => el.outerHTML.slice(0, 200));
          console.log(`[${i}]`, html, '...');
        }
        return elements;
      } else {
        const element = await this.page.$(selector);
        if (element) {
          const html = await element.evaluate(el => el.outerHTML);
          console.log(`✅ 找到元素：\n${html.slice(0, 500)}`);
          return element;
        } else {
          console.log(`❌ 未找到匹配元素：${selector}`);
          return null;
        }
      }
    } catch (err) {
      console.error(`❌ 查询失败：${err.message}`);
      return null;
    }
  }

  /**
   * 执行 JavaScript 代码获取数据
   *
   * 示例：
   *   await debug.evaluate(() => {
   *     return document.querySelectorAll('.comment-item').length;
   *   })
   */
  async evaluate(fn, ...args) {
    try {
      const result = await this.page.evaluate(fn, ...args);
      console.log(`✅ 执行结果：`, result);
      return result;
    } catch (err) {
      console.error(`❌ 执行失败：${err.message}`);
      return null;
    }
  }

  /**
   * 访问 React Fiber（用于虚拟列表）
   *
   * 示例：
   *   await debug.accessReactFiber('element-id')
   */
  async accessReactFiber(elementId) {
    try {
      const data = await this.page.evaluate((id) => {
        const element = typeof id === 'string'
          ? document.getElementById(id)
          : document.querySelector(id);

        if (!element) return { error: '元素不存在' };

        // 访问 React Fiber - 尝试多种可能的属性名
        let fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber'));
        if (!fiberKey) {
          fiberKey = Object.keys(element).find(key => key.startsWith('__react'));
        }

        if (!fiberKey) return { error: 'Fiber 不存在', availableKeys: Object.keys(element).filter(k => k.startsWith('_')) };

        const fiber = element[fiberKey];

        return {
          fiberKey,
          memoizedState: fiber?.memoizedState,
          memoizedProps: fiber?.memoizedProps,
          child: fiber?.child,
          return: fiber?.return,
        };
      }, elementId);

      console.log(`✅ Fiber 数据：`, JSON.stringify(data, null, 2));
      return data;
    } catch (err) {
      console.error(`❌ Fiber 访问失败：${err.message}`);
      return null;
    }
  }

  /**
   * 监听网络请求
   *
   * 示例：
   *   await debug.listenToRequests('api.douyin.com')
   */
  async listenToRequests(filter = null) {
    const requests = [];

    this.page.on('request', request => {
      if (!filter || request.url().includes(filter)) {
        console.log(`📤 请求：${request.method()} ${request.url().slice(0, 80)}`);
        requests.push({
          method: request.method(),
          url: request.url(),
          timestamp: new Date().toISOString(),
        });
      }
    });

    this.page.on('response', response => {
      if (!filter || response.url().includes(filter)) {
        console.log(`📥 响应：${response.status()} ${response.url().slice(0, 80)}`);
      }
    });

    console.log(`✅ 开始监听网络请求` + (filter ? `（过滤：${filter}）` : ''));
    return requests;
  }

  /**
   * 交互式命令行界面
   *
   * 输入命令测试代码，例如：
   *   > let els = await this.page.$$('.comment-item')
   *   > els.length
   */
  async interactive() {
    console.log(`
╔════════════════════════════════════════════════════════╗
║      🔧 Playwright 交互式调试 - 命令行模式             ║
╚════════════════════════════════════════════════════════╝

📌 快捷命令：
  • s('filename')                 - 截图
  • q('.selector')                - 查询单个元素
  • qa('.selector')               - 查询所有元素
  • e(() => {...})                - 执行 JS 代码
  • f('id')                       - 访问 React Fiber
  • l('filter')                   - 监听网络请求
  • help                          - 显示帮助
  • exit                          - 退出

💡 快速测试示例：
  > qa('.comment-item')
  ✅ 找到 5 个匹配元素

  > let items = await this.page.$$('.comment-item')
  > items.length

  > await e(() => document.querySelectorAll('.comment-item').length)
  ✅ 执行结果：5

🔍 高级用法：
  > await this.page.goto('https://...')
  > await this.page.click('button')
  > await this.page.fill('input', 'text')
  > await this.page.waitForSelector('.new-element')

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);

    // 快捷命令别名
    const shortcuts = {
      s: (name) => this.screenshot(name || 'debug.png'),
      q: (sel) => this.querySelector(sel, false),
      qa: (sel) => this.querySelector(sel, true),
      e: (fn) => this.evaluate(fn),
      f: (id) => this.accessReactFiber(id),
      l: (filter) => this.listenToRequests(filter),
    };

    return new Promise((resolve) => {
      const askQuestion = () => {
        this.rl.question('> ', async (input) => {
          const trimmed = input.trim();

          if (trimmed === 'exit') {
            console.log('👋 退出调试...');
            resolve();
            return;
          }

          if (trimmed === 'help') {
            console.log(`
🎯 快捷命令：
  s(name)      - 截图
  q(selector)  - 查询单个元素
  qa(selector) - 查询所有元素
  e(fn)        - 执行 JavaScript
  f(id)        - 访问 React Fiber
  l(filter)    - 监听网络请求

📚 this 对象的所有方法：
  - screenshot(name)
  - querySelector(selector, all)
  - evaluate(fn)
  - accessReactFiber(elementId)
  - listenToRequests(filter)

🌐 page 对象（Playwright）：
  - this.page.goto(url)
  - this.page.click(selector)
  - this.page.fill(selector, text)
  - this.page.waitForSelector(selector)
  - this.page.content()
  - this.page.url()
  - this.page.$$(selector)  - 查询所有
  - this.page.innerText(selector)
            `);
            askQuestion();
            return;
          }

          try {
            // 检查是否是快捷命令
            const match = trimmed.match(/^(\w+)\((.*)\)$/);
            if (match) {
              const cmd = match[1];
              const args = match[2].trim();

              if (shortcuts[cmd]) {
                if (cmd === 'e') {
                  // 特殊处理 evaluate 命令
                  const fn = new Function('return ' + args);
                  const result = await this.evaluate(fn());
                } else if (cmd === 'f') {
                  await shortcuts[cmd](args.replace(/['"]/g, ''));
                } else if (cmd === 's') {
                  await shortcuts[cmd](args.replace(/['"]/g, '') || undefined);
                } else if (cmd === 'l') {
                  await shortcuts[cmd](args.replace(/['"]/g, '') || null);
                } else {
                  await shortcuts[cmd](args.replace(/['"]/g, ''));
                }
                askQuestion();
                return;
              }
            }

            // 构建可执行的代码
            const code = `(async () => { return ${input} })()`;
            const result = await eval(code);
            console.log(`✅ 结果：`, result);
          } catch (err) {
            console.error(`❌ 错误：${err.message}`);
          }

          askQuestion();
        });
      };

      askQuestion();
    });
  }

  close() {
    this.rl.close();
  }
}

// ============ 主调试流程 ============

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════╗
║    🚀 Playwright 交互式调试 - 抖音平台开发调试         ║
╚════════════════════════════════════════════════════════╝

🔧 配置：
  • 网站：${CONFIG.SITE_URL}
  • 视口：${CONFIG.VIEWPORT.width}x${CONFIG.VIEWPORT.height}
  • 浏览器窗口：${CONFIG.HEADLESS ? '隐藏' : '显示'}

⏳ 启动浏览器...
  `);

  const browser = await chromium.launch({
    headless: CONFIG.HEADLESS,
    slowMo: CONFIG.SLOW_MO,
  });

  const context = await browser.newContext({
    viewport: CONFIG.VIEWPORT,
    userAgent: CONFIG.USER_AGENT,
  });

  const page = await context.newPage();
  const debug = new DebugHelper(page);

  try {
    // 导航到网站
    console.log(`📍 导航到 ${CONFIG.SITE_URL}...`);
    await page.goto(CONFIG.SITE_URL, { waitUntil: 'networkidle' }).catch(() => {
      console.log('⚠️  页面加载超时，继续进行...');
    });

    console.log(`✅ 页面已加载，浏览器窗口已打开`);
    console.log(`
📋 后续步骤：
  1️⃣  在浏览器窗口中完成你的操作（登录、导航、等等）
  2️⃣  完成后，回到此终端窗口
  3️⃣  输入命令测试代码
  4️⃣  输入 'exit' 关闭调试
    `);

    // 进入交互式命令行
    await debug.interactive();

  } finally {
    debug.close();
    await context.close();
    await browser.close();
    console.log('✅ 浏览器已关闭');
  }
}

// 错误处理
process.on('unhandledRejection', err => {
  console.error('❌ 未处理的错误：', err);
  process.exit(1);
});

// 运行
main().catch(err => {
  console.error('❌ 调试出错：', err);
  process.exit(1);
});
