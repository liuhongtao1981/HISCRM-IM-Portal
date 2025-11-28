/**
 * 抖音 API 定时爬虫
 *
 * 功能：
 * 1. 定时执行（默认5分钟，可配置）
 * 2. 从常驻tab获取实时Cookie
 * 3. 获取所有作品列表（带分页）
 * 4. 获取每个作品的评论和二级评论（带分页）
 * 5. 使用DataManager同步数据给Master
 *
 * 特点：
 * - 完全基于API，无需浏览器交互
 * - 自动分页处理
 * - 反爬虫延迟
 * - 错误自动恢复
 * - 增量更新
 *
 * @module crawler-api
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { DouyinAPI } = require('./api/douyin-api');
const { DataSource } = require('../base/data-models');

const logger = createLogger('douyin-crawler-api');

/**
 * API 爬虫配置
 */
const DEFAULT_CONFIG = {
    // 定时间隔（毫秒）
    intervalMs: 5 * 60 * 1000,  // 默认 5 分钟

    // 作品爬取配置
    works: {
        pageSize: 50,           // 每页作品数
        maxPages: 50,           // 最多爬取页数
    },

    // 评论爬取配置
    comments: {
        pageSize: 20,           // 每页评论数
        maxPages: 25,           // 最多爬取页数（每个作品）
        maxComments: 500,       // 每个作品最多评论数
    },

    // 二级评论配置
    replies: {
        enabled: true,          // 是否爬取二级评论
        pageSize: 20,           // 每页回复数
        maxPages: 5,            // 最多爬取页数（每条评论）
        maxReplies: 100,        // 每条评论最多回复数
    },

    // 反爬虫延迟（毫秒）
    delays: {
        betweenWorks: 2000,     // 作品之间延迟
        betweenCommentPages: 1000,  // 评论分页延迟
        betweenReplies: 500,    // 二级评论延迟
    },

    // 其他配置
    autoStart: true,            // 是否自动启动
    stopOnError: false,         // 出错是否停止
};

/**
 * API 爬虫类
 */
class DouyinAPICrawler {
    constructor(platform, account, config = {}) {
        this.platform = platform;
        this.account = account;
        this.config = { ...DEFAULT_CONFIG, ...config };

        this.isRunning = false;
        this.isPaused = false;
        this.timer = null;
        this.lastRunTime = null;
        this.stats = {
            totalRuns: 0,
            successRuns: 0,
            failedRuns: 0,
            totalWorks: 0,
            totalComments: 0,
            totalReplies: 0,
        };

        // API实例（延迟初始化）
        this.douyinAPI = null;
        this.cookie = null;
        this.userAgent = null;
    }

    /**
     * 启动定时爬虫
     */
    start() {
        if (this.isRunning) {
            logger.warn(`[${this.account.id}] API爬虫已在运行中`);
            return;
        }

        this.isRunning = true;
        logger.info(`[${this.account.id}] API爬虫已启动，间隔: ${this.config.intervalMs / 1000}秒`);

        // 立即执行一次
        if (this.config.autoStart) {
            this.runOnce().catch(err => {
                logger.error(`[${this.account.id}] 首次执行失败:`, err);
            });
        }

        // 设置定时器
        this.timer = setInterval(async () => {
            if (!this.isPaused) {
                await this.runOnce();
            }
        }, this.config.intervalMs);
    }

    /**
     * 停止定时爬虫
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
        logger.info(`[${this.account.id}] API爬虫已停止`);
    }

    /**
     * 暂停/恢复
     */
    pause() {
        this.isPaused = true;
        logger.info(`[${this.account.id}] API爬虫已暂停`);
    }

    resume() {
        this.isPaused = false;
        logger.info(`[${this.account.id}] API爬虫已恢复`);
    }

    /**
     * 执行一次完整的爬取任务
     */
    async runOnce() {
        const startTime = Date.now();
        logger.info(`[${this.account.id}] ========== 开始API爬取 ==========`);

        this.stats.totalRuns++;
        let page = null;

        try {
            // 1. 刷新Cookie（每次任务都从浏览器上下文获取最新Cookie）
            await this.refreshCookie();

            // 2. 获取作品列表
            const works = await this.fetchAllWorks();
            logger.info(`[${this.account.id}] 获取到 ${works.length} 个作品`);

            this.stats.totalWorks += works.length;

            // 3. 遍历作品，获取评论
            let totalComments = 0;
            let totalReplies = 0;

            for (let i = 0; i < works.length; i++) {
                const work = works[i];

                logger.info(`[${this.account.id}] [${i + 1}/${works.length}] 处理作品: ${work.aweme_id}`);

                try {
                    // 3.1 获取一级评论（传入完整的work对象用于优化）
                    const comments = await this.fetchCommentsForWork(work);
                    totalComments += comments.length;

                    // 3.2 获取二级评论
                    if (this.config.replies.enabled && comments.length > 0) {
                        const replies = await this.fetchRepliesForComments(work.aweme_id, comments);
                        totalReplies += replies.length;
                    }

                    // 作品间延迟
                    if (i < works.length - 1) {
                        await this.sleep(this.config.delays.betweenWorks);
                    }

                } catch (workError) {
                    logger.error(`[${this.account.id}] 处理作品 ${work.aweme_id} 失败:`, workError.message);

                    if (this.config.stopOnError) {
                        throw workError;
                    }
                }
            }

            this.stats.totalComments += totalComments;
            this.stats.totalReplies += totalReplies;
            this.stats.successRuns++;

            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            logger.info(`[${this.account.id}] ========== 爬取完成 ==========`);
            logger.info(`[${this.account.id}] 统计: ${works.length} 作品, ${totalComments} 评论, ${totalReplies} 回复`);
            logger.info(`[${this.account.id}] 耗时: ${duration}秒`);

            this.lastRunTime = Date.now();

            // 🔧 修复：触发数据同步到Master
            logger.debug(`[${this.account.id}] 检查同步条件: platform=${!!this.platform}, dataManagers=${!!this.platform?.dataManagers}, comments=${totalComments}, replies=${totalReplies}`);

            const dataManager = this.platform?.dataManagers?.get(this.account.id);
            logger.debug(`[${this.account.id}] DataManager状态: exists=${!!dataManager}, type=${dataManager?.constructor?.name}`);

            if (dataManager && (totalComments > 0 || totalReplies > 0)) {
                logger.info(`[${this.account.id}] 触发数据同步到Master...`);
                await dataManager.syncToMasterNow();
            } else if (!dataManager) {
                logger.warn(`[${this.account.id}] ⚠️ DataManager不存在，无法同步数据！platform=${!!this.platform}, dataManagers=${!!this.platform?.dataManagers}`);
            } else {
                logger.debug(`[${this.account.id}] 没有需要同步的评论数据 (comments=${totalComments}, replies=${totalReplies})`);
            }

        } catch (error) {
            this.stats.failedRuns++;
            logger.error(`[${this.account.id}] API爬取失败:`, error);

            if (this.config.stopOnError) {
                this.stop();
            }
        }
    }

    /**
     * 刷新Cookie（每次任务周期都从浏览器上下文获取最新Cookie）
     * ✅ 不创建专门的tab，直接从登录检测任务维护的浏览器上下文获取Cookie
     * ✅ 这个方法在每次 runOnce() 时都会调用，确保使用最新的Cookie
     */
    async refreshCookie() {
        logger.debug(`[${this.account.id}] 刷新Cookie...`);

        try {
            // ✅ 从BrowserManager的contexts Map获取账户的浏览器上下文（登录检测任务维护）
            const context = this.platform.browserManager.contexts.get(this.account.id);

            if (!context) {
                throw new Error('账户浏览器上下文不存在，请确保登录检测任务已运行');
            }

            // 获取最新Cookie
            const cookies = await context.cookies();
            this.cookie = cookies
                .filter(c => c.domain.includes('douyin.com'))
                .map(c => `${c.name}=${c.value}`)
                .join('; ');

            // 获取UserAgent（使用默认值或从配置获取）
            this.userAgent = this.platform.config?.userAgent ||
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

            logger.debug(`[${this.account.id}] Cookie已更新: ${cookies.length} 个`);

            // 更新 DouyinAPI 的Cookie
            if (this.douyinAPI) {
                this.douyinAPI.updateCookie(this.cookie);
            } else {
                // 首次创建 DouyinAPI 实例
                this.douyinAPI = new DouyinAPI(this.cookie, this.userAgent);
            }

        } catch (error) {
            logger.error(`[${this.account.id}] 刷新Cookie失败:`, error);
            throw error;
        }
    }

    /**
     * 获取所有作品（带分页）
     */
    async fetchAllWorks() {
        logger.info(`[${this.account.id}] 开始获取作品列表...`);

        // 自动分页获取所有作品
        let allWorks = [];
        let cursor = 0;
        let hasMore = true;
        let pageCount = 0;
        const pageSize = this.config.works.pageSize;
        const maxPages = this.config.works.maxPages;

        while (hasMore && pageCount < maxPages) {
            const data = await this.douyinAPI.fetchWorkList(cursor, pageSize);

            if (data.aweme_list && data.aweme_list.length > 0) {
                const awemeList = data.aweme_list;
                const itemsList = data.items;

                // ✅ 如果有 items 统计数据，直接赋值 metrics 到 aweme_list 中
                // ⚠️ aweme_list 和 items 的顺序是一致的，直接用索引匹配
                if (itemsList && itemsList.length > 0) {
                    let matchedCount = 0;
                    const minLength = Math.min(awemeList.length, itemsList.length);

                    for (let i = 0; i < minLength; i++) {
                        const aweme = awemeList[i];
                        const item = itemsList[i];

                        if (item && item.metrics) {
                            aweme.metrics = item.metrics;
                            matchedCount++;
                        }
                    }

                    logger.debug(`✅ [作品统计API] 成功合并 ${matchedCount}/${awemeList.length} 个作品的统计信息（metrics）`);
                }

                allWorks = allWorks.concat(awemeList);
            }

            cursor = data.max_cursor;
            hasMore = data.has_more;
            pageCount++;

            logger.info(`[${this.account.id}] 已获取第 ${pageCount} 页，当前总计: ${allWorks.length} 个作品`);

            // 避免请求过快
            if (hasMore && pageCount < maxPages) {
                await this.sleep(1000);
            }
        }

        logger.info(`[${this.account.id}] 作品列表获取完成，共 ${allWorks.length} 个作品（${pageCount} 页）`);

        // ✅ 参照crawler-contents.js：直接传递原始API数据，不做normalize
        // 保存到DataManager
        const dataManager = this.platform.dataManagers?.get(this.account.id);
        if (dataManager && allWorks.length > 0) {
            try {
                logger.debug(`⚙️ [API爬虫] 开始处理 ${allWorks.length} 个作品`);
                const contents = dataManager.batchUpsertContents(
                    allWorks,  // ✅ 直接传递原始aweme_list，保留所有字段（包括aweme_id）
                    DataSource.API
                );
                logger.info(`✅ [API] [${this.account.id}] 作品已保存: ${contents.length} 个 (原始: ${allWorks.length})`);
            } catch (error) {
                logger.error(`❌ [API] [${this.account.id}] 作品保存失败: ${error.message}`, error.stack);
            }
        } else {
            if (!dataManager) {
                logger.warn(`⚠️ [API爬虫] DataManager 不存在，无法保存作品数据`);
            }
            if (allWorks.length === 0) {
                logger.warn(`⚠️ [API爬虫] 作品数据为空`);
            }
        }

        return allWorks;  // ✅ 返回原始数据
    }

    /**
     * 获取作品的所有评论（带分页）
     */
    async fetchCommentsForWork(work) {
        // ✅ 修复：原始API数据使用aweme_id字段
        const workId = typeof work === 'object' ? work.aweme_id : work;
        const commentCount = typeof work === 'object' ? work.statistics?.comment_count : null;

        // ⭐ 优化：如果作品统计中显示评论数为0，直接跳过API调用
        if (commentCount === 0) {
            logger.info(`[${this.account.id}] 作品 ${workId}: 评论数为0，跳过抓取`);
            return [];
        }

        logger.debug(`[${this.account.id}] 获取作品 ${workId} 的评论${commentCount ? `（预计 ${commentCount} 条）` : ''}...`);

        const allComments = [];
        let cursor = 0;
        let hasMore = true;
        let pageCount = 0;

        while (hasMore && pageCount < this.config.comments.maxPages) {
            try {
                // 使用 DouyinAPI 获取评论
                const result = await this.douyinAPI.fetchComments(
                    workId,
                    cursor,
                    this.config.comments.pageSize
                );

                // 🔍 添加详细调试日志
                logger.debug(`[${this.account.id}] API响应结构: ${JSON.stringify(Object.keys(result))}`);
                logger.debug(`[${this.account.id}] has_more=${result.has_more}, cursor=${result.cursor}, comments=${result.comments?.length || 0}`);

                const comments = result.comments || [];
                logger.debug(`[${this.account.id}] 第 ${pageCount + 1} 页: ${comments.length} 条评论`);

                if (comments.length > 0) {
                    allComments.push(...comments);
                }

                hasMore = result.has_more === 1;
                cursor = result.cursor;
                pageCount++;

                // 达到最大评论数
                if (allComments.length >= this.config.comments.maxComments) {
                    logger.debug(`[${this.account.id}] 已达到最大评论数限制: ${this.config.comments.maxComments}`);
                    break;
                }

                // 分页延迟
                if (hasMore) {
                    await this.sleep(this.config.delays.betweenCommentPages);
                }

            } catch (error) {
                logger.error(`[${this.account.id}] 获取评论失败 (page ${pageCount + 1}):`, error.message);
                break;
            }
        }

        logger.info(`[${this.account.id}] 作品 ${workId}: ${allComments.length} 条评论 (${pageCount} 页)`);

        // 标准化并保存
        if (allComments.length > 0) {
            this.saveComments(workId, allComments);
        }

        return allComments;
    }

    /**
     * 获取评论的所有回复（带分页）
     */
    async fetchRepliesForComments(workId, comments) {
        logger.debug(`[${this.account.id}] 获取 ${comments.length} 条评论的回复...`);

        const allReplies = [];

        for (let i = 0; i < comments.length; i++) {
            const comment = comments[i];
            const replyCount = comment.reply_comment_total || 0;

            if (replyCount === 0) {
                continue;
            }

            logger.debug(`[${this.account.id}] 评论 ${comment.cid}: ${replyCount} 条回复`);

            try {
                let cursor = 0;
                let hasMore = true;
                let pageCount = 0;
                const commentReplies = [];

                while (hasMore && pageCount < this.config.replies.maxPages) {
                    // 使用 DouyinAPI 获取二级评论
                    const result = await this.douyinAPI.fetchReplies(
                        workId,
                        comment.cid,
                        cursor,
                        this.config.replies.pageSize
                    );

                    const replies = result.comments || [];
                    logger.debug(`[${this.account.id}] 评论 ${comment.cid} 第 ${pageCount + 1} 页: ${replies.length} 条回复`);

                    if (replies.length > 0) {
                        commentReplies.push(...replies);
                    }

                    hasMore = result.has_more === 1;
                    cursor = result.cursor;
                    pageCount++;

                    // 达到最大回复数
                    if (commentReplies.length >= this.config.replies.maxReplies) {
                        break;
                    }

                    // 分页延迟
                    if (hasMore) {
                        await this.sleep(this.config.delays.betweenReplies);
                    }
                }

                allReplies.push(...commentReplies);

                // 保存回复
                if (commentReplies.length > 0) {
                    this.saveReplies(workId, comment.cid, commentReplies);
                }

                // 评论间延迟
                if (i < comments.length - 1) {
                    await this.sleep(this.config.delays.betweenReplies);
                }

            } catch (error) {
                logger.error(`[${this.account.id}] 获取评论 ${comment.cid} 的回复失败:`, error.message);
            }
        }

        logger.info(`[${this.account.id}] 作品 ${workId}: ${allReplies.length} 条回复`);

        return allReplies;
    }

    /**
     * 保存评论到DataManager
     */
    saveComments(workId, comments) {
        if (!this.platform.dataManagers) {
            return;
        }

        try {
            // 标准化评论数据
            const normalizedComments = comments.map(comment => ({
                comment_id: String(comment.cid),
                cid: String(comment.cid),
                aweme_id: workId,
                text: comment.text,
                create_time: comment.create_time,
                digg_count: comment.digg_count || 0,
                reply_count: comment.reply_comment_total || 0,
                user_info: {
                    user_id: comment.user.uid,
                    uid: comment.user.uid,
                    nickname: comment.user.nickname,
                    avatar_url: comment.user.avatar_thumb?.url_list?.[0] || null,
                },
                user: comment.user,
                _raw: comment,
                _api_version: 'v2',
            }));

            const dataManager = this.platform.dataManagers?.get(this.account.id);
            if (dataManager) {
                const savedComments = dataManager.batchUpsertComments(
                    normalizedComments,
                    DataSource.API
                );
                logger.debug(`[${this.account.id}] 已保存 ${savedComments.length} 条评论`);
            } else {
                logger.warn(`[${this.account.id}] DataManager不存在，无法保存评论`);
            }

        } catch (error) {
            logger.error(`[${this.account.id}] 保存评论失败:`, error);
        }
    }

    /**
     * 保存回复到DataManager
     */
    saveReplies(workId, commentId, replies) {
        if (!this.platform.dataManagers) {
            return;
        }

        try {
            // 标准化回复数据
            const normalizedReplies = replies.map(reply => ({
                comment_id: String(reply.cid),
                cid: String(reply.cid),
                aweme_id: workId,
                parent_comment_id: commentId,
                reply_id: commentId,
                text: reply.text,
                create_time: reply.create_time,
                digg_count: reply.digg_count || 0,
                reply_count: reply.reply_comment_total || 0,
                reply_to_username: reply.reply_to_username || null,
                reply_to_userid: reply.reply_to_userid || null,
                user_info: {
                    user_id: reply.user.uid,
                    uid: reply.user.uid,
                    nickname: reply.user.nickname,
                    avatar_url: reply.user.avatar_thumb?.url_list?.[0] || null,
                },
                user: reply.user,
                _raw: reply,
                _api_version: 'v2',
            }));

            const dataManager = this.platform.dataManagers?.get(this.account.id);
            if (dataManager) {
                const savedReplies = dataManager.batchUpsertComments(
                    normalizedReplies,
                    DataSource.API
                );
                logger.debug(`[${this.account.id}] 已保存 ${savedReplies.length} 条回复`);
            } else {
                logger.warn(`[${this.account.id}] DataManager不存在，无法保存回复`);
            }

        } catch (error) {
            logger.error(`[${this.account.id}] 保存回复失败:`, error);
        }
    }

    /**
     * 延迟函数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            lastRunTime: this.lastRunTime,
            nextRunTime: this.lastRunTime ? this.lastRunTime + this.config.intervalMs : null,
        };
    }
}

module.exports = {
    DouyinAPICrawler,
    DEFAULT_CONFIG,
};
