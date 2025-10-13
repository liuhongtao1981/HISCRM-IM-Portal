# Phase Real-4 登录流程测试指南

## 系统状态

✅ 所有服务已成功启动：

| 服务 | 状态 | 地址 | 备注 |
|------|------|------|------|
| Master | 运行中 | http://localhost:3000 | Socket.IO /admin 命名空间已就绪 |
| Worker | 运行中 | worker-1cea876e | BrowserManager + LoginHandler 已初始化 |
| Admin Web | 运行中 | http://localhost:3001 | React 应用已编译完成 |

## 测试流程

### 第一步：访问管理平台

1. 打开浏览器，访问：http://localhost:3001
2. 你应该看到管理平台的仪表板

### 第二步：查看账户列表

1. 点击左侧菜单的"账户管理"
2. 你应该看到现有账户列表（已有 1 个账户：acc-8eac7c30-1fc2-4036-81f9-dcf605b132f8）
3. 该账户已分配给 Worker: worker-1cea876e

### 第三步：触发登录流程

1. 在账户列表中，找到账户"dy-test-001"（抖音测试账户）
2. 点击该账户行的"启动登录"按钮
3. 确认对话框，点击"确定"

### 第四步：观察登录流程

**预期行为：**

1. **Worker 端**（后台日志）：
   - DouyinLoginHandler 收到登录请求
   - 启动 Playwright 浏览器（非 Headless 模式可见浏览器窗口）
   - 打开抖音主页：https://www.douyin.com
   - 点击登录按钮
   - 等待二维码出现
   - 截取二维码图片并转换为 Base64
   - 通过 Socket.IO 发送 `worker:login:qrcode:ready` 事件到 Master

2. **Master 端**（后台日志）：
   - 收到 `worker:login:qrcode:ready` 事件
   - LoginHandler 处理并更新 login_sessions 表
   - 通过 /admin 命名空间广播 `login:qrcode:ready` 事件到 Admin Web

3. **Admin Web 端**（前端）：
   - 收到 `login:qrcode:ready` 事件
   - 自动弹出 QR Code Modal 对话框
   - 显示二维码图片
   - 显示 5 分钟倒计时进度条
   - 提示管理员用手机抖音扫码

4. **扫码后**：
   - Worker 端每 2 秒检测登录状态（URL 变化、用户元素、Cookies）
   - 检测到登录成功后发送 `worker:login:success` 事件
   - Master 更新 login_sessions 状态为 'success'
   - Master 更新 accounts 表的 login_status、cookies_valid_until
   - Master 保存浏览器 storage state 到 worker_contexts 表
   - Admin Web 收到 `login:success` 通知

### 第五步：验证登录结果

1. 在"登录管理"页面查看登录会话记录
2. 验证登录状态是否为"成功"
3. 在"账户管理"页面查看账户的登录状态是否更新

## API 端点测试

### 测试 Workers API

```bash
# 获取 Worker 列表
curl http://localhost:3000/api/v1/workers

# 获取单个 Worker
curl http://localhost:3000/api/v1/workers/worker-1cea876e
```

### 测试 Proxies API

```bash
# 获取代理列表
curl http://localhost:3000/api/v1/proxies

# 创建代理
curl -X POST http://localhost:3000/api/v1/proxies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试代理",
    "server": "127.0.0.1:8080",
    "protocol": "http",
    "country": "CN"
  }'

# 测试代理连接
curl -X POST http://localhost:3000/api/v1/proxies/{proxy_id}/test
```

## 已完成的功能

✅ **Phase Real-1: 数据模型和基础设施**
- login_sessions 表（登录会话）
- worker_contexts 表（浏览器上下文）
- proxies 表（代理配置）
- accounts 表新增字段（login_status, cookies_valid_until, login_method）
- LoginHandler 类（Master 端）
- Socket.IO /admin 命名空间

✅ **Phase Real-2: Worker Playwright 集成**
- BrowserManager（浏览器生命周期管理）
- DouyinLoginHandler（抖音登录自动化）
- QR 码提取和上报
- 登录状态检测（URL、元素、Cookies）
- Storage State 持久化
- 5 种反检测措施

✅ **Phase Real-3: 管理平台 Web UI**
- Dashboard 页面
- AccountsPage（账户 CRUD + 登录触发）
- QRCodeModal（二维码显示 + 倒计时）
- LoginManagementPage（登录会话管理）
- WorkersPage（Worker 节点查看）
- ProxiesPage（代理配置管理）
- WebSocket 实时通信

✅ **Phase Real-4: Master 端完善**
- Worker 登录事件处理（qrcode/success/failed）
- Workers API 端点（GET /api/v1/workers）
- Proxies API 端点（完整 CRUD + 测试）

## 后续步骤

📋 **Phase Real-5: 测试和优化**（待完成）
- 端到端登录流程测试
- 错误场景测试（二维码过期、网络失败等）
- 性能优化

📋 **Phase Real-6: 文档和部署**（待完成）
- 完整部署文档
- 配置说明
- 故障排查指南

## 注意事项

1. **Headless 模式**：默认情况下，Worker 使用 headless: false（可见浏览器），方便调试。生产环境可以通过环境变量 `HEADLESS=true` 启用无头模式。

2. **二维码有效期**：抖音二维码通常 5 分钟内有效，过期后需要重新触发登录。

3. **代理支持**：目前 Proxy 功能已实现 API 端点，但尚未集成到 Worker 的浏览器启动流程中（Phase Real-5 任务）。

4. **数据库**：数据库已迁移到 v2.0，包含所有新表和字段。

5. **日志监控**：建议在测试时同时观察三个服务的后台日志输出，以便跟踪整个登录流程。

## 故障排查

### 问题1：浏览器没有启动
- 检查 Worker 日志是否有 Playwright 错误
- 确认 Playwright Chromium 已安装：`npx playwright install chromium`

### 问题2：QR 码没有弹出
- 检查 Admin Web 的 WebSocket 连接状态（Console）
- 检查 Master 日志是否收到 `worker:login:qrcode:ready` 事件
- 检查 Worker 日志是否成功发送事件

### 问题3：登录检测失败
- 抖音页面结构可能已更改，需要更新 DouyinLoginHandler 中的选择器
- 检查 Worker 日志中的错误信息

## 测试检查清单

- [ ] Master 服务正常启动
- [ ] Worker 服务正常启动并连接到 Master
- [ ] Admin Web 前端可以访问
- [ ] 可以查看账户列表
- [ ] 可以触发登录流程
- [ ] 浏览器成功打开抖音页面
- [ ] 二维码成功提取并显示在前端
- [ ] 扫码后登录状态正确更新
- [ ] Workers API 正常返回数据
- [ ] Proxies API 正常返回数据
- [ ] 可以创建和测试代理

---

**当前版本：** Phase Real-4 完成
**最后更新：** 2025-10-12
**系统状态：** 所有服务运行中
