/**
 * ABogus 加密算法（基础实现）
 *
 * 原始作者: @JoeanAmier (https://github.com/JoeanAmier/TikTokDownloader)
 * 许可证: GNU General Public License v3.0
 *
 * 注意: 这是从 Python 移植的简化版本
 * 完整实现需要 SM3 哈希算法和更复杂的编码逻辑
 *
 * Python 源码: packages/Douyin_TikTok_Download_API-main/crawlers/douyin/web/abogus.py
 */

const crypto = require('crypto');

/**
 * ABogus 类
 *
 * ⚠️ 重要提示:
 * 这是一个占位实现。真实的 ABogus 算法非常复杂，包含：
 * 1. SM3 国密哈希算法
 * 2. 多层编码转换
 * 3. 魔术常量和映射表
 * 4. User-Agent 编码
 *
 * 当前实现使用 MD5 作为临时替代方案，仅用于测试。
 * 生产环境需要完整的 ABogus 算法实现。
 */
class ABogus {
    constructor() {
        // 魔术常量（来自 Python 源码）
        this.version = [1, 0, 1, 5];
        this.browser = '1536|742|1536|864|0|0|0|0|1536|864|1536|864|1536|742|24|24|MacIntel';

        // 字符串映射表
        this.strMaps = {
            s0: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
            s1: 'Dkdpgh4ZKsQB80/Mfvw36XI1R25+WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=',
            s2: 'Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=',
            s3: 'ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe',
            s4: 'Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe'
        };

        // UA 编码（针对标准 Chrome UA）
        // Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36
        this.uaCode = [
            76, 98, 15, 131, 97, 245, 224, 133, 122, 199, 241, 166,
            79, 34, 90, 191, 128, 126, 122, 98, 66, 11, 14, 40,
            49, 110, 110, 173, 67, 96, 138, 252
        ];
    }

    /**
     * 生成 a_bogus 参数
     *
     * ⚠️ 临时实现 - 使用 MD5 哈希
     * TODO: 替换为真实的 ABogus 算法
     *
     * @param {Object} params - 请求参数对象
     * @param {string} userAgent - User-Agent 字符串（可选）
     * @returns {string} a_bogus 参数
     */
    getValue(params, userAgent = '') {
        // 将参数对象转换为查询字符串
        const paramStr = Object.keys(params)
            .sort() // 参数排序
            .map(key => `${key}=${params[key]}`)
            .join('&');

        // ⚠️ 临时实现：使用 MD5 + 时间戳 + 随机数
        // 真实算法需要使用 SM3 和复杂的编码逻辑
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        const input = `${paramStr}|${timestamp}|${random}|${userAgent}`;

        const hash = crypto.createHash('md5').update(input).digest('hex');

        // 模拟真实 a_bogus 格式（通常是 Base64 编码的字符串）
        const aBogus = Buffer.from(hash).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

        return aBogus;
    }

    /**
     * 从查询字符串生成 a_bogus
     *
     * @param {string} queryString - URL 查询字符串（不含 ?）
     * @param {string} userAgent - User-Agent 字符串
     * @returns {string} a_bogus 参数
     */
    getValueFromString(queryString, userAgent = '') {
        // 解析查询字符串为对象
        const params = {};
        queryString.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key) {
                params[key] = value || '';
            }
        });

        return this.getValue(params, userAgent);
    }
}

/**
 * 简化的辅助函数 - 直接生成 a_bogus
 *
 * @param {Object} params - 请求参数
 * @param {string} userAgent - User-Agent
 * @returns {string} a_bogus
 */
function generateABogus(params, userAgent = '') {
    const ab = new ABogus();
    return ab.getValue(params, userAgent);
}

module.exports = {
    ABogus,
    generateABogus
};

/**
 * ==================== 开发备注 ====================
 *
 * ## 完整 ABogus 算法移植步骤
 *
 * ### 1. 安装 SM3 库
 * ```bash
 * npm install sm-crypto
 * # 或
 * npm install js-sm3
 * ```
 *
 * ### 2. 完整算法包含以下步骤：
 * - SM3 哈希计算
 * - Base64 编码/解码
 * - 字符映射转换
 * - UA 编码处理
 * - 浏览器指纹编码
 * - 多轮混淆和加密
 *
 * ### 3. 参考资源
 * - Python 源码: packages/Douyin_TikTok_Download_API-main/crawlers/douyin/web/abogus.py
 * - 原始项目: https://github.com/JoeanAmier/TikTokDownloader
 * - JS SM3 库: https://github.com/JuneAndGreen/sm-crypto
 *
 * ### 4. 测试方法
 * 1. 使用 Python 版本生成 a_bogus
 * 2. 用相同参数测试 JS 版本
 * 3. 对比结果是否一致
 *
 * ### 5. 风险评估
 * - 抖音可能随时更新算法
 * - 建议定期检查源项目更新
 * - 保留浏览器爬虫作为备用方案
 *
 * ==================== 开发备注结束 ====================
 */
