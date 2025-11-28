/**
 * 抖音 API 统一封装
 *
 * 提供所有抖音 API 的统一调用接口，包括：
 * - 作品列表 API
 * - 评论列表 API
 * - 二级评论 API
 *
 * 特性：
 * - 统一的请求处理和重试机制
 * - 自动处理 Cookie 和 User-Agent
 * - 支持参数加密（a_bogus）
 * - 完整的错误处理和日志记录
 */

const axios = require('axios');
const { generateABogus } = require('./abogus');
const { generateXBogus } = require('./xbogus');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('douyin-api');

/**
 * 抖音 API 统一类
 */
class DouyinAPI {
    constructor(cookie, userAgent = null, options = {}) {
        this.cookie = cookie;
        this.userAgent = userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
        this.options = {
            timeout: 15000,      // 默认 15 秒超时
            maxRetries: 3,       // 最大重试次数
            retryDelay: 1000,    // 重试延迟（毫秒）
            ...options
        };

        // 抖音 Web API 通用参数
        this.webBaseParams = {
            device_platform: 'webapp',
            aid: '6383',
            channel: 'channel_pc_web',
            pc_client_type: 1,
            version_code: '290100',
            version_name: '29.1.0',
            cookie_enabled: 'true',
            screen_width: 1920,
            screen_height: 1080,
            browser_language: 'zh-CN',
            browser_platform: 'Win32',
            browser_name: 'Chrome',
            browser_version: '130.0.0.0',
            browser_online: 'true',
            engine_name: 'Blink',
            engine_version: '130.0.0.0',
            os_name: 'Windows',
            os_version: '10',
            cpu_core_num: 12,
            device_memory: 8,
            platform: 'PC',
            downlink: '10',
            effective_type: '4g',
            round_trip_time: '0'
        };

        // API 端点
        this.endpoints = {
            // 作品相关
            workList: 'https://creator.douyin.com/janus/douyin/creator/pc/work_list',

            // 评论相关
            commentList: 'https://www.douyin.com/aweme/v1/web/comment/list/',
            commentReply: 'https://www.douyin.com/aweme/v1/web/comment/list/reply/'
        };
    }

    // ==================== 通用方法 ====================

    /**
     * 构建请求头
     * @param {string} referer - Referer 地址（可选）
     * @returns {Object} 请求头
     */
    _buildHeaders(referer = 'https://www.douyin.com/') {
        return {
            'User-Agent': this.userAgent,
            'Referer': referer,
            'Cookie': this.cookie,
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br'
        };
    }

    /**
     * 发送 HTTP 请求（带重试机制）
     * @param {string} url - 请求 URL
     * @param {Object} config - axios 配置
     * @returns {Promise<Object>} 响应数据
     */
    async _request(url, config = {}) {
        let lastError = null;

        for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
            try {
                const shortUrl = url.length > 100 ? url.substring(0, 100) + '...' : url;
                logger.debug(`[请求] 尝试 ${attempt}/${this.options.maxRetries}: ${shortUrl}`);

                const response = await axios({
                    url,
                    method: 'GET',
                    timeout: this.options.timeout,
                    decompress: true,
                    ...config
                });

                // 🔍 添加调试日志：查看实际响应数据
                logger.debug(`[请求] HTTP状态: ${response.status}`);
                logger.debug(`[请求] 响应数据类型: ${typeof response.data}`);
                logger.debug(`[请求] 响应数据键: ${response.data ? Object.keys(response.data).join(', ') : 'null'}`);
                logger.debug(`[请求] 完整响应数据: ${JSON.stringify(response.data).substring(0, 500)}...`);

                // 检查响应状态
                if (response.data && response.data.status_code === 0) {
                    logger.debug(`[请求] ✅ 成功`);
                    return response.data;
                } else {
                    const errorMsg = response.data?.status_msg || '未知错误';
                    throw new Error(`API 返回错误: ${errorMsg} (status_code=${response.data?.status_code})`);
                }

            } catch (error) {
                lastError = error;
                logger.warn(`[请求] ⚠️ 尝试 ${attempt} 失败: ${error.message}`);

                // 如果不是最后一次尝试，等待后重试
                if (attempt < this.options.maxRetries) {
                    const delay = this.options.retryDelay * attempt; // 递增延迟
                    logger.debug(`[请求] ⏳ ${delay}ms 后重试...`);
                    await this._sleep(delay);
                }
            }
        }

        // 所有尝试都失败
        throw new Error(`请求失败（已重试 ${this.options.maxRetries} 次）: ${lastError.message}`);
    }

    /**
     * 延迟函数
     * @param {number} ms - 延迟毫秒数
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 更新 Cookie
     * @param {string} newCookie - 新的 Cookie
     */
    updateCookie(newCookie) {
        this.cookie = newCookie;
        logger.info('[配置] Cookie 已更新');
    }

    // ==================== 作品 API ====================

    /**
     * 获取作品列表（单页）
     * @param {number} [cursor=0] - 分页游标
     * @param {number} [count=20] - 每页数量
     * @param {number} [status=0] - 作品状态（0=全部）
     * @param {string} [scene='star_atlas'] - 场景标识
     * @returns {Promise<Object>} 作品列表数据 { aweme_list, has_more, max_cursor, total }
     */
    async fetchWorkList(cursor = 0, count = 20, status = 0, scene = 'star_atlas') {
        const params = {
            status,
            count,
            max_cursor: cursor,
            scene,
            device_platform: 'android',
            aid: '1128'
        };

        const url = `${this.endpoints.workList}?${new URLSearchParams(params).toString()}`;

        logger.debug(`[作品列表] 请求: cursor=${cursor}, count=${count}`);

        const data = await this._request(url, {
            headers: this._buildHeaders('https://creator.douyin.com/creator-micro/content/manage')
        });

        logger.debug(`[作品列表] ✅ 获取 ${data.aweme_list?.length || 0} 个作品`);
        return data;
    }

    // ==================== 评论 API ====================

    /**
     * 获取一级评论列表（单页）
     * @param {string} awemeId - 作品 ID
     * @param {number} [cursor=0] - 分页游标
     * @param {number} [count=20] - 每页数量
     * @returns {Promise<Object>} 评论数据 { comments, cursor, has_more }
     */
    async fetchComments(awemeId, cursor = 0, count = 20) {
        const params = {
            ...this.webBaseParams,
            aweme_id: awemeId,
            cursor: cursor,
            count: count,
            item_type: 0,
            insert_ids: '',
            whale_cut_token: '',
            cut_version: 1,
            rcFT: '',
            msToken: ''
        };

        // 生成查询字符串
        const queryString = new URLSearchParams(params).toString();

        // 生成 X-Bogus（一级评论 API 也使用 X-Bogus）
        const xBogus = generateXBogus(queryString, this.userAgent);
        const url = `${this.endpoints.commentList}?${queryString}&X-Bogus=${encodeURIComponent(xBogus)}`;

        logger.debug(`[一级评论] 请求: awemeId=${awemeId}, cursor=${cursor}`);

        const result = await this._request(url, {
            headers: this._buildHeaders()
        });

        logger.debug(`[一级评论] ✅ 获取 ${result.comments?.length || 0} 条评论`);
        return result || {};
    }

    /**
     * 获取二级评论（回复）列表（单页）
     * @param {string} itemId - 作品 ID
     * @param {string} commentId - 一级评论 ID
     * @param {number} [cursor=0] - 分页游标
     * @param {number} [count=20] - 每页数量
     * @returns {Promise<Object>} 回复数据 { comments, cursor, has_more }
     */
    async fetchReplies(itemId, commentId, cursor = 0, count = 20) {
        const params = {
            ...this.webBaseParams,
            item_id: itemId,
            comment_id: commentId,
            cursor: cursor,
            count: count,
            item_type: 0,
            msToken: ''
        };

        // 生成查询字符串
        const queryString = new URLSearchParams(params).toString();

        // 生成 X-Bogus（二级评论 API 使用 X-Bogus）
        const xBogus = generateXBogus(queryString, this.userAgent);
        const url = `${this.endpoints.commentReply}?${queryString}&X-Bogus=${encodeURIComponent(xBogus)}`;

        logger.debug(`[二级评论] 请求: commentId=${commentId}, cursor=${cursor}`);

        const result = await this._request(url, {
            headers: this._buildHeaders()
        });

        logger.debug(`[二级评论] ✅ 获取 ${result.comments?.length || 0} 条回复`);
        return result || {};
    }
}

// ==================== 便捷函数 ====================

/**
 * 创建 DouyinAPI 实例
 * @param {string} cookie - Cookie
 * @param {string} [userAgent] - User-Agent
 * @param {Object} [options] - 选项
 * @returns {DouyinAPI}
 */
function createDouyinAPI(cookie, userAgent, options) {
    return new DouyinAPI(cookie, userAgent, options);
}

module.exports = {
    DouyinAPI,
    createDouyinAPI
};
