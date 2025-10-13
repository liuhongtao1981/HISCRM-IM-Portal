# 系统启动指南

## 快速启动（3个终端窗口）

### 终端 1 - Master 服务

```bash
cd E:\dev\workspaces\hiscrm-im\packages\master
npm start
```

**预期输出**:
```
✅ Master Server Started
✅ Port: 3000
✅ Database initialized
✅ Socket.IO ready
```

---

### 终端 2 - Worker 节点

```bash
cd E:\dev\workspaces\hiscrm-im\packages\worker
npm start
```

**预期输出**:
```
✅ Worker started
✅ Connected to Master
✅ Worker registered successfully
✅ Monitoring tasks started
```

---

### 终端 3 - 桌面客户端

```bash
cd E:\dev\workspaces\hiscrm-im\packages\desktop-client
npm start
```

**预期输出**:
```
✅ Electron 窗口打开
✅ 显示账户管理界面
```

---

## 快速验证步骤（5分钟）

### 1. 健康检查 (30秒)

打开浏览器访问: http://localhost:3000/health

**预期**: 返回 `{"status":"ok",...}`

### 2. 添加测试账户 (1分钟)

在桌面客户端中：
1. 点击"添加账户"按钮
2. 填写：
   - 平台: 抖音
   - 账户名称: 测试账户
   - 账户ID: test-001
   - 用户名: test
   - 密码: test123
3. 点击"确定"

**预期**:
- ✅ 账户出现在列表中
- ✅ 状态显示为"监控中"
- ✅ Worker 日志显示分配了任务

### 3. 等待通知 (1分钟)

等待约 30-60 秒（Worker 会自动生成 Mock 数据）

**预期**:
- ✅ 右上角通知铃铛显示未读数字
- ✅ 系统弹出桌面通知
- ✅ Worker 日志显示检测到消息

### 4. 查看通知 (30秒)

1. 点击右上角通知铃铛
2. 查看通知列表

**预期**:
- ✅ 显示评论和私信通知
- ✅ 不同类型用不同颜色标签
- ✅ 显示发送者和内容

### 5. API 测试 (1分钟)

```bash
# 查询账户
curl http://localhost:3000/api/v1/accounts

# 查询消息历史
curl "http://localhost:3000/api/v1/messages?page=1&limit=10"

# 查询统计
curl http://localhost:3000/api/v1/statistics
```

**预期**: 所有请求返回 JSON 数据

---

## 问题排查

### Master 无法启动

```bash
# 检查端口占用
netstat -ano | findstr :3000

# 清理数据库
rm packages/master/data/hiscrm.db
```

### Worker 无法连接

检查 `packages/worker/.env`:
```
MASTER_URL=http://localhost:3000
```

### 桌面客户端无法连接

检查 `packages/desktop-client/.env`:
```
REACT_APP_MASTER_URL=http://localhost:3000
```

---

## 完整测试

运行自动化测试套件：

```bash
cd E:\dev\workspaces\hiscrm-im
npm test
```

**预期**: 88/88 tests passed ✅

---

## 停止系统

在每个终端窗口按 `Ctrl+C` 停止服务
