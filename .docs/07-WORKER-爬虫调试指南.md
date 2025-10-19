# Worker 爬虫调试指南

> 本指南提供在本地开发环境调试 Playwright 爬虫脚本的实践方法，特别适用于开发新平台时的选择器验证、DOM 结构分析和数据提取调试。

---

## 📋 目录

1. [快速开始](#快速开始)
2. [调试方案对比](#调试方案对比)
3. [方案 A：本地交互式调试](#方案-a本地交互式调试)
4. [方案 B：远程连接调试](#方案-b远程连接调试)
5. [常见调试场景](#常见调试场景)
6. [最佳实践](#最佳实践)

---

## 快速开始

### 推荐工作流

```bash
# 1. 创建测试脚本
cd packages/worker/src/platforms/douyin
cp debug-template.js debug-my-feature.js

# 2. 运行交互式调试
node debug-my-feature.js

# 3. 在浏览器中完成操作（登录、导航等）

# 4. 在 Node.js 调试脚本中测试 DOM 查询和数据提取

# 5. 集成到平台代码
```

---

## 调试方案对比

| 方案 | 适用场景 | 优点 | 缺点 |
|------|--------|------|------|
| **A：本地交互式** | 开发新平台、调试选择器、验证 DOM | 快速、无网络依赖、安全 | 需要手动交互 |
| **B：远程 DevTools** | 生产环境问题诊断、复杂流程跟踪 | 完整 DevTools 功能 | 网络依赖、安全风险 |

**推荐：日常开发使用方案 A，遇到复杂问题使用方案 B**

---

## 方案 A：本地交互式调试

### 核心概念

本方案在本地启动一个 **单个浏览器实例**，由你手动完成网站交互（登录、导航），同时在 Node.js 脚本中：
- 查询和测试 DOM 选择器
- 执行 JavaScript 提取数据
- 验证 Fiber 访问逻辑
- 调试数据解析算法

### 实现步骤

#### 1. 创建调试脚本模板

创建 [packages/worker/src/platforms/douyin/debug-template.js](../../packages/worker/src/platforms/douyin/debug-template.js)：

```javascript
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
 * 3. 运行：node debug-my-feature.js
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
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
        const element = document.getElementById(id);
        if (!element) return { error: '元素不存在' };

        // 访问 React Fiber
        const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber'));
        if (!fiberKey) return { error: 'Fiber 不存在' };

        const fiber = element[fiberKey];
        return {
          memoizedState: fiber.memoizedState,
          elementData: fiber.memoizedProps,
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
║         🔧 Playwright 交互式调试 - 命令行模式            ║
╚════════════════════════════════════════════════════════╝

📌 可用命令：
  • screenshot('filename.png')    - 截图
  • querySelector('.selector')    - 查询单个元素
  • querySelector('.selector', true) - 查询所有元素
  • evaluate(() => {...})         - 执行 JS 代码
  • accessReactFiber('id')        - 访问 React Fiber
  • listenToRequests('filter')    - 监听网络请求
  • help                          - 显示帮助
  • exit                          - 退出

💡 快速测试：
  const items = await this.page.$$('.comment-item')
  items.length

  const text = await items[0]?.innerText()
  console.log(text)

🔍 查看浏览器中的完整 HTML：
  await this.page.content()

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);

    return new Promise((resolve) => {
      const askQuestion = () => {
        this.rl.question('> ', async (input) => {
          if (input === 'exit') {
            console.log('👋 退出调试...');
            resolve();
            return;
          }

          if (input === 'help') {
            console.log(`
Available methods:
  - await this.screenshot(name)
  - await this.querySelector(selector, all)
  - await this.evaluate(fn)
  - await this.accessReactFiber(elementId)
  - await this.listenToRequests(filter)
  - await this.page.goto(url)
  - await this.page.click(selector)
  - await this.page.fill(selector, text)
  - await this.page.waitForSelector(selector)
  - await this.page.content()
            `);
            askQuestion();
            return;
          }

          try {
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
║    🚀 Playwright 交互式调试 - 抖音平台开发调试        ║
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

// 运行
main().catch(err => {
  console.error('❌ 调试出错：', err);
  process.exit(1);
});
```

#### 2. 运行调试脚本

```bash
# 进入 worker 目录
cd packages/worker

# 运行调试脚本
node src/platforms/douyin/debug-template.js
```

**输出示例：**
```
╔════════════════════════════════════════════════════════╗
║    🚀 Playwright 交互式调试 - 抖音平台开发调试        ║
╚════════════════════════════════════════════════════════╝

🔧 配置：
  • 网站：https://www.douyin.com/
  • 视口：1920x1080
  • 浏览器窗口：显示

⏳ 启动浏览器...
✅ 页面已加载，浏览器窗口已打开

📋 后续步骤：
  1️⃣  在浏览器窗口中完成你的操作（登录、导航、等等）
  2️⃣  完成后，回到此终端窗口
  3️⃣  输入命令测试代码
  4️⃣  输入 'exit' 关闭调试

>
```

#### 3. 在浏览器中操作

- 登录抖音账户
- 导航到评论区、私信等页面
- 让页面加载完成

#### 4. 在终端中测试代码

```javascript
// 查询评论选择器
> await this.querySelector('.comment-item', true)
✅ 找到 5 个匹配元素

// 提取第一条评论的文本
> const comments = await this.page.$$('.comment-item')
> await comments[0].innerText()
"用户名: 很好用的应用！"

// 访问 React Fiber（虚拟列表数据）
> await this.accessReactFiber('comment-list-container')
✅ Fiber 数据：{ ... }

// 执行自定义 JS 提取数据
> await this.evaluate(() => {
    const items = document.querySelectorAll('.comment-item');
    return Array.from(items).map(item => ({
      text: item.textContent,
      author: item.querySelector('.author-name')?.textContent
    }));
  })
✅ 结果：[...]

// 监听特定 API 请求
> await this.listenToRequests('api.douyin.com')
📤 请求：GET https://api.douyin.com/v1/feed/?...

// 截图当前页面
> await this.screenshot('comments-page.png')
✅ 截图已保存：...
```

---

## 方案 B：远程连接调试

> 当本地调试无法复现某些问题时，可以连接到远程运行的 Worker 进程

### 前置条件

1. 安装 Chrome DevTools MCP 服务器
2. Worker 中启用调试端口

### 修改 Worker 支持调试

编辑 [packages/worker/src/browser/browser-manager-v2.js](../../packages/worker/src/browser/browser-manager-v2.js)：

```javascript
async launchBrowserForAccount(accountId, proxyConfig) {
  // 为每个账户分配唯一的调试端口
  const accountIndex = parseInt(accountId.split('-')[1] || '0', 10);
  const debugPort = 9222 + accountIndex;

  const launchOptions = {
    headless: process.env.DEBUG_HEADLESS !== 'true',
    args: [
      `--user-data-dir=${this.dataDir}/browser_${accountId}`,
      `--remote-debugging-port=${debugPort}`,  // ✨ 添加这行
      '--disable-blink-features=AutomationControlled',
      ...(proxyConfig ? this.getProxyArgs(proxyConfig) : []),
    ],
  };

  const browser = await chromium.launch(launchOptions);

  // 记录调试端口
  logger.info(`Browser for ${accountId} listening on port ${debugPort}`);

  return browser;
}
```

### 连接远程浏览器

```javascript
// 使用 Chrome DevTools MCP
// 连接到 localhost:9222（本地 Worker）或配置 SSH 隧道连接远程 Worker

// 在你的 Claude Code 中：
// /mcp connect chrome-devtools 127.0.0.1:9222
```

---

## 常见调试场景

### 场景 1：验证选择器是否有效

**问题：** 新平台的 DOM 选择器不工作

**调试方法：**

```javascript
// 步骤 1：导航到页面
> await this.page.goto('https://target-site.com/comments')

// 步骤 2：逐个测试选择器
> await this.querySelector('.comment-item', true)  // 查询评论
> await this.querySelector('.user-avatar')         // 查询头像
> await this.querySelector('.comment-text')        // 查询文本

// 步骤 3：截图保存选择器失败的页面
> await this.screenshot('selector-debug.png')

// 步骤 4：查看实际 HTML 结构
> const html = await this.page.content()
> console.log(html)
```

### 场景 2：调试虚拟列表中的数据提取

**问题：** React 虚拟列表中某些评论无法提取

**调试方法：**

```javascript
// 步骤 1：找到虚拟列表容器
> await this.querySelector('#comment-list')

// 步骤 2：访问 React Fiber
> const fiberData = await this.accessReactFiber('comment-list')

// 步骤 3：检查 memoizedState 中的列表数据
> fiberData.memoizedState

// 步骤 4：执行滚动加载更多内容
> await this.page.evaluate(() => {
    document.querySelector('#comment-list').scrollTop = 99999;
  })

// 步骤 5：等待新内容加载
> await this.page.waitForTimeout(2000)

// 步骤 6：再次提取数据
> await this.evaluate(() => document.querySelectorAll('.comment-item').length)
```

### 场景 3：调试登录流程

**问题：** 登录后页面卡住或重定向失败

**调试方法：**

```javascript
// 步骤 1：导航到登录页
> await this.page.goto('https://platform.com/login')

// 步骤 2：监听网络请求
> await this.listenToRequests()

// 步骤 3：填充表单
> await this.page.fill('input[name="username"]', 'testuser')
> await this.page.fill('input[name="password"]', 'testpass')

// 步骤 4：提交并监控重定向
> await this.page.click('button[type="submit"]')
> await this.page.waitForNavigation({ waitUntil: 'networkidle' })

// 步骤 5：验证登录结果
> await this.page.url()
> await this.screenshot('after-login.png')
```

### 场景 4：调试 API 响应数据格式

**问题：** 直接从 API 获取的数据格式与预期不符

**调试方法：**

```javascript
// 步骤 1：导航到触发 API 请求的页面
> await this.page.goto('https://api.platform.com/comments?id=123')

// 步骤 2：监听 JSON API 请求
> const requests = []
> this.page.on('response', async response => {
    if (response.url().includes('/api/')) {
      const json = await response.json()
      requests.push(json)
    }
  })

// 步骤 3：触发 API 请求（可能通过点击或滚动）
> await this.page.click('button.load-more')

// 步骤 4：检查响应格式
> requests[0]
```

---

## 最佳实践

### 1. 创建平台特定的调试脚本

为每个新平台创建自己的调试脚本：

```bash
packages/worker/src/platforms/
├── douyin/
│   ├── debug-template.js          # 通用模板
│   ├── debug-comments.js          # 评论提取调试
│   ├── debug-direct-messages.js   # 私信提取调试
│   └── debug-login.js             # 登录流程调试
│
├── xiaohongshu/
│   ├── debug-template.js
│   ├── debug-comments.js
│   └── ...
```

### 2. 保存有用的调试代码片段

在每个调试脚本中保留有用的代码片段注释：

```javascript
/**
 * 常用代码片段
 *
 * 提取所有评论：
 *   const comments = await this.page.$$('.comment-item');
 *   const data = await this.evaluate(() => {...});
 *
 * 检查虚拟列表：
 *   await this.accessReactFiber('list-id');
 *
 * 验证登录：
 *   await this.page.url();
 */
```

### 3. 自动化常见任务

创建辅助函数简化常见操作：

```javascript
class DebugHelper {
  // ... 现有代码 ...

  async extractComments() {
    return await this.evaluate(() => {
      return Array.from(document.querySelectorAll('.comment-item')).map(el => ({
        text: el.textContent,
        author: el.querySelector('.author')?.textContent,
      }));
    });
  }

  async checkLoginStatus() {
    const url = await this.page.url();
    return url.includes('/home') ? 'logged_in' : 'not_logged_in';
  }
}
```

### 4. 将调试代码集成到平台

调试完成后，将验证过的代码集成到平台类：

```javascript
// platforms/douyin/platform.js
class DouyinPlatform extends PlatformBase {
  async crawlComments(account) {
    // 使用调试过的选择器和数据提取逻辑
    const comments = await this.evaluate(() => {
      // ... 调试时测试过的代码
    });
    return comments;
  }
}
```

### 5. 记录选择器变化

抖音、小红书等平台频繁更改 DOM 结构，保留记录：

```javascript
/**
 * 选择器版本历史
 *
 * v1.0 (2025-01-01): 使用 .comment-item
 * v1.1 (2025-01-15): DOM 重构，改为 .feed-item
 * v1.2 (2025-02-01): React 虚拟列表，使用 React Fiber
 *
 * 当选择器失效时，检查此列表
 */
```

---

## 常见问题解决

### Q1：浏览器闪现后立即关闭

**原因：** 脚本执行太快，浏览器来不及加载页面

**解决：**
```javascript
const CONFIG = {
  // ... 增加这个
  SLOW_MO: 500,  // 操作延迟 500ms
};

// 或手动等待
await this.page.waitForTimeout(5000);
```

### Q2：无法找到元素

**原因：** 选择器不正确或元素未加载

**解决：**
```javascript
// 方法 1：等待元素加载
await this.page.waitForSelector('.comment-item', { timeout: 10000 });

// 方法 2：尝试不同的选择器
await this.querySelector('[data-testid="comment"]', true);
await this.querySelector('[aria-label="comment"]', true);

// 方法 3：检查 iframe
const frames = this.page.frames();
for (const frame of frames) {
  const element = await frame.$('.comment-item');
  if (element) console.log('找到了！', frame.name());
}
```

### Q3：React Fiber 访问失败

**原因：** 元素不是 React 渲染或 Fiber 属性名不同

**解决：**
```javascript
// 检查所有可能的 Fiber 属性
await this.evaluate(() => {
  const el = document.querySelector('.comment-item');
  const fiberKeys = Object.keys(el).filter(k => k.includes('Fiber') || k.includes('React'));
  console.log('可用的 Fiber 属性：', fiberKeys);
});
```

### Q4：内存占用过高

**原因：** 长时间调试，浏览器缓存增多

**解决：**
```bash
# 在脚本结束后清理
await context.close();  # 关闭浏览器上下文（清理 cookies、缓存）
await browser.close();  # 关闭浏览器进程
```

---

## 总结

| 任务 | 使用方案 A | 使用方案 B |
|------|----------|----------|
| 开发新平台 | ✅ 推荐 | - |
| 验证选择器 | ✅ 推荐 | - |
| 调试数据提取 | ✅ 推荐 | ⚠️ 复杂情况 |
| 调试虚拟列表 | ✅ 推荐 | ⚠️ 复杂情况 |
| 生产环境诊断 | - | ✅ 推荐 |
| 远程问题排查 | - | ✅ 推荐 |

**即刻开始调试：** 复制 `debug-template.js`，修改 `SITE_URL`，运行 `node debug-template.js`！

---

## 参考资源

- [Worker 系统文档](./03-WORKER-系统文档-第一部分.md) - 了解 Playwright 架构
- [抖音平台实现细节](./06-DOUYIN-平台实现技术细节.md) - 了解选择器和 API
- [Playwright 官方文档](https://playwright.dev/) - Playwright API 参考
- [React DevTools](https://react-devtools-tutorial.vercel.app/) - React 调试指南
