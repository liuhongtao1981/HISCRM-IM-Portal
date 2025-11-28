/**
 * 抖音 Token 生成器
 * 包括 msToken、verifyFp、s_v_web_id 等
 */

/**
 * 生成随机字符串
 * @param {number} length 长度
 * @returns {string} 随机字符串
 */
function genRandomStr(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * 生成虚假的 msToken
 * 格式: 126 位随机字符串 + "=="
 * @returns {string} msToken
 */
function genFalseMsToken() {
    return genRandomStr(126) + '==';
}

/**
 * 生成 verifyFp 和 s_v_web_id
 * 格式: "verify_" + base36时间戳 + "_" + 36位UUID
 *
 * 源码参考: crawlers/douyin/web/utils.py:200-233
 *
 * @returns {string} verifyFp
 */
function genVerifyFp() {
    const baseStr = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const t = baseStr.length;

    // 获取当前时间戳（毫秒）
    let milliseconds = Date.now();

    // 转换为 base36
    let base36 = '';
    while (milliseconds > 0) {
        const remainder = milliseconds % 36;
        if (remainder < 10) {
            base36 = String(remainder) + base36;
        } else {
            base36 = String.fromCharCode(97 + remainder - 10) + base36; // 'a' + (remainder - 10)
        }
        milliseconds = Math.floor(milliseconds / 36);
    }
    const r = base36;

    // 生成 36 位 UUID
    const o = new Array(36);
    o[8] = o[13] = o[18] = o[23] = '_';
    o[14] = '4';

    for (let i = 0; i < 36; i++) {
        if (!o[i]) {
            const n = Math.floor(Math.random() * t);
            if (i === 19) {
                o[i] = baseStr[(3 & n) | 8];
            } else {
                o[i] = baseStr[n];
            }
        }
    }

    return `verify_${r}_${o.join('')}`;
}

/**
 * 生成 s_v_web_id（与 verifyFp 相同）
 * @returns {string} s_v_web_id
 */
function genSVWebId() {
    return genVerifyFp();
}

/**
 * Token 管理器类
 */
class TokenManager {
    constructor() {
        this.msToken = genFalseMsToken();
        this.verifyFp = genVerifyFp();
        this.sVWebId = genSVWebId();
    }

    /**
     * 获取 msToken
     * 注意: 当前返回虚假 msToken
     * 真实 msToken 需要调用抖音 API 生成（需要特定的 magic、version 等参数）
     *
     * @returns {string} msToken
     */
    getMsToken() {
        return this.msToken;
    }

    /**
     * 获取 verifyFp
     * @returns {string} verifyFp
     */
    getVerifyFp() {
        return this.verifyFp;
    }

    /**
     * 获取 s_v_web_id
     * @returns {string} s_v_web_id
     */
    getSVWebId() {
        return this.sVWebId;
    }

    /**
     * 刷新所有 Token
     */
    refresh() {
        this.msToken = genFalseMsToken();
        this.verifyFp = genVerifyFp();
        this.sVWebId = genSVWebId();
    }
}

module.exports = {
    TokenManager,
    genFalseMsToken,
    genVerifyFp,
    genSVWebId,
    genRandomStr
};
