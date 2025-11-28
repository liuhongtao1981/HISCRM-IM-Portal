# 作品统计 API 使用示例

## 快速开始

### 1. 基础使用

```javascript
const { fetchWorkList } = require('./src/platforms/douyin/api/work-list');

// 获取前 20 个作品
const data = await fetchWorkList(cookie, {
    status: 0,      // 全部作品
    count: 20,      // 每页 20 个
    maxCursor: 0    // 第一页
}, userAgent);

console.log('作品数量:', data.aweme_list.length);
console.log('总数:', data.total);
console.log('是否有更多:', data.has_more);
```

### 2. 使用类实例

```javascript
const { WorkListAPI } = require('./src/platforms/douyin/api/work-list');

const api = new WorkListAPI(cookie, userAgent);

// 获取作品列表
const data = await api.fetchWorkList({
    status: 0,
    count: 50
});

// 标准化数据
const works = data.aweme_list.map(work => api.normalizeWork(work));
```

## 常见场景

### 场景 1: 获取所有作品并统计

```javascript
const { fetchAllWorks } = require('./src/platforms/douyin/api/work-list');

async function analyzeAllWorks(cookie) {
    // 获取所有作品（自动分页）
    const allWorks = await fetchAllWorks(cookie, {
        status: 0,
        pageSize: 50,
        maxPages: 100  // 最多 100 页
    });

    // 统计分析
    const stats = {
        totalWorks: allWorks.length,
        totalPlays: 0,
        totalDiggs: 0,
        totalComments: 0,
        totalShares: 0
    };

    allWorks.forEach(work => {
        if (work.statistics) {
            stats.totalPlays += work.statistics.play_count || 0;
            stats.totalDiggs += work.statistics.digg_count || 0;
            stats.totalComments += work.statistics.comment_count || 0;
            stats.totalShares += work.statistics.share_count || 0;
        }
    });

    stats.avgPlays = Math.round(stats.totalPlays / stats.totalWorks);
    stats.avgDiggs = Math.round(stats.totalDiggs / stats.totalWorks);

    return stats;
}

// 使用
const stats = await analyzeAllWorks(cookie);
console.log('总作品数:', stats.totalWorks);
console.log('总播放量:', stats.totalPlays);
console.log('平均播放量:', stats.avgPlays);
```

### 场景 2: 分页获取并实时处理

```javascript
const { WorkListAPI } = require('./src/platforms/douyin/api/work-list');

async function processWorksInBatches(cookie, callback) {
    const api = new WorkListAPI(cookie);
    let cursor = 0;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore) {
        const data = await api.fetchWorkList({
            count: 50,
            maxCursor: cursor
        });

        // 标准化并处理每批数据
        const works = data.aweme_list.map(w => api.normalizeWork(w));
        await callback(works, pageCount);

        cursor = data.max_cursor;
        hasMore = data.has_more;
        pageCount++;

        // 避免请求过快
        await api.sleep(1000);
    }

    return pageCount;
}

// 使用
await processWorksInBatches(cookie, async (works, page) => {
    console.log(`处理第 ${page + 1} 页，${works.length} 个作品`);

    // 保存到数据库
    await saveWorksToDatabase(works);
});
```

### 场景 3: 筛选特定作品

```javascript
const { fetchAllWorks } = require('./src/platforms/douyin/api/work-list');
const { WorkListAPI } = require('./src/platforms/douyin/api/work-list');

async function findPopularWorks(cookie, minPlays = 10000) {
    const api = new WorkListAPI(cookie);
    const allWorks = await fetchAllWorks(cookie, { pageSize: 50 });

    const popularWorks = allWorks
        .map(w => api.normalizeWork(w))
        .filter(w => w.statistics.play_count >= minPlays)
        .sort((a, b) => b.statistics.play_count - a.statistics.play_count);

    return popularWorks;
}

// 使用
const popularWorks = await findPopularWorks(cookie, 50000);
console.log('播放量超过 5 万的作品:', popularWorks.length);
popularWorks.slice(0, 5).forEach((work, i) => {
    console.log(`${i + 1}. ${work.title} - ${work.statistics.play_count} 播放`);
});
```

### 场景 4: 监控作品数据变化

```javascript
const { WorkListAPI } = require('./src/platforms/douyin/api/work-list');

class WorkMonitor {
    constructor(cookie, userAgent) {
        this.api = new WorkListAPI(cookie, userAgent);
        this.previousStats = new Map();
    }

    async checkChanges() {
        const data = await this.api.fetchWorkList({ count: 50 });
        const works = data.aweme_list.map(w => this.api.normalizeWork(w));

        const changes = [];

        works.forEach(work => {
            const workId = work.work_id;
            const currentStats = work.statistics;
            const prevStats = this.previousStats.get(workId);

            if (prevStats) {
                const playIncrease = currentStats.play_count - prevStats.play_count;
                const diggIncrease = currentStats.digg_count - prevStats.digg_count;
                const commentIncrease = currentStats.comment_count - prevStats.comment_count;

                if (playIncrease > 0 || diggIncrease > 0 || commentIncrease > 0) {
                    changes.push({
                        work_id: workId,
                        title: work.title,
                        play_increase: playIncrease,
                        digg_increase: diggIncrease,
                        comment_increase: commentIncrease
                    });
                }
            }

            // 保存当前统计
            this.previousStats.set(workId, { ...currentStats });
        });

        return changes;
    }
}

// 使用
const monitor = new WorkMonitor(cookie, userAgent);

// 定期检查（每小时）
setInterval(async () => {
    const changes = await monitor.checkChanges();

    if (changes.length > 0) {
        console.log('检测到数据变化:');
        changes.forEach(change => {
            console.log(`- ${change.title}`);
            console.log(`  播放 +${change.play_increase}, 点赞 +${change.digg_increase}, 评论 +${change.comment_increase}`);
        });
    }
}, 3600000); // 1 小时
```

### 场景 5: 导出作品数据到 CSV

```javascript
const { fetchAllWorks } = require('./src/platforms/douyin/api/work-list');
const { WorkListAPI } = require('./src/platforms/douyin/api/work-list');
const fs = require('fs');

async function exportToCSV(cookie, outputPath) {
    const api = new WorkListAPI(cookie);
    const allWorks = await fetchAllWorks(cookie);
    const works = allWorks.map(w => api.normalizeWork(w));

    // CSV 头部
    const headers = [
        '作品ID', '标题', '类型', '状态', '发布时间',
        '播放量', '点赞数', '评论数', '分享数', '收藏数'
    ];

    // CSV 内容
    const rows = works.map(work => [
        work.work_id,
        `"${work.title.replace(/"/g, '""')}"`,  // 转义引号
        work.type,
        work.status,
        new Date(work.create_time * 1000).toISOString(),
        work.statistics.play_count,
        work.statistics.digg_count,
        work.statistics.comment_count,
        work.statistics.share_count,
        work.statistics.collect_count
    ]);

    // 写入文件
    const csv = [headers, ...rows]
        .map(row => row.join(','))
        .join('\n');

    fs.writeFileSync(outputPath, '\ufeff' + csv, 'utf8'); // BOM for Excel

    return works.length;
}

// 使用
const count = await exportToCSV(cookie, './works-export.csv');
console.log(`已导出 ${count} 个作品到 CSV 文件`);
```

## 与现有系统集成

### 集成到 Platform 类

```javascript
// packages/worker/src/platforms/douyin/platform.js

const { WorkListAPI } = require('./api/work-list');

class DouyinPlatform extends PlatformBase {
    constructor() {
        super();
        this.workListAPI = null;
    }

    async initialize(accountId) {
        // ... 现有初始化代码 ...

        // 初始化作品列表 API
        const cookie = await this.getCookie(accountId);
        this.workListAPI = new WorkListAPI(cookie, this.userAgent);
    }

    /**
     * 同步作品列表
     */
    async syncWorkList(accountId) {
        logger.info(`[${accountId}] 开始同步作品列表`);

        try {
            const allWorks = await this.workListAPI.fetchAllWorks({
                pageSize: 50,
                maxPages: 50
            });

            const normalizedWorks = allWorks.map(w =>
                this.workListAPI.normalizeWork(w)
            );

            // 保存到数据库
            await this.saveWorksToDatabase(accountId, normalizedWorks);

            logger.info(`[${accountId}] 作品同步完成: ${normalizedWorks.length} 个`);

            return normalizedWorks;

        } catch (error) {
            logger.error(`[${accountId}] 作品同步失败:`, error);
            throw error;
        }
    }

    /**
     * 保存作品到数据库
     */
    async saveWorksToDatabase(accountId, works) {
        // TODO: 实现数据库保存逻辑
        // 可以使用 WorkDAO 或直接使用 DataManager
    }
}
```

### 定时任务示例

```javascript
// 定时同步作品数据
const { CronJob } = require('cron');

// 每天凌晨 2 点同步一次
const syncJob = new CronJob('0 2 * * *', async () => {
    console.log('开始同步作品数据...');

    const accounts = await getActiveAccounts();

    for (const account of accounts) {
        try {
            await platform.syncWorkList(account.id);
            console.log(`账号 ${account.id} 同步完成`);
        } catch (error) {
            console.error(`账号 ${account.id} 同步失败:`, error.message);
        }

        // 避免请求过快
        await sleep(5000);
    }

    console.log('所有账号同步完成');
});

syncJob.start();
```

## 错误处理

```javascript
const { fetchWorkList } = require('./src/platforms/douyin/api/work-list');

async function safelyFetchWorks(cookie) {
    try {
        const data = await fetchWorkList(cookie, { count: 20 });
        return { success: true, data };

    } catch (error) {
        // Cookie 过期
        if (error.response?.status === 401) {
            return { success: false, error: 'COOKIE_EXPIRED' };
        }

        // 频率限制
        if (error.response?.status === 429) {
            return { success: false, error: 'RATE_LIMIT' };
        }

        // 网络错误
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return { success: false, error: 'NETWORK_ERROR' };
        }

        // 其他错误
        return { success: false, error: 'UNKNOWN', message: error.message };
    }
}

// 使用
const result = await safelyFetchWorks(cookie);

if (result.success) {
    console.log('获取成功:', result.data.aweme_list.length);
} else {
    switch (result.error) {
        case 'COOKIE_EXPIRED':
            console.log('Cookie 已过期，需要重新登录');
            break;
        case 'RATE_LIMIT':
            console.log('请求过于频繁，请稍后再试');
            break;
        case 'NETWORK_ERROR':
            console.log('网络错误，请检查连接');
            break;
        default:
            console.log('未知错误:', result.message);
    }
}
```

## 性能优化

### 1. 缓存作品数据

```javascript
class WorkListCache {
    constructor(api, ttl = 3600000) { // 默认缓存 1 小时
        this.api = api;
        this.cache = new Map();
        this.ttl = ttl;
    }

    async fetchWorkList(options = {}) {
        const cacheKey = JSON.stringify(options);
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.ttl) {
            console.log('使用缓存数据');
            return cached.data;
        }

        const data = await this.api.fetchWorkList(options);

        this.cache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });

        return data;
    }

    clearCache() {
        this.cache.clear();
    }
}
```

### 2. 并发获取多个账号

```javascript
async function fetchMultipleAccounts(accounts) {
    const results = await Promise.allSettled(
        accounts.map(async (account) => {
            const api = new WorkListAPI(account.cookie);
            return {
                accountId: account.id,
                works: await api.fetchAllWorks({ pageSize: 50 })
            };
        })
    );

    return results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);
}
```

## 测试

运行测试脚本：

```bash
cd tests
node test-work-list-api.js
```

---

**相关文档**：
- [作品统计API分析](./作品统计API分析.md)
- [X-Bogus算法Bug修复报告](./X-Bogus算法Bug修复报告.md)
