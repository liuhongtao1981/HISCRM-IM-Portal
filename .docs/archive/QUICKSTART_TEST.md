# 快速测试启动指南

**⚡ 5分钟快速验证系统功能**

## 方法1: 自动化测试（推荐）

### 安装依赖（首次运行）

```bash
# 如果您有 pnpm
pnpm install

# 如果没有 pnpm，先安装
npm install -g pnpm
pnpm install

# 或直接使用 npm
npm install
```

### 运行所有测试

```bash
# 运行全部 86 个测试
npm test

# 或
pnpm test
```

**预期结果**: 所有测试通过 ✅

```
Test Suites: 12 passed, 12 total
Tests:       86 passed, 86 total
Snapshots:   0 total
Time:        XX.XXXs
```

### 运行特定测试套件

```bash
# Phase 3: 账户管理 (14 tests)
npm test -- packages/master/tests/contract/accounts.test.js

# Phase 4: 实时监控 (23 tests)
npm test -- packages/worker/tests/contract/message-detection.test.js

# Phase 5: 多客户端通知 (23 tests)
npm test -- packages/desktop-client/tests/contract/notifications.test.js

# Phase 6: 消息历史与统计 (26 tests)
npm test -- packages/master/tests/contract/messages.test.js
```

---

## 方法2: 手动验证（5分钟完整流程）

### 步骤1: 启动 Master（终端1）

```bash
cd packages/master
npm start
```

✅ 等待看到: `Master Server Started` 和 `Port: 3000`

### 步骤2: 启动 Worker（终端2）

```bash
cd packages/worker
npm start
```

✅ 等待看到: `Worker registered successfully`

### 步骤3: 启动桌面客户端（终端3）

```bash
cd packages/desktop-client
npm start
```

✅ 等待 Electron 窗口打开

### 步骤4: 快速功能验证

#### 4.1 添加账户 (30秒)

1. 点击"添加账户"按钮
2. 填写：
   - 账户名称: 测试账户
   - 账户ID: test-001
   - 用户名: test
   - 密码: test123
3. 点击"确定"

✅ 账户出现在列表中，状态为"监控中"

#### 4.2 接收通知 (1分钟)

1. 等待约30秒（Worker 会自动生成Mock数据）
2. 观察右上角通知铃铛

✅ 铃铛显示未读数字徽章
✅ 系统弹出桌面通知

#### 4.3 查看通知 (30秒)

1. 点击通知铃铛
2. 查看通知列表

✅ 显示评论和私信通知
✅ 不同类型用不同颜色标签

#### 4.4 查看历史 (1分钟)

**注意**: 需要先添加路由导航，或直接访问页面。当前版本需要手动修改代码来测试 HistoryPage。

临时测试方法：
1. 打开浏览器开发者工具
2. 在控制台执行：
```javascript
// 模拟API请求
fetch('http://localhost:3000/api/v1/messages?page=1&limit=20')
  .then(r => r.json())
  .then(console.log)
```

✅ 返回消息列表

#### 4.5 查看统计 (30秒)

```javascript
// 在浏览器控制台
fetch('http://localhost:3000/api/v1/statistics?group_by=day&days=7')
  .then(r => r.json())
  .then(console.log)
```

✅ 返回统计数据

---

## 方法3: API 测试（使用 curl）

### 健康检查

```bash
curl http://localhost:3000/health
```

预期: `{"status":"ok",...}`

### 系统状态

```bash
curl http://localhost:3000/api/v1/status
```

预期: 返回 workers, clients, notifications 统计

### 账户管理

```bash
# 创建账户
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "douyin",
    "account_name": "测试账户",
    "account_id": "test-001",
    "credentials": {
      "username": "test",
      "password": "test123"
    }
  }'

# 查询账户
curl http://localhost:3000/api/v1/accounts
```

### 消息历史

```bash
# 查询所有消息
curl "http://localhost:3000/api/v1/messages?page=1&limit=10"

# 按类型筛选
curl "http://localhost:3000/api/v1/messages?type=comment"
```

### 统计数据

```bash
# 总体统计
curl "http://localhost:3000/api/v1/statistics"

# 每日趋势
curl "http://localhost:3000/api/v1/statistics?group_by=day&days=7"

# 简要统计
curl "http://localhost:3000/api/v1/statistics/summary"
```

---

## 常见问题

### Q: pnpm 命令找不到？

```bash
# 安装 pnpm
npm install -g pnpm

# 或使用 npm 代替
npm install
npm test
npm start
```

### Q: 端口 3000 被占用？

修改 `packages/master/.env`:
```
PORT=3001
```

### Q: 测试失败？

```bash
# 清理并重新安装
rm -rf node_modules package-lock.json
npm install
npm test
```

### Q: Worker 无法连接 Master？

检查 `packages/worker/.env`:
```
MASTER_URL=http://localhost:3000
```

### Q: 桌面客户端无法连接？

检查 `packages/desktop-client/.env`:
```
REACT_APP_MASTER_URL=http://localhost:3000
```

---

## 测试检查清单

### 自动化测试 ✅

- [ ] Phase 1-2: 基础设施 (27 tests)
- [ ] Phase 3: 账户管理 (14 tests)
- [ ] Phase 4: 实时监控 (23 tests)
- [ ] Phase 5: 多客户端通知 (23 tests)
- [ ] Phase 6: 消息历史与统计 (26 tests)

**总计**: 86+ tests

### 手动验证 ✅

- [ ] Master 服务启动成功
- [ ] Worker 注册成功
- [ ] 桌面客户端启动成功
- [ ] 添加账户成功
- [ ] 接收通知成功
- [ ] 查看通知列表成功
- [ ] API 调用成功

---

## 下一步

完成测试后，您可以：

1. **查看详细报告**: 参见 `E2E_TEST_GUIDE.md`
2. **继续开发**: 实施 Phase 7 (通知规则) 或 Phase 8 (Polish)
3. **部署系统**: 参见 `DEPLOYMENT.md`（待创建）

---

## 测试完成标志

✅ 所有自动化测试通过
✅ 手动验证核心流程成功
✅ API 端点响应正常
✅ 无控制台错误
✅ 数据库数据正确

**恭喜！系统已准备就绪！** 🎉
