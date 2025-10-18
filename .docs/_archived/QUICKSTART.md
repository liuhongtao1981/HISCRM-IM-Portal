# 快速开始指南

5分钟快速启动 HisCrm-IM 系统

---

## 1. 环境检查 ✅

```bash
# 检查 Node.js 版本 (需要 18.x)
node --version
# 输出: v18.x.x

# 检查 npm
npm --version
```

---

## 2. 安装依赖 📦

```bash
# 在项目根目录
npm install
```

---

## 3. 启动系统 🚀

### 终端 1: 启动 Master

```bash
cd packages/master
npm start
```

**看到这个表示成功**:
```
╔═══════════════════════════════════════════╗
║  Master Server Started                    ║
║  Port: 3000                               ║
╚═══════════════════════════════════════════╝
```

### 终端 2: 启动 Worker

```bash
cd packages/worker
npm start
```

**看到这个表示成功**:
```
╔═══════════════════════════════════════════╗
║  Worker Ready                             ║
╚═══════════════════════════════════════════╝
✓ Connected to master
✓ Registered with master (1 accounts assigned)
```

---

## 4. 测试登录流程 🔐

### 创建测试脚本

新建文件 `quick-test-login.js`:

```javascript
const io = require('socket.io-client');

// 连接到 Admin
const socket = io('http://localhost:3000/admin');

socket.on('connect', () => {
  console.log('✓ 已连接到 Master');

  // 认证
  socket.emit('admin:auth', {
    username: 'admin',
    password: 'admin123'
  });
});

socket.on('admin:auth:success', () => {
  console.log('✓ 认证成功');

  // 发起登录 (使用测试账号)
  socket.emit('admin:login:start', {
    account_id: 'acc-8eac7c30-1fc2-4036-81f9-dcf605b132f8',
    session_id: `test-${Date.now()}`
  });
});

// 监听二维码
socket.on('login:qrcode:ready', (data) => {
  console.log('\n✓ 二维码已就绪!');
  console.log('- Session ID:', data.session_id);
  console.log('- QR Code 大小:', data.qr_code_data.length, 'bytes');
  console.log('\n请在浏览器窗口中扫描二维码...\n');
});

// 监听二维码刷新
socket.on('login:qrcode:refreshed', (data) => {
  console.log('\n🔄 二维码已刷新 (第', data.refresh_count, '次)');
});

// 监听登录成功
socket.on('login:success', (data) => {
  console.log('\n🎉 登录成功!');
  console.log('- Account ID:', data.account_id);
  console.log('- Cookies 有效期:', new Date(data.cookies_valid_until * 1000));
  process.exit(0);
});

// 监听登录失败
socket.on('login:failed', (data) => {
  console.error('\n❌ 登录失败!');
  console.error('- 错误:', data.error_message);
  console.error('- 类型:', data.error_type);
  process.exit(1);
});

socket.on('connect_error', (error) => {
  console.error('❌ 连接失败:', error.message);
  process.exit(1);
});
```

### 运行测试

```bash
node quick-test-login.js
```

**预期输出**:
```
✓ 已连接到 Master
✓ 认证成功
✓ 二维码已就绪!
- Session ID: test-1760213024496
- QR Code 大小: 67060 bytes

请在浏览器窗口中扫描二维码...

[用户扫描二维码后]

🎉 登录成功!
- Account ID: acc-8eac7c30-1fc2-4036-81f9-dcf605b132f8
- Cookies 有效期: 2025-10-19T12:00:00.000Z
```

---

## 5. 验证功能 ✅

### 测试错误处理和重试

新建文件 `test-retry.js`:

```javascript
const { RetryStrategy } = require('./packages/shared/utils/retry-strategy');

async function testRetry() {
  const strategy = new RetryStrategy({
    maxRetries: 3,
    baseDelay: 500,
  });

  let attempt = 0;

  try {
    await strategy.retry(async () => {
      attempt++;
      console.log(`尝试 #${attempt}`);

      if (attempt < 3) {
        throw new Error('模拟失败');
      }

      console.log('✓ 成功!');
    });
  } catch (error) {
    console.error('❌ 最终失败:', error.message);
  }
}

testRetry();
```

```bash
node test-retry.js
```

**预期输出**:
```
尝试 #1
[retry-strategy] warn: attempt 1 failed, retrying in 426ms
尝试 #2
[retry-strategy] warn: attempt 2 failed, retrying in 1052ms
尝试 #3
✓ 成功!
```

### 测试错误分类

新建文件 `test-error-classifier.js`:

```javascript
const { ErrorClassifier, ErrorTypes } = require('./packages/shared/utils/error-handler');

const testCases = [
  new Error('net::ERR_CONNECTION_REFUSED'),
  new Error('Timeout 30000ms exceeded'),
  new Error('Navigation timeout'),
];

testCases.forEach((error, i) => {
  const type = ErrorClassifier.classify(error);
  console.log(`${i + 1}. "${error.message}" → ${type}`);
});
```

```bash
node test-error-classifier.js
```

**预期输出**:
```
1. "net::ERR_CONNECTION_REFUSED" → network_error
2. "Timeout 30000ms exceeded" → timeout_error
3. "Navigation timeout" → navigation_timeout
```

---

## 6. 查看系统状态 📊

### 检查 Workers

```bash
curl http://localhost:3000/api/workers | json_pp
```

### 检查账号

```bash
curl http://localhost:3000/api/accounts | json_pp
```

### 查看日志

```bash
# Master 日志
tail -f packages/master/logs/master.log

# Worker 日志
tail -f packages/worker/logs/worker.log
```

---

## 7. 停止系统 🛑

```bash
# 在各个终端按 Ctrl+C

# 或使用 PM2 (如果使用)
pm2 stop all
```

---

## 常见问题 ❓

### Q: Master 启动失败,提示端口被占用

**A**: 修改端口
```bash
# 临时修改
PORT=3001 npm start

# 或编辑配置文件
# packages/master/src/config.js
PORT: 3001
```

### Q: Worker 无法连接 Master

**A**: 检查 Master 是否运行
```bash
# 测试连接
curl http://localhost:3000/api/workers

# 如果失败,检查 Master 日志
```

### Q: 浏览器无法启动

**A**: 安装 Playwright 浏览器
```bash
npx playwright install chromium
```

### Q: 二维码不显示

**A**: 开启可见浏览器模式调试
```javascript
// packages/worker/src/browser/browser-manager.js
headless: false
```

---

## 下一步 📚

- 📖 阅读完整文档: `SYSTEM_USAGE_GUIDE.md`
- 🔧 了解配置: `packages/master/src/config.js`
- 🐛 查看已知问题: `TESTING_COMPLETE.md`
- 💡 查看实现细节: `ERROR_HANDLING_IMPLEMENTATION_COMPLETE.md`

---

## 需要帮助? 🆘

- 查看日志文件
- 检查 GitHub Issues
- 联系技术支持

---

**祝你使用愉快! 🎉**
