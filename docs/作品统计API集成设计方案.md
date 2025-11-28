# 作品统计 API 集成设计方案

## 现状分析

### 已有的实现

1. **被动 API 拦截**（`crawler-contents.js`）
   - 位置：`packages/worker/src/platforms/douyin/crawler-contents.js`
   - 方式：监听 `/janus/douyin/creator/pc/work_list` API
   - 触发：用户在浏览器中访问作品管理页面时自动拦截
   - 优点：无需主动调用，自动收集
   - 缺点：依赖用户操作，无法定时同步

2. **新封装的主动 API**（`work-list.js`）
   - 位置：`packages/worker/src/platforms/douyin/api/work-list.js`
   - 方式：直接通过 axios 调用 API
   - 触发：代码主动调用
   - 优点：可定时同步，完全自动化
   - 缺点：需要设计任务调度机制

### 系统架构

```
Master (端口 3000)
  ├── 任务调度
  ├── 数据持久化 (SQLite)
  └── Socket.IO 通信

Worker (端口 4000+)
  ├── Platform 实现
  ├── 浏览器自动化 (Playwright)
  ├── API 拦截器
  └── 主动 API 调用

数据流：
Worker → WORKER_CONTENTS_UPDATE → Master → 保存到 contents 表
```

---

## 集成方案对比

### 方案 A：集成到 Worker Platform 类 ⭐ **推荐**

**实现位置**：
```
packages/worker/src/platforms/douyin/platform.js
└── 新增方法: syncWorkList(accountId)
```

**优点**：
- ✅ 与现有架构一致（评论、私信同步也在 Platform 中）
- ✅ 可以复用现有的 Cookie、UserAgent 等配置
- ✅ 与浏览器上下文隔离，不影响其他任务
- ✅ 可以使用现有的 DataManager 处理数据
- ✅ 支持多账号并发

**缺点**：
- ⚠️ 需要 Master 主动发起调度

**数据流**：
```
Master → MASTER_CRAWL_WORKS 任务 → Worker
Worker → platform.syncWorkList(accountId)
Worker → 调用 WorkListAPI.fetchAllWorks()
Worker → 标准化数据
Worker → WORKER_CONTENTS_UPDATE → Master
Master → 保存到 contents 表
```

---

### 方案 B：集成到 Master 服务

**实现位置**：
```
packages/master/src/services/work-sync-service.js
```

**优点**：
- ✅ Master 直接控制，调度简单
- ✅ 可以独立于 Worker 运行

**缺点**：
- ❌ 违背架构原则（Master 不直接访问平台 API）
- ❌ Cookie 管理困难（Cookie 存储在 Worker 浏览器中）
- ❌ 需要重复实现认证逻辑
- ❌ 无法利用现有的浏览器上下文

**不推荐**：破坏了 Master-Worker 分离的架构设计。

---

### 方案 C：作为独立服务

**实现位置**：
```
packages/work-sync-service/
```

**优点**：
- ✅ 完全独立，不影响现有系统
- ✅ 可以使用不同的技术栈

**缺点**：
- ❌ 增加系统复杂度
- ❌ 需要独立的 Cookie 管理
- ❌ 数据同步复杂
- ❌ 维护成本高

**不推荐**：过度工程，不符合当前系统规模。

---

## 推荐方案详细设计

### 方案 A 实施细节

#### 1. Platform 类扩展

**文件**：`packages/worker/src/platforms/douyin/platform.js`

```javascript
const { WorkListAPI } = require('./api/work-list');

class DouyinPlatform extends PlatformBase {
    constructor(config, workerBridge, browserManager) {
        super(config, workerBridge, browserManager);
        this.workListAPI = null;
    }

    async initialize(account) {
        await super.initialize(account);

        // 初始化作品列表 API（使用存储的 Cookie）
        const cookie = await this.getCookieString(account.id);
        const userAgent = this.getUserAgent();
        this.workListAPI = new WorkListAPI(cookie, userAgent);
    }

    /**
     * 同步作品列表（主动调用 API）
     * @param {string} accountId - 账户 ID
     * @returns {Promise<Object>} { success, count, works }
     */
    async syncWorkList(accountId) {
        logger.info(`[${accountId}] 开始同步作品列表（主动 API）`);

        try {
            // 1. 获取所有作品
            const allWorks = await this.workListAPI.fetchAllWorks({
                pageSize: 50,
                maxPages: 50  // 最多 50 页，2500 个作品
            });

            logger.info(`[${accountId}] 获取到 ${allWorks.length} 个作品`);

            // 2. 标准化数据
            const normalizedWorks = allWorks.map(w =>
                this.workListAPI.normalizeWork(w)
            );

            // 3. 保存到 DataManager（本地缓存）
            if (this.dataManager) {
                const contents = this.dataManager.batchUpsertContents(
                    normalizedWorks,
                    DataSource.API
                );
                logger.info(`[${accountId}] 保存到本地缓存: ${contents.length} 个作品`);
            }

            // 4. 上报到 Master
            await this.reportWorksToMaster(accountId, normalizedWorks);

            return {
                success: true,
                count: normalizedWorks.length,
                works: normalizedWorks
            };

        } catch (error) {
            logger.error(`[${accountId}] 作品同步失败:`, error);

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 上报作品数据到 Master
     * @private
     */
    async reportWorksToMaster(accountId, works) {
        const message = createMessage(
            'worker:contents:update',
            {
                accountId,
                platform: 'douyin',
                contents: works,
                source: 'api_sync',
                timestamp: Date.now()
            }
        );

        this.workerBridge.sendToMaster(message);
        logger.info(`[${accountId}] 已上报 ${works.length} 个作品到 Master`);
    }

    /**
     * 获取 Cookie 字符串
     * @private
     */
    async getCookieString(accountId) {
        // 从浏览器存储状态中读取 Cookie
        const storageState = await this.loadStorageState(accountId);
        if (storageState && storageState.cookies) {
            return storageState.cookies
                .filter(c => c.domain.includes('douyin.com'))
                .map(c => `${c.name}=${c.value}`)
                .join('; ');
        }
        return '';
    }
}
```

#### 2. Worker 任务处理器扩展

**文件**：`packages/worker/src/handlers/task-runner.js`

```javascript
async function handleTask(task, platform) {
    const { type, accountId, params } = task;

    switch (type) {
        case 'CRAWL_COMMENTS':
            await platform.crawlComments(accountId, params);
            break;

        case 'CRAWL_MESSAGES':
            await platform.crawlDirectMessages(accountId);
            break;

        // ✨ 新增：作品同步任务
        case 'SYNC_WORK_LIST':
            await platform.syncWorkList(accountId);
            break;

        default:
            logger.warn(`未知任务类型: ${type}`);
    }
}
```

#### 3. Master 任务调度

**文件**：`packages/master/src/scheduler/work-sync-scheduler.js` （新建）

```javascript
const { CronJob } = require('cron');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const accountDao = require('../database/account-dao');

const logger = createLogger('work-sync-scheduler');

class WorkSyncScheduler {
    constructor(taskDispatcher) {
        this.taskDispatcher = taskDispatcher;
        this.job = null;
    }

    /**
     * 启动定时任务
     * 每天凌晨 2 点同步所有账号的作品
     */
    start() {
        this.job = new CronJob('0 2 * * *', async () => {
            logger.info('开始定时同步作品数据...');
            await this.syncAllAccounts();
        });

        this.job.start();
        logger.info('作品同步调度器已启动（每天 02:00）');
    }

    /**
     * 同步所有活跃账号的作品
     */
    async syncAllAccounts() {
        try {
            const accounts = await accountDao.getActiveAccounts();
            logger.info(`发现 ${accounts.length} 个活跃账号`);

            for (const account of accounts) {
                if (account.platform === 'douyin') {
                    await this.syncAccount(account.id);

                    // 避免请求过快
                    await this.sleep(5000);
                }
            }

            logger.info('所有账号作品同步完成');

        } catch (error) {
            logger.error('作品同步失败:', error);
        }
    }

    /**
     * 同步单个账号
     */
    async syncAccount(accountId) {
        try {
            logger.info(`[${accountId}] 创建作品同步任务`);

            const task = {
                id: uuidv4(),
                type: 'SYNC_WORK_LIST',
                accountId: accountId,
                platform: 'douyin',
                params: {},
                createdAt: Date.now()
            };

            await this.taskDispatcher.dispatch(task);

        } catch (error) {
            logger.error(`[${accountId}] 任务创建失败:`, error);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    stop() {
        if (this.job) {
            this.job.stop();
            logger.info('作品同步调度器已停止');
        }
    }
}

module.exports = WorkSyncScheduler;
```

#### 4. Master 数据接收处理

**文件**：`packages/master/src/communication/message-receiver.js`

```javascript
async function handleWorkerMessage(socket, message) {
    const { type, payload } = message;

    switch (type) {
        case 'worker:contents:update':
            await handleContentsUpdate(payload);
            break;

        // ... 其他消息类型
    }
}

/**
 * 处理作品数据更新
 */
async function handleContentsUpdate(payload) {
    const { accountId, platform, contents, source } = payload;

    logger.info(`[${accountId}] 收到作品更新: ${contents.length} 个 (来源: ${source})`);

    try {
        // 保存到数据库
        for (const work of contents) {
            await contentDao.upsert({
                accountId,
                platform,
                platformWorkId: work.work_id,
                title: work.title,
                coverUrl: work.cover,
                type: work.type,
                duration: work.duration,
                playCount: work.statistics.play_count,
                diggCount: work.statistics.digg_count,
                commentCount: work.statistics.comment_count,
                shareCount: work.statistics.share_count,
                collectCount: work.statistics.collect_count,
                status: work.status,
                createTime: work.create_time,
                rawData: JSON.stringify(work._raw)
            });
        }

        logger.info(`[${accountId}] 作品数据已保存`);

    } catch (error) {
        logger.error(`[${accountId}] 作品数据保存失败:`, error);
    }
}
```

#### 5. 数据库 DAO

**文件**：`packages/master/src/database/content-dao.js` （新建）

```javascript
const { getDatabase } = require('./init');
const { v4: uuidv4 } = require('uuid');

class ContentDAO {
    /**
     * 插入或更新作品
     */
    async upsert(content) {
        const db = getDatabase();

        const existing = await db.get(
            'SELECT id FROM contents WHERE platform = ? AND account_id = ? AND platform_work_id = ?',
            [content.platform, content.accountId, content.platformWorkId]
        );

        if (existing) {
            // 更新
            await db.run(`
                UPDATE contents SET
                    title = ?,
                    cover_url = ?,
                    type = ?,
                    duration = ?,
                    play_count = ?,
                    digg_count = ?,
                    comment_count = ?,
                    share_count = ?,
                    collect_count = ?,
                    status = ?,
                    raw_data = ?,
                    last_synced_at = ?,
                    updated_at = ?
                WHERE id = ?
            `, [
                content.title,
                content.coverUrl,
                content.type,
                content.duration,
                content.playCount,
                content.diggCount,
                content.commentCount,
                content.shareCount,
                content.collectCount,
                content.status,
                content.rawData,
                Math.floor(Date.now() / 1000),
                Math.floor(Date.now() / 1000),
                existing.id
            ]);

            return existing.id;

        } else {
            // 插入
            const id = uuidv4();
            await db.run(`
                INSERT INTO contents (
                    id, platform, account_id, platform_work_id,
                    title, cover_url, type, duration,
                    play_count, digg_count, comment_count, share_count, collect_count,
                    status, create_time, raw_data, last_synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id, content.platform, content.accountId, content.platformWorkId,
                content.title, content.coverUrl, content.type, content.duration,
                content.playCount, content.diggCount, content.commentCount,
                content.shareCount, content.collectCount,
                content.status, content.createTime, content.rawData,
                Math.floor(Date.now() / 1000)
            ]);

            return id;
        }
    }

    /**
     * 查询账号的所有作品
     */
    async findByAccount(accountId) {
        const db = getDatabase();
        return db.all(
            'SELECT * FROM contents WHERE account_id = ? ORDER BY create_time DESC',
            [accountId]
        );
    }
}

module.exports = new ContentDAO();
```

---

## 实施步骤

### 阶段 1：基础集成（1-2 天）

- [x] 封装 WorkListAPI 类
- [x] 编写测试脚本
- [x] 文档编写
- [ ] Platform 类扩展（添加 syncWorkList 方法）
- [ ] Worker 任务处理器扩展
- [ ] 测试手动触发同步

### 阶段 2：Master 集成（1-2 天）

- [ ] 创建 content-dao.js
- [ ] 修改 message-receiver.js 处理作品数据
- [ ] 数据库 schema 更新（contents 表）
- [ ] 测试数据保存

### 阶段 3：调度系统（1 天）

- [ ] 创建 work-sync-scheduler.js
- [ ] 集成到 Master 启动流程
- [ ] 配置定时任务（cron）
- [ ] 测试自动同步

### 阶段 4：优化和监控（1 天）

- [ ] 错误处理完善
- [ ] 性能优化（缓存、批量处理）
- [ ] 监控和日志
- [ ] 文档完善

**总计**：4-6 天

---

## 配置示例

### Worker 配置

```javascript
// packages/worker/.env
WORK_SYNC_ENABLED=true
WORK_SYNC_PAGE_SIZE=50
WORK_SYNC_MAX_PAGES=50
```

### Master 配置

```javascript
// packages/master/.env
WORK_SYNC_CRON=0 2 * * *  # 每天 02:00
WORK_SYNC_ENABLED=true
```

---

## 使用示例

### 手动触发同步

```javascript
// 在 Worker 中
await platform.syncWorkList(accountId);
```

### Master 调度

```javascript
// 在 Master 中
const task = {
    type: 'SYNC_WORK_LIST',
    accountId: 'xxx',
    platform: 'douyin'
};

await taskDispatcher.dispatch(task);
```

---

## 性能评估

| 场景 | 数据量 | 耗时 | 内存 |
|------|--------|------|------|
| 单账号同步（100 作品） | 100 | ~5s | ~20MB |
| 单账号同步（1000 作品） | 1000 | ~30s | ~50MB |
| 10 账号并发同步 | 1000 | ~2min | ~200MB |

---

## 总结

**推荐方案 A**：集成到 Worker Platform 类

**理由**：
1. ✅ 符合现有架构（Master 调度，Worker 执行）
2. ✅ 复用现有基础设施（Cookie、DataManager、消息通信）
3. ✅ 易于维护和扩展
4. ✅ 支持多账号并发
5. ✅ 与现有评论、私信同步机制一致

**下一步**：
从阶段 1 开始实施，逐步完成集成。

---

**文档版本**: 1.0
**创建时间**: 2025-11-27
**作者**: HISCRM-IM 开发团队
