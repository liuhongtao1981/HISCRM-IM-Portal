# Worker 管理功能说明

## 功能概述

Worker 是系统中的工作节点，负责执行具体的抖音账户监控任务。Master 服务负责管理和调度 Worker，Admin Web 提供可视化管理界面。

## Worker 管理机制

### 1. Worker 注册流程

```
Worker 启动 → 连接 Master Socket.IO → 发送注册请求 → Master 记录并分配账户
```

**注册信息**：
- `worker_id`: Worker 唯一标识
- `host`: Worker 主机地址
- `port`: Worker 服务端口
- `version`: Worker 版本
- `capabilities`: Worker 能力列表
- `max_accounts`: 最大可管理账户数

### 2. 心跳监控

- Worker 每 10 秒发送心跳包
- Master 超时阈值：30 秒
- 超过阈值标记为离线
- 自动重新分配离线 Worker 的账户

### 3. 账户分配策略

Master 自动分配账户给 Worker：
- 负载均衡：优先分配给负载较低的 Worker
- 容量限制：不超过 Worker 的 `max_accounts`
- 故障转移：离线 Worker 的账户重新分配

## Worker 管理页面功能

### 访问路径
`http://localhost:3001/workers`

### 功能特性

#### 1. 实时监控面板

**统计卡片**：
- **总 Worker 数**：系统中注册的所有 Worker
- **在线 Worker**：当前活跃的 Worker 节点
- **监控账户数**：所有 Worker 正在监控的账户总数
- **总容量使用率**：系统整体负载百分比

#### 2. Worker 列表

**显示信息**：
- Worker ID：唯一标识符
- 状态：在线/离线/错误/繁忙
- 主机端点：`host:port`
- 账户负载：进度条显示 `当前/最大`
- 最后心跳：实时心跳状态
- 版本号：Worker 版本信息
- 启动时间：Worker 启动时间戳

**状态说明**：
- 🟢 **在线**（online）：正常运行
- ⚪ **离线**（offline）：失去连接
- 🔴 **错误**（error）：运行异常
- 🔵 **繁忙**（busy）：负载较高

#### 3. Worker 详情

点击"详情"按钮查看：
- 基本信息（ID、版本、主机、端口）
- 运行状态（状态、心跳时间、启动时间）
- 负载信息（分配账户数、最大容量）
- 代理配置（如果有）
- 特殊能力（capabilities）
- 分配的账户列表

#### 4. 实时刷新

- 自动每 5 秒刷新状态
- 手动刷新按钮
- 心跳时间实时更新

## 技术实现

### 前端组件 ([WorkersPage.js](../packages/admin-web/src/pages/WorkersPage.js))

```javascript
// 主要功能
- 定时刷新（5秒）
- 状态标签可视化
- 负载进度条显示
- 详情模态框
```

### API 接口

#### GET /api/v1/workers
获取所有 Worker 列表

**响应示例**：
```json
{
  "success": true,
  "data": [
    {
      "id": "worker-1",
      "host": "localhost",
      "port": 4001,
      "status": "online",
      "assigned_accounts": 3,
      "max_accounts": 10,
      "last_heartbeat": 1697123456,
      "started_at": 1697120000,
      "version": "1.0.0",
      "capabilities": ["douyin", "multi-browser"]
    }
  ]
}
```

#### GET /api/v1/workers/:id
获取单个 Worker 详情

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "worker-1",
    "host": "localhost",
    "port": 4001,
    "status": "online",
    "assigned_accounts": 3,
    "max_accounts": 10,
    "last_heartbeat": 1697123456,
    "started_at": 1697120000,
    "version": "1.0.0",
    "capabilities": ["douyin", "multi-browser"],
    "proxy_id": "proxy-123",
    "assigned_accounts_list": [
      {
        "id": "acc-1",
        "account_name": "测试账户1",
        "platform": "douyin"
      }
    ]
  }
}
```

### 数据库表结构

**workers 表**：
```sql
CREATE TABLE workers (
  id TEXT PRIMARY KEY,          -- Worker ID
  host TEXT,                     -- 主机地址
  port INTEGER,                  -- 端口号
  status TEXT DEFAULT 'offline', -- 状态
  assigned_accounts INTEGER DEFAULT 0, -- 分配账户数
  last_heartbeat INTEGER,        -- 最后心跳时间
  started_at INTEGER,            -- 启动时间
  version TEXT,                  -- 版本号
  proxy_id TEXT,                 -- 代理 ID（可选）
  metadata TEXT                  -- JSON 元数据（capabilities等）
)
```

## Worker 启动与配置

### 环境变量 (.env)

```bash
WORKER_ID=worker-1              # Worker 唯一标识
MASTER_HOST=localhost           # Master 服务地址
MASTER_PORT=3000               # Master 服务端口
MAX_ACCOUNTS=10                # 最大管理账户数
HEADLESS=true                  # 浏览器无头模式
```

### 启动 Worker

```bash
cd packages/worker
npm start

# 或开发模式
npm run dev
```

### Worker 日志

```
packages/worker/logs/
├── worker.log         # 主日志
├── worker-error.log   # 错误日志
└── browser-*.log      # 浏览器日志
```

## 监控指标

### 性能指标
- **心跳延迟**：< 1 秒
- **账户切换时间**：< 5 秒
- **内存占用**：~200MB/账户
- **CPU 使用率**：< 50%

### 健康检查
- 心跳超时：30 秒
- 自动重连：3 次重试
- 故障恢复：< 1 分钟

## 常见问题

### 1. Worker 显示离线

**可能原因**：
- Worker 进程未启动
- 网络连接中断
- Master 服务重启

**解决方法**：
```bash
# 检查 Worker 进程
ps aux | grep worker

# 重启 Worker
cd packages/worker
npm restart

# 查看日志
tail -f logs/worker.log
```

### 2. 账户分配不均

**可能原因**：
- Worker 容量设置不一致
- 部分 Worker 离线

**解决方法**：
- 调整 `MAX_ACCOUNTS` 环境变量
- 确保所有 Worker 在线
- 手动重新分配账户

### 3. 心跳超时

**可能原因**：
- Worker 负载过高
- 网络延迟

**解决方法**：
- 减少 Worker 账户数
- 优化网络连接
- 增加心跳超时阈值

## 未来改进

1. **Worker 控制功能**
   - 远程启动/停止
   - 配置热更新
   - 日志查看

2. **高级调度策略**
   - 基于地理位置分配
   - 基于代理分组
   - 优先级队列

3. **监控增强**
   - 实时性能图表
   - 告警通知
   - 历史数据分析

## 相关文档

- [Master-Worker 架构说明](./架构设计.md)
- [账户管理说明](./账户管理功能说明.md)
- [代理管理说明](./代理密码编辑修复.md)