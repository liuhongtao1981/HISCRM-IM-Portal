# Technical Research: 社交媒体账户监控与通知系统

**Date**: 2025-10-11
**Feature**: 001-worker

## Technology Stack Decisions

### 1. Programming Language & Runtime

**Decision**: Node.js 18.x LTS

**Rationale**:
- 统一技术栈: 前端(Electron/React Native)和后端都使用JavaScript/TypeScript,降低学习成本
- 异步I/O优势: 适合处理并发的网络请求和WebSocket连接
- 丰富的生态: npm有大量成熟的第三方库支持
- 跨平台: 原生支持Windows、macOS和Linux
- 进程管理: child_process模块和PM2工具可以方便地管理Worker进程

**Alternatives Considered**:
- Python: 异步库asyncio成熟,但前后端技术栈不统一
- Go: 并发性能优秀,但前端无法复用代码
- Java: 企业级稳定,但资源占用较高,不适合嵌入式部署

---

### 2. Frontend Framework

**Decision**:
- 桌面端: Electron 28.x + React 18.x
- 移动端: React Native 0.73.x

**Rationale**:
- 代码复用: React组件和业务逻辑可在桌面和移动端共享
- 开发效率: 单一语言(JavaScript/TypeScript)开发全平台客户端
- UI组件库: Ant Design(桌面)和React Native Paper(移动)提供美观的现成组件
- 实时通信: Socket.IO客户端库成熟,支持自动重连

**Alternatives Considered**:
- Flutter: 性能优秀,但需要学习Dart语言,无法复用Node.js代码
- Qt/QML: 桌面端性能好,但移动端支持弱,开发效率低
- Tauri: 轻量级,但生态不如Electron成熟

---

### 3. Inter-Process Communication

**Decision**: Socket.IO 4.x (基于WebSocket + JSON)

**Rationale**:
- 实时双向通信: 支持主控主动推送通知给Worker和客户端
- 自动重连: 网络断开后自动重连,无需手动处理
- 房间机制: 可以方便地实现一对多通知(一个主控对多个客户端)
- 心跳检测: 内置ping/pong机制,自动检测连接健康
- 跨平台: 同时支持浏览器、Node.js、React Native

**Alternatives Considered**:
- gRPC: 性能好,但配置复杂,移动端支持不如Socket.IO
- ZeroMQ: 性能极高,但缺少自动重连和心跳,需要自己实现
- Redis Pub/Sub: 需要额外的Redis服务,增加部署复杂度
- HTTP轮询: 延迟高,资源浪费严重

---

### 4. Database

**Decision**: SQLite 3.x (better-sqlite3库)

**Rationale**:
- 零配置: 嵌入式数据库,无需独立安装和配置
- 跨平台: 支持所有目标平台
- 轻量级: 单文件存储,易于备份和迁移
- 性能: 对于单用户场景,读写性能完全满足需求
- 事务支持: ACID特性保证数据一致性

**Data Organization**:
- 主控数据库: `master/data/master.db` (账户配置、Worker注册表、通知规则)
- Worker数据库: `worker/data/worker_{id}.db` (监控任务、抓取缓存)
- 历史数据: 30天自动清理,使用DELETE + VACUUM优化

**Alternatives Considered**:
- PostgreSQL: 功能强大,但需要独立安装,对单用户场景过重
- MongoDB: 适合非结构化数据,但本项目数据结构明确,SQL更合适
- Redis: 适合缓存,但持久化和查询能力不如SQLite

---

### 5. Testing Framework

**Decision**:
- 单元/集成测试: Jest 29.x
- API测试: Supertest
- E2E测试: Playwright

**Rationale**:
- Jest: Node.js生态最流行的测试框架,开箱即用,支持并行测试
- Supertest: 与Express配合完美,方便测试REST API
- Playwright: 支持Electron和Web端E2E测试,跨浏览器兼容

**Test Coverage Goals**:
- 单元测试覆盖率: ≥ 80%
- 集成测试: 覆盖主控-Worker通信、故障恢复、任务调度
- E2E测试: 覆盖核心用户场景(账户配置、监控、通知)

---

### 6. Process Management

**Decision**: PM2 5.x (生产环境) + child_process (开发环境)

**Rationale**:
- PM2优势:
  - 自动重启: Worker崩溃后自动重启
  - 负载均衡: 支持cluster模式
  - 日志管理: 自动rotate和归档
  - 监控面板: pm2 monit实时查看进程状态
- child_process:
  - 开发简单: 无需额外安装
  - 调试方便: 直接在IDE中调试

**Process Startup Flow**:
1. 主控启动: `pm2 start packages/master/src/index.js --name master`
2. Worker启动: 主控通过PM2 API或child_process.fork启动Worker
3. 健康监控: 主控监听Worker退出事件,自动重启

---

### 7. Logging & Monitoring

**Decision**:
- 日志: Winston 3.x (JSON格式)
- 指标: 自定义指标收集(存储到SQLite)
- 监控面板: 主控提供Web界面(Express + Chart.js)

**Rationale**:
- Winston:
  - 结构化日志: JSON格式便于解析和查询
  - 多种传输: 支持文件、控制台、数据库
  - 日志分级: debug, info, warn, error
- 自定义指标:
  - 监控延迟: 记录每次监控的耗时
  - 通知延迟: 记录通知发送的延迟
  - Worker健康: 记录心跳和崩溃次数

**Log Format**:
```json
{
  "timestamp": "2025-10-11T10:30:00.000Z",
  "level": "info",
  "message": "Worker registered",
  "workerId": "worker-001",
  "requestId": "req-12345"
}
```

---

### 8. 抖音数据抓取策略

**Decision**: 模拟登录 + Web API抓取

**Rationale**:
- 官方API限制: 抖音开放平台API限制严格,不适合个人用户
- Web抓取可行性: 通过puppeteer模拟浏览器访问抖音网页版
- Cookies管理: 保存登录Cookies,减少重复登录
- 反爬处理:
  - 随机User-Agent
  - 请求间隔控制(避免触发限流)
  - 检测限流信号,自动降速

**Implementation**:
- 使用puppeteer-core启动无头浏览器
- 首次登录: 用户扫码登录,保存Cookies
- 后续监控: 复用Cookies直接访问
- 数据解析: 从HTML或XHR响应中提取评论和私信

**Fallback Plan**:
- 如果Web抓取被封禁,提供手动导入功能
- 未来考虑接入抖音开放平台API(需要企业认证)

---

### 9. 通知推送机制

**Decision**: WebSocket推送 + 本地持久化队列

**Rationale**:
- 实时性: WebSocket保持长连接,新消息立即推送
- 可靠性: 客户端离线时,消息存储到主控数据库的通知队列表
- 重连恢复: 客户端重连后,主控推送未读通知
- 去重: 使用消息ID防止重复推送

**Notification Flow**:
1. Worker检测到新消息 → 发送给主控
2. 主控保存到通知队列 → 通过Socket.IO推送给所有在线客户端
3. 客户端确认接收 → 主控标记通知为已送达
4. 客户端离线 → 通知保留在队列,重连后推送

---

### 10. 版本控制策略

**Decision**: 语义化版本 + API版本号

**Rationale**:
- package.json版本: 1.0.0 (MAJOR.MINOR.PATCH)
- API版本: 消息协议中包含 `version: "v1"`
- 向后兼容: 新版本主控可识别旧版本Worker消息
- 平滑升级: 支持主控和Worker分别升级,不强制同步

**Version Management**:
- 主控版本: 保存在主控数据库
- Worker版本: 注册时上报给主控
- 兼容性检查: 主控检测Worker版本,不兼容则拒绝注册

---

## Architecture Patterns

### 主控-Worker通信流程

```
1. Worker启动 → 连接主控 → 发送注册消息
2. 主控验证 → 分配任务 → 返回监控账户列表
3. Worker执行监控 → 发现新消息 → 上报主控
4. 主控接收消息 → 保存数据库 → 推送通知给客户端
5. 心跳检测 → Worker每10秒发送心跳 → 主控更新健康状态
6. Worker崩溃 → 主控检测超时 → 重启Worker → 重新分配任务
```

### 监控任务调度

```
1. 主控启动 → 从数据库加载账户配置
2. 根据账户数量决定Worker数量(1个Worker监控5-10个账户)
3. 负载均衡: 平均分配账户到各个Worker
4. Worker定时任务: 使用node-cron每30秒触发一次监控
5. 动态调整: 账户增加时,启动新Worker;账户减少时,停止闲置Worker
```

---

## Performance Optimization

### 1. 数据库优化
- 索引: 在account_id、timestamp、read_status字段建立索引
- 分页查询: 历史记录使用LIMIT+OFFSET分页
- 定期清理: 每天凌晨3点清理30天前的数据

### 2. 网络优化
- 消息压缩: Socket.IO启用WebSocket压缩
- 批量推送: 短时间内的多条通知合并推送
- 连接池: 复用HTTP连接,减少TCP握手开销

### 3. 进程优化
- 内存限制: 启动Worker时设置--max-old-space-size=200
- Worker隔离: 每个Worker独立进程,崩溃不影响其他Worker
- 优雅退出: 接收SIGTERM信号,完成当前任务后再退出

---

## Security Considerations

### 1. 账户凭证安全
- 加密存储: 使用crypto模块AES-256加密Cookies和密码
- 密钥管理: 主密钥存储在环境变量或配置文件(不提交到Git)
- 最小权限: Worker只能访问分配给它的账户数据

### 2. 通信安全
- WSS加密: 生产环境使用WSS(WebSocket over TLS)
- 消息签名: 使用HMAC签名验证消息完整性
- 认证Token: 客户端连接时提供JWT Token

### 3. 防爬安全
- 请求限流: 单个账户监控间隔≥30秒
- IP轮换: 如果需要,可集成代理IP池
- 异常检测: 检测到反爬限流时,自动降速或暂停

---

## Deployment Strategy

### 开发环境
```bash
# 安装依赖
npm install

# 启动主控(开发模式)
npm run dev:master

# 启动Worker(开发模式)
npm run dev:worker

# 启动桌面客户端
npm run dev:desktop
```

### 生产环境
```bash
# 使用PM2启动主控
pm2 start packages/master/src/index.js --name master

# 主控自动管理Worker进程

# 打包桌面客户端
npm run build:desktop  # 生成.exe/.dmg/.AppImage

# 打包移动客户端
npm run build:ios      # 生成.ipa
npm run build:android  # 生成.apk
```

---

## Risk Mitigation

### 1. 平台封禁风险
- **风险**: 抖音检测到自动化抓取,封禁账户
- **缓解**:
  - 控制监控频率(30秒间隔)
  - 模拟真实用户行为(随机等待、鼠标移动)
  - 提供手动导入备用方案

### 2. 数据丢失风险
- **风险**: 进程崩溃或数据库损坏导致数据丢失
- **缓解**:
  - 定期备份SQLite数据库(每天一次)
  - 使用WAL模式提高并发性和稳定性
  - 关键数据(账户配置)冗余存储

### 3. 性能瓶颈风险
- **风险**: 账户数量过多导致监控延迟
- **缓解**:
  - Worker水平扩展(自动启动新Worker)
  - 优先级队列(重要账户优先监控)
  - 降级策略(延长监控间隔)

---

## Next Steps

1. ✅ Technical Context完成
2. ✅ Constitution Check通过
3. ⏭️ Phase 1: 生成data-model.md和contracts/
4. ⏭️ 更新agent context文件
5. ⏭️ 生成quickstart.md
