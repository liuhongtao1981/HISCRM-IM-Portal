# MCP浏览器测试 - 评论回复脚本验证报告

**测试时间**: 2025-12-01
**测试工具**: Playwright MCP Browser
**测试视频**: https://www.douyin.com/video/7533083869034138931

## 测试环境

- **浏览器**: Playwright (Chromium)
- **页面标题**: 临终关怀志愿者分享，老人在临终前都有哪些征兆？
- **评论数量**: 2条（德耐小吕、乐鱼吕🌙）

## 测试结果

### ✅ 成功的部分

#### 1. 页面导航和加载
```yaml
状态: 成功
- 页面URL正确加载
- DOM内容加载完成
- 评论区元素可见
```

#### 2. 评论区结构识别
```yaml
评论1:
  用户: 德耐小吕
  内容: [比心][比心][比心]
  时间: 4月前·黑龙江

评论2:
  用户: 乐鱼吕🌙
  内容: [小鼓掌][小鼓掌][小鼓掌]
  时间: 4月前·黑龙江
```

### ❌ 发现的问题

#### 问题1: React Fiber 查找评论 CID 失败

**测试代码**:
```javascript
const foundCIDs = [];
const allElements = await page.$$('div, li, span');

for (const el of allElements) {
    const fiberData = await el.evaluate((element) => {
        const fiberKey = Object.keys(element).find(key =>
            key.startsWith('__reactFiber') ||
            key.startsWith('__reactInternalInstance')
        );

        if (!fiberKey) return null;

        let fiber = element[fiberKey];
        let depth = 0;

        while (fiber && depth < 30) {
            const props = fiber.memoizedProps || fiber.pendingProps;

            if (props && props.cid) {
                return { cid: String(props.cid) };
            }

            fiber = fiber.return;
            depth++;
        }

        return null;
    });

    if (fiberData && fiberData.cid) {
        foundCIDs.push(fiberData.cid);
    }
}
```

**结果**: `foundCIDs = []` (空数组)

**原因分析**:
1. **可能原因1**: 抖音更新了 React 版本或 Fiber 结构
2. **可能原因2**: 评论数据未完全渲染到 DOM
3. **可能原因3**: CID 字段名称已更改
4. **可能原因4**: 评论列表使用虚拟滚动，当前视口外的评论未渲染

## 问题影响

### 高优先级问题

**React Fiber 查找失败会导致**:
- `findCommentByFiber()` 函数无法找到评论容器
- 无法定位回复按钮
- 二级和三级回复功能完全失效

### 受影响的功能

1. **二级回复** (`commentLevel = 2`)
   - 需要通过 `findCommentByFiber(page, replyId)` 查找一级评论
   - ❌ 会抛出错误: `未找到一级评论 ${replyId}`

2. **三级回复** (`commentLevel = 3`)
   - 需要查找一级评论和二级评论
   - ❌ 会抛出错误: `未找到一级评论 ${replyId}`

3. **一级评论** (`commentLevel = 1`)
   - ✅ 不依赖 React Fiber，应该可以正常工作

## 建议修复方案

### 方案1: 增强 React Fiber 查找逻辑

```javascript
async function findCommentByFiber(page, commentId) {
    const container = await page.evaluateHandle((cid) => {
        const allElements = document.querySelectorAll('div, li, span');

        for (const el of allElements) {
            try {
                // 尝试多种 React 内部字段名
                const possibleKeys = [
                    '__reactFiber$',
                    '__reactFiber',
                    '__reactInternalInstance$',
                    '__reactInternalInstance',
                    '_reactRootContainer'
                ];

                let fiberKey = null;
                for (const prefix of possibleKeys) {
                    const key = Object.keys(el).find(k => k.startsWith(prefix));
                    if (key) {
                        fiberKey = key;
                        break;
                    }
                }

                if (!fiberKey) continue;

                let fiber = el[fiberKey];
                let depth = 0;

                while (fiber && depth < 50) {  // 增加遍历深度
                    const props = fiber.memoizedProps || fiber.pendingProps;

                    // 检查多种可能的 CID 字段
                    if (props) {
                        const cidValue = props.cid || props.commentId ||
                                       props.id || props.comment_id;

                        if (cidValue && String(cidValue) === String(cid)) {
                            return el;
                        }
                    }

                    fiber = fiber.return;
                    depth++;
                }
            } catch (e) {
                // 继续
            }
        }

        return null;
    }, commentId);

    const element = container ? container.asElement() : null;

    if (element) {
        logger.info(`✅ 找到评论容器: ${commentId}`);
        return element;
    }

    logger.warn(`❌ 未找到评论容器: ${commentId}`);
    return null;
}
```

### 方案2: 添加 DOM 属性查找作为备选

```javascript
async function findCommentByFiber(page, commentId) {
    // 优先尝试 React Fiber
    let container = await findByFiberMethod(page, commentId);

    if (container) return container;

    // 备选方案1: 通过 data-* 属性查找
    container = await page.$(`[data-cid="${commentId}"]`);
    if (container) {
        logger.info(`✅ 通过 data-cid 找到评论: ${commentId}`);
        return container;
    }

    // 备选方案2: 通过文本内容模糊匹配
    logger.warn(`使用备选方案查找评论: ${commentId}`);
    return null;
}
```

### 方案3: 使用 API 拦截获取评论位置

```javascript
// 拦截评论列表 API
const commentsData = new Map();

await page.route('**/comment/list/**', (route) => {
    route.continue().then(async () => {
        const response = await route.request().response();
        const data = await response.json();

        if (data.comments) {
            data.comments.forEach((comment, index) => {
                commentsData.set(comment.cid, {
                    cid: comment.cid,
                    index: index,
                    level: comment.reply_id ? 2 : 1
                });
            });
        }
    });
});

// 使用位置索引定位评论
async function findCommentByIndex(page, commentId) {
    const commentInfo = commentsData.get(commentId);
    if (!commentInfo) return null;

    const comments = await page.$$('.comment-item');  // 假设的选择器
    if (comments[commentInfo.index]) {
        return comments[commentInfo.index];
    }

    return null;
}
```

## 下一步测试建议

### 1. 验证 React Fiber 结构
```javascript
// 在浏览器控制台运行
const el = document.querySelector('div');
const keys = Object.keys(el);
console.log('React keys:', keys.filter(k => k.includes('react')));
```

### 2. 检查评论元素属性
```javascript
// 找到评论元素
const comments = document.querySelectorAll('[class*="comment"]');
comments.forEach((c, i) => {
    console.log(`Comment ${i}:`, {
        attributes: Array.from(c.attributes).map(a => `${a.name}="${a.value}"`),
        textContent: c.textContent.substring(0, 50)
    });
});
```

### 3. 测试回复按钮查找
```javascript
// 测试能否找到回复按钮
const replyButtons = document.querySelectorAll('*');
for (const btn of replyButtons) {
    const text = (btn.textContent || '').trim();
    if (text === '回复' || text.includes('回复')) {
        console.log('Found reply button:', btn);
    }
}
```

## 总结

### 核心问题
**React Fiber 查找评论功能完全失效**，这会导致所有二级和三级回复功能无法使用。

### 紧急程度
🔴 **高优先级** - 需要立即修复，否则评论回复功能基本不可用。

### 建议行动
1. 使用实际的抖音账号在浏览器中测试 React Fiber 查找
2. 检查抖音是否更新了 React 版本或结构
3. 实现多层备选方案（Fiber → DOM属性 → 位置索引）
4. 添加详细的调试日志，记录查找失败的原因
