# 评论API问题分析与测试建议

## 更新时间
2025-11-27

## 问题现象

从Worker日志观察到以下情况：

### 1. 大部分作品评论数为0（优化功能正常）
```
作品 7576912411052100870: 评论数为0，跳过抓取 ✅
```
这是我们的优化功能在正常工作，直接跳过API调用。

### 2. 少数作品统计显示有评论但API返回0
```
作品 7546443951457193266: 0 条评论 (1 页)
作品 7546071794759863598: 0 条评论 (1 页)
作品 7545692307433999642: 0 条评论 (1 页)
```

这些作品的`statistics.comment_count > 0`（所以没被优化跳过），但调用评论API后返回0条。

## 可能原因分析

### 原因1: 评论已被删除（最可能） ✅
- 统计数据有延迟，评论被删除后统计未更新
- 评论被管理员/作者删除
- 评论被系统审核隐藏

### 原因2: API参数问题 ⚠️
可能存在的问题：
1. **endpoint错误**: 当前使用 `https://www.douyin.com/aweme/v1/web/comment/list/`
   - 需要验证是否为最新的API endpoint

2. **缺少必要参数**:
   ```javascript
   const params = {
       ...this.webBaseParams,
       aweme_id: awemeId,
       cursor: cursor,
       count: count,
       item_type: 0,           // ← 可能需要验证
       insert_ids: '',         // ← 可能需要移除或填充
       whale_cut_token: '',    // ← 可能需要移除或填充
       cut_version: 1,         // ← 可能需要验证
       rcFT: '',               // ← 可能需要移除或填充
       msToken: ''             // ← 可能需要从Cookie提取
   };
   ```

3. **a_bogus加密问题**:
   - 当前使用的加密算法可能已过时
   - 参数顺序或格式可能有误

### 原因3: Cookie/权限问题 ⚠️
- Cookie可能缺少某些字段
- 需要特定的会话令牌
- IP限制或反爬虫检测

## 测试方案

### 方案1: 使用真实热门作品测试 ⭐ 推荐

#### 步骤1: 在抖音网页版找一个热门作品
1. 打开 https://www.douyin.com/
2. 找一个评论数上千的热门作品
3. 复制作品ID（URL中的数字部分）

#### 步骤2: 使用浏览器开发者工具抓取真实请求
1. 打开开发者工具（F12）
2. 切换到 Network 标签
3. 访问该作品页面并查看评论
4. 找到评论API请求
5. 对比请求参数和我们的API实现

#### 步骤3: 复制真实Cookie测试
```bash
cd packages/worker
# 编辑 test-comment-api.js，填入：
# 1. 真实的作品ID
# 2. 浏览器中复制的完整Cookie
node test-comment-api.js
```

### 方案2: 修改API实现后对比测试

#### 检查endpoint是否正确
当前实现：
```javascript
commentList: 'https://www.douyin.com/aweme/v1/web/comment/list/'
```

可能的替代endpoint：
```javascript
// 移动端API
'https://aweme.snssdk.com/aweme/v1/comment/list/'

// 创作者中心API
'https://creator.douyin.com/aweme/v1/creator/comment/list/'

// Web版其他变体
'https://www.douyin.com/aweme/v2/comment/list/'
```

#### 检查必要参数
参考抖音最新API，可能需要：
```javascript
{
    device_platform: 'webapp',
    aid: '6383',
    aweme_id: workId,
    cursor: 0,
    count: 20,
    // 可能需要的额外参数
    msToken: extractFromCookie(cookie, 'msToken'),
    verifyFp: extractFromCookie(cookie, 'verifyFp'),
    fp: extractFromCookie(cookie, 'fp')
}
```

### 方案3: 使用Playwright拦截对比 ⭐ 最准确

创建一个Playwright脚本，访问真实作品页面，拦截评论API请求：

```javascript
// test-real-api.js
const { chromium } = require('playwright');

async function interceptRealAPI() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    // 拦截所有comment/list请求
    page.on('request', request => {
        const url = request.url();
        if (url.includes('comment/list')) {
            console.log('评论API请求:');
            console.log('  URL:', url);
            console.log('  Headers:', request.headers());
        }
    });

    page.on('response', async response => {
        const url = response.url();
        if (url.includes('comment/list')) {
            const data = await response.json();
            console.log('评论API响应:');
            console.log('  数据:', JSON.stringify(data, null, 2));
        }
    });

    // 访问一个有评论的热门作品
    await page.goto('https://www.douyin.com/video/作品ID');
    await page.waitForTimeout(5000);

    await browser.close();
}
```

## 验证当前API是否工作

### 最简单的验证方法

在 `crawler-api.js` 的 `fetchCommentsForWork` 方法中添加完整响应日志：

```javascript
const result = await this.douyinAPI.fetchComments(...);

// 添加这行
logger.warn(`[调试] 作品${workId}完整API响应: ${JSON.stringify(result, null, 2)}`);
```

然后观察日志中的完整响应结构。

## 推荐操作步骤

1. **立即验证**（5分钟）:
   - 在浏览器中找一个评论数>100的热门作品
   - 打开F12，查看Network中的comment/list请求
   - 对比URL参数和我们的实现

2. **修改测试**（10分钟）:
   - 使用上面的测试脚本，填入真实Cookie和作品ID
   - 运行测试，查看能否获取到评论

3. **修复API**（如果确认有问题）:
   - 更新endpoint
   - 补充缺失参数
   - 更新a_bogus加密逻辑

## 当前账户的特殊情况

根据日志分析，当前测试账户（临终关怀志愿者-宝哥）的106个作品：
- ✅ 大部分作品评论数确实为0（真实情况）
- ⚠️  少数作品（约5-10个）统计显示有评论但API返回0

**建议**:
1. 使用一个评论活跃的账户进行测试（如热门博主账户）
2. 或者手动给当前账户的作品添加一些测试评论

## 参考资料

- 抖音开放平台API文档: https://developer.open-douyin.com/
- 评论相关接口说明（需要企业认证）
- 第三方抖音API分析（GitHub搜索 "douyin comment api"）

---

**文档版本**: v1.0
**最后更新**: 2025-11-27
**维护者**: HISCRM-IM 开发团队
