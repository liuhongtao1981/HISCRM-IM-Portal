# 解决Playwright浏览器版本检测问题

## 问题描述

使用Playwright驱动浏览器访问抖音时,页面提示"浏览器版本过低",这是抖音的反爬虫机制。

## 原因分析

1. **自动化特征检测**: 抖音检测到`navigator.webdriver`为`true`
2. **浏览器指纹**: 缺少真实浏览器的特征(如chrome对象、plugins等)
3. **User-Agent过旧**: Playwright默认的UA版本较老
4. **无头模式特征**: 无头浏览器有明显的检测特征

## 解决方案

### 方案1: 使用增强版Playwright爬虫 (推荐)

已创建 `douyin-crawler-playwright.js`,包含以下反检测措施:

#### 1. 启动配置优化

```javascript
const browser = await chromium.launch({
  headless: false, // 使用有头模式
  args: [
    '--disable-blink-features=AutomationControlled', // 关键!禁用自动化特征
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',
    '--window-size=1920,1080',
  ],
  ignoreDefaultArgs: ['--enable-automation'], // 忽略自动化参数
});
```

#### 2. 注入反检测脚本

```javascript
await context.addInitScript(() => {
  // 删除webdriver标识
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
  });

  // 添加chrome对象
  window.chrome = { runtime: {} };

  // 修改plugins
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
  });

  // 修改语言
  Object.defineProperty(navigator, 'languages', {
    get: () => ['zh-CN', 'zh', 'en'],
  });
});
```

#### 3. 使用最新User-Agent

```javascript
userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
```

### 方案2: 使用Puppeteer-Extra (替代方案)

如果Playwright效果不好,可以切换到Puppeteer + stealth插件:

```bash
npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth
```

```javascript
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const browser = await puppeteer.launch({
  headless: false,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
```

### 方案3: 使用真实浏览器Profile

```javascript
const context = await browser.newContext({
  // 使用真实浏览器的用户数据目录
  storageState: './user-data/douyin-session.json',
});
```

## 使用步骤

### 1. 切换到Playwright实现

修改 `monitor-task.js` 或 `task-runner.js`:

```javascript
// const DouyinCrawler = require('../crawlers/douyin-crawler'); // Mock版本
const DouyinCrawler = require('../crawlers/douyin-crawler-playwright'); // Playwright版本
```

### 2. 安装Playwright浏览器

```bash
npx playwright install chromium
```

### 3. 首次登录获取Cookie

运行爬虫时,浏览器会打开(有头模式),手动登录抖音:

1. 浏览器自动打开
2. 访问抖音登录页面
3. 扫码或账号密码登录
4. 登录成功后,Cookie会自动保存
5. 后续访问会复用Cookie

### 4. 调试模式

如果仍然遇到问题,可以截图调试:

```javascript
const crawler = new DouyinCrawlerPlaywright();
await crawler.initialize(account);
await crawler.screenshot('debug-page.png');
```

## 进阶优化

### 1. 添加随机延迟

```javascript
// 模拟人类操作延迟
await page.waitForTimeout(1000 + Math.random() * 2000);
```

### 2. 模拟鼠标移动

```javascript
await page.mouse.move(100, 100);
await page.mouse.move(300, 300);
```

### 3. 滚动页面

```javascript
await page.evaluate(() => {
  window.scrollBy(0, window.innerHeight / 2);
});
```

### 4. 使用代理IP (如果被封)

```javascript
const context = await browser.newContext({
  proxy: {
    server: 'http://proxy-server:port',
    username: 'user',
    password: 'pass',
  },
});
```

## 常见问题

### Q1: 仍然提示浏览器版本低

**解决**:
1. 确保使用有头模式 `headless: false`
2. 更新Playwright到最新版本: `npm update playwright`
3. 检查User-Agent是否使用最新版本(Chrome 120+)

### Q2: 页面加载很慢

**解决**:
1. 增加超时时间: `timeout: 60000`
2. 使用 `waitUntil: 'domcontentloaded'` 而不是 `networkidle`

### Q3: 登录后Cookie丢失

**解决**:
1. 保存浏览器上下文状态:
```javascript
await context.storageState({ path: './session.json' });
```

2. 下次启动时加载:
```javascript
const context = await browser.newContext({
  storageState: './session.json',
});
```

### Q4: 被检测为自动化

**解决**:
1. 降低爬取频率(60秒以上)
2. 添加随机操作(鼠标移动、滚动)
3. 使用真实浏览器的Cookie和LocalStorage

## 测试验证

运行测试脚本验证:

```bash
node packages/worker/src/crawlers/test-douyin-crawler.js
```

或在Worker启动时观察日志:

```bash
npm run dev:worker
```

检查日志输出,确认没有"浏览器版本过低"的错误。

## 参考资料

- [Playwright反检测](https://playwright.dev/docs/emulation)
- [Puppeteer Stealth插件](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)
- [浏览器指纹检测](https://abrahamjuliot.github.io/creepjs/)

---

**注意**: 本方案仅用于监控自己的账户通知,请勿用于非法爬取或侵犯他人隐私。
