# 私信回复调试检查清单

使用此清单系统地诊断和解决回复问题。

## ✅ 系统准备

- [ ] Master运行在DEBUG模式 (`npm start` with .env.debug)
- [ ] Worker自动启动并连接到Master
- [ ] 测试账户已登录 (`loginStatus === "logged_in"`)
- [ ] 从API获取到可用的私信列表

**验证命令:**
```bash
# 检查系统状态
curl http://127.0.0.1:3000/api/debug/browser-status

# 检查Worker
curl http://127.0.0.1:3000/api/debug/workers
```

## 🧪 第一阶段: 基础流程验证

### P1.1 - API端点测试
- [ ] POST /api/v1/replies 接受请求
- [ ] 返回唯一的 reply_id
- [ ] 数据库中有回复记录

**测试命令:**
```bash
curl -X POST http://127.0.0.1:3000/api/v1/replies \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "checklist-001",
    "account_id": "acc-35199aa6-967b-4a99-af89-c122bf1f5c52",
    "target_type": "direct_message",
    "target_id": "7437896255660017187",
    "reply_content": "检查清单测试"
  }'
```

记录 reply_id: ________________

### P1.2 - 回复状态查询
- [ ] 回复状态从 pending 变为 executing
- [ ] 可以通过 GET /api/v1/replies/:replyId 查询

**测试命令:**
```bash
curl http://127.0.0.1:3000/api/v1/replies/reply-XXX
```

预期状态: executing (或 success/failed)

### P1.3 - Master日志检查
- [ ] Master日志显示转发消息给Worker
- [ ] 搜索: "✅ Forwarded reply to worker"

**验证步骤:**
```bash
# 查看Master日志末尾
tail -50 packages/master/logs/master.log | grep -i "forward\|reply"
```

## 🔍 第二阶段: Worker交互诊断

### P2.1 - Worker进程状态
- [ ] Worker进程正在运行 (PID存在)
- [ ] Worker心跳活跃
- [ ] Worker与Master保持连接

**验证步骤:**
```bash
# 检查Worker是否在线
curl http://127.0.0.1:3000/api/debug/workers | grep -A5 '"status".*"online"'
```

### P2.2 - Browser DevTools连接
- [ ] Chrome DevTools Protocol 在 9222 端口可用
- [ ] 能看到浏览器标签页列表
- [ ] 能连接到worker1的浏览器

**验证步骤:**
1. 打开浏览器访问 http://localhost:9222
2. 查看是否有可用的标签页
3. 选择并连接到其中一个

### P2.3 - DOM元素检查

**通过DevTools Console检查这些元素是否存在:**

```javascript
// 1. 检查私信列表项
document.querySelectorAll('[role="grid"] [role="listitem"]').length > 0

// 2. 检查输入框
document.querySelector('div[contenteditable="true"]') !== null

// 3. 检查发送按钮
Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('发送')) !== undefined

// 4. 检查对话容器
document.querySelector('[class*="chat"]') !== null
document.querySelector('[class*="message"]') !== null
```

记录结果:
- 私信列表项存在: [ ] 是 [ ] 否
- 输入框存在: [ ] 是 [ ] 否
- 发送按钮存在: [ ] 是 [ ] 否
- 对话容器存在: [ ] 是 [ ] 否

### P2.4 - 页面加载状态

**在DevTools Console检查:**
```javascript
// 检查页面是否完全加载
document.readyState // 应该是 'complete'

// 检查是否有loading指示
document.querySelector('[class*="loading"]') === null

// 检查是否有error/modal
document.querySelector('[role="alert"]') === null
document.querySelector('[class*="modal"]') === null
```

## 🐛 第三阶段: 浏览器交互模拟

### P3.1 - 手动走流程

**在DevTools Console逐步执行:**

```javascript
// 1. 点击第一个消息
const items = document.querySelectorAll('[role="grid"] [role="listitem"]');
if (items.length > 0) {
  items[0].click();
  console.log('✓ Clicked first message');
}

// 等待2秒后继续

// 2. 查找输入框
const input = document.querySelector('div[contenteditable="true"]');
console.log('Input found:', input !== null);

// 3. 模拟输入
if (input) {
  input.textContent = 'Manual test input';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  console.log('✓ Input filled');
}

// 等待1秒后继续

// 4. 点击发送
const sendBtn = Array.from(document.querySelectorAll('button'))
  .find(btn => btn.textContent.includes('发送'));
if (sendBtn && !sendBtn.disabled) {
  sendBtn.click();
  console.log('✓ Send button clicked');
} else {
  console.log('✗ Send button not found or disabled');
}
```

记录结果:
- [ ] 消息项被点击
- [ ] 输入框找到并可填充
- [ ] 发送按钮找到且已启用
- [ ] 消息被发送

## 📊 第四阶段: 问题定位

### P4.1 - 检查错误信息

**页面上查找这些关键词:**
- [ ] "无法" - 表示禁止
- [ ] "失败" - 表示操作失败
- [ ] "error" / "Error" - 表示错误
- [ ] "禁" / "限制" - 表示被限制
- [ ] "超出" - 表示超限
- [ ] "blocked" / "restricted" - 表示被拦截

**在DevTools Console:**
```javascript
// 查找所有error/alert元素
const errorSelectors = [
  '[class*="error"]',
  '[class*="alert"]',
  '[role="alert"]',
  '[class*="tip"]',
  '[class*="toast"]',
  '[class*="notification"]'
];

let errors = [];
errorSelectors.forEach(selector => {
  document.querySelectorAll(selector).forEach(el => {
    if (el.textContent.trim()) {
      errors.push({
        class: el.className,
        text: el.textContent.substring(0, 100)
      });
    }
  });
});

console.table(errors);
```

### P4.2 - 网络请求检查

**在DevTools Network标签:**
- [ ] 能看到DM API请求
- [ ] 没有 5xx 服务器错误
- [ ] 没有 401/403 认证/权限错误
- [ ] 没有 429 速率限制错误

### P4.3 - Console错误检查

**在DevTools Console标签:**
- [ ] 没有红色JavaScript错误
- [ ] 没有CSP (Content Security Policy) 违规
- [ ] 没有CORS错误

## ✍️ 第五阶段: 日志分析

### P5.1 - Worker日志检查

**查找这些关键日志:**
```bash
grep -i "reply\|replyToDirectMessage\|message item\|input field\|send button" packages/worker/logs/worker.log | tail -50
```

记录找到的关键日志:
- [ ] 回复执行开始
- [ ] 消息定位成功/失败
- [ ] 输入框定位成功/失败
- [ ] 发送按钮定位成功/失败
- [ ] 错误堆栈跟踪

### P5.2 - Master日志检查

```bash
grep -i "reply\|execute" packages/master/logs/master.log | tail -20
```

记录找到的关键日志:
- [ ] 回复创建
- [ ] 回复转发
- [ ] 回复结果接收

## 🛠️ 第六阶段: 修复建议

### 如果消息定位失败

**问题表现:** 日志显示 "Failed to locate message"

**解决方案:**
1. 检查 `findMessageItemInVirtualList()` 实现
2. 验证搜索条件 (conversation_title, sender_name等)
3. 可能需要调整虚拟列表查询逻辑

**文件:** packages/worker/src/platforms/douyin/platform.js

### 如果输入框定位失败

**问题表现:** 日志显示 "Message input field not found"

**解决方案:**
1. 新增选择器以匹配现有UI
2. 使用更灵活的查询方法 (如 XPath)
3. 可能需要等待更长时间让输入框出现

**文件:** packages/worker/src/platforms/douyin/platform.js:2781-2801

### 如果发送按钮定位失败

**问题表现:** 日志显示 "Send button not found"

**解决方案:**
1. 验证按钮文本是否仍然是"发送"
2. 尝试使用Enter键作为备选
3. 增加超时等待时间

**文件:** packages/worker/src/platforms/douyin/platform.js:2821-2850

### 如果收到反爬虫或限制提示

**问题表现:** `dmReplyStatus.hasError === true`

**解决方案:**
1. 增加请求间隔
2. 使用代理
3. 清除cookies并重新登录
4. 分析具体错误信息并相应调整

## 📋 完成记录

**测试时间:** ________________
**测试者:** ________________
**发现的主要问题:**

```
(记录发现的最主要问题)
```

**建议的修复步骤:**
```
1. ...
2. ...
3. ...
```

**下一步行动:**
- [ ] 修复已识别的问题
- [ ] 再次测试回复功能
- [ ] 验证日志显示成功
- [ ] 更新文档

**最终状态:**
- [ ] 回复功能完全工作
- [ ] 所有私信都能成功回复
- [ ] 没有错误日志
