/**
 * ABogus 加密算法 - 完整实现
 *
 * 原始作者: @JoeanAmier (https://github.com/JoeanAmier/TikTokDownloader)
 * 许可证: GNU General Public License v3.0
 *
 * 从 Python 完整移植到 JavaScript
 * Python 源码: packages/Douyin_TikTok_Download_API-main/crawlers/douyin/web/abogus.py
 */

const sm3 = require('sm-crypto').sm3;

/**
 * ABogus 类 - 完整SM3实现
 */
class ABogus {
    constructor(platform = null) {
        // 魔术常量
        this.arguments = [0, 1, 14];
        this.uaKey = "\u0000\u0001\u000e";
        this.endString = "cus";
        this.version = [1, 0, 1, 5];
        this.browser = platform ? this.generateBrowserInfo(platform) :
            "1536|742|1536|864|0|0|0|0|1536|864|1536|864|1536|742|24|24|MacIntel";

        this.reg = [
            1937774191,
            1226093241,
            388252375,
            3666478592,
            2842636476,
            372324522,
            3817729613,
            2969243214,
        ];

        // 字符串映射表
        this.strMaps = {
            s0: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
            s1: 'Dkdpgh4ZKsQB80/Mfvw36XI1R25+WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=',
            s2: 'Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=',
            s3: 'ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe',
            s4: 'Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe'
        };

        // UA 编码（针对标准 Chrome UA）
        this.uaCode = [
            76, 98, 15, 131, 97, 245, 224, 133, 122, 199, 241, 166,
            79, 34, 90, 191, 128, 126, 122, 98, 66, 11, 14, 40,
            49, 110, 110, 173, 67, 96, 138, 252
        ];

        this.browserLen = this.browser.length;
        this.browserCode = this.charCodeAt(this.browser);

        this.chunk = [];
        this.size = 0;
        this.regCopy = [...this.reg];
    }

    // ==================== 辅助方法 ====================

    /**
     * 字符串转字符码数组
     */
    charCodeAt(str) {
        return Array.from(str).map(char => char.charCodeAt(0));
    }

    /**
     * 字符码数组转字符串
     */
    static fromCharCode(...codes) {
        return String.fromCharCode(...codes);
    }

    /**
     * 生成随机数组
     */
    static randomList(a = null, b = 170, c = 85, d = 0, e = 0, f = 0, g = 0) {
        const r = a !== null ? a : (Math.random() * 10000);
        const v = [
            r,
            Math.floor(r) & 255,
            Math.floor(r) >> 8
        ];
        const s1 = (v[1] & b) | d;
        v.push(s1);
        const s2 = (v[1] & c) | e;
        v.push(s2);
        const s3 = (v[2] & b) | f;
        v.push(s3);
        const s4 = (v[2] & c) | g;
        v.push(s4);
        return v.slice(-4);
    }

    static list1(randomNum = null, a = 170, b = 85, c = 45) {
        return ABogus.randomList(randomNum, a, b, 1, 2, 5, c & a);
    }

    static list2(randomNum = null, a = 170, b = 85) {
        return ABogus.randomList(randomNum, a, b, 1, 0, 0, 0);
    }

    static list3(randomNum = null, a = 170, b = 85) {
        return ABogus.randomList(randomNum, a, b, 1, 0, 5, 0);
    }

    /**
     * 生成字符串 1
     */
    static generateString1(randomNum1 = null, randomNum2 = null, randomNum3 = null) {
        return ABogus.fromCharCode(...ABogus.list1(randomNum1)) +
               ABogus.fromCharCode(...ABogus.list2(randomNum2)) +
               ABogus.fromCharCode(...ABogus.list3(randomNum3));
    }

    /**
     * 生成字符串 2
     */
    generateString2(urlParams, method = 'GET', startTime = 0, endTime = 0) {
        const a = this.generateString2List(urlParams, method, startTime, endTime);
        const e = this.endCheckNum(a);
        a.push(...this.browserCode);
        a.push(e);
        return this.rc4Encrypt(ABogus.fromCharCode(...a), 'y');
    }

    /**
     * 生成字符串 2 的列表
     */
    generateString2List(urlParams, method = 'GET', startTime = 0, endTime = 0) {
        startTime = startTime || Math.floor(Date.now());
        endTime = endTime || (startTime + this.randomInt(4, 8));

        const paramsArray = this.generateParamsCode(urlParams);
        const methodArray = this.generateMethodCode(method);

        return this.list4(
            (endTime >> 24) & 255,
            paramsArray[21],
            this.uaCode[23],
            (endTime >> 16) & 255,
            paramsArray[22],
            this.uaCode[24],
            (endTime >> 8) & 255,
            (endTime >> 0) & 255,
            (startTime >> 24) & 255,
            (startTime >> 16) & 255,
            (startTime >> 8) & 255,
            (startTime >> 0) & 255,
            methodArray[21],
            methodArray[22],
            Math.floor(endTime / 256 / 256 / 256 / 256) >> 0,
            Math.floor(startTime / 256 / 256 / 256 / 256) >> 0,
            this.browserLen
        );
    }

    /**
     * 生成固定格式的列表
     */
    list4(a, b, c, d, e, f, g, h, i, j, k, m, n, o, p, q, r) {
        return [
            44, a, 0, 0, 0, 0, 24, b, n, 0, c, d, 0, 0, 0, 1,
            0, 239, e, o, f, g, 0, 0, 0, 0, h, 0, 0, 14,
            i, j, 0, k, m, 3, p, 1, q, 1, r, 0, 0, 0
        ];
    }

    /**
     * 计算异或校验和
     */
    endCheckNum(arr) {
        let r = 0;
        for (const i of arr) {
            r ^= i;
        }
        return r;
    }

    /**
     * 生成参数代码（SM3双重哈希）
     */
    generateParamsCode(params) {
        return this.sm3ToArray(this.sm3ToArray(params + this.endString));
    }

    /**
     * 生成方法代码（SM3双重哈希）
     */
    generateMethodCode(method = 'GET') {
        return this.sm3ToArray(this.sm3ToArray(method + this.endString));
    }

    /**
     * SM3 哈希转数组
     */
    sm3ToArray(data) {
        let bytes;
        if (typeof data === 'string') {
            bytes = Buffer.from(data, 'utf-8');
        } else {
            bytes = Buffer.from(data);
        }

        // 使用 sm-crypto 计算 SM3 哈希
        const hash = sm3(Array.from(bytes));

        // 将十六进制字符串转换为整数数组
        const result = [];
        for (let i = 0; i < hash.length; i += 2) {
            result.push(parseInt(hash.substr(i, 2), 16));
        }
        return result;
    }

    /**
     * RC4 加密
     */
    rc4Encrypt(plaintext, key) {
        const s = Array.from({ length: 256 }, (_, i) => i);
        let j = 0;

        // 密钥调度算法（KSA）
        for (let i = 0; i < 256; i++) {
            j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
            [s[i], s[j]] = [s[j], s[i]];
        }

        // 伪随机生成算法（PRGA）
        let i = 0;
        j = 0;
        const cipher = [];

        for (let k = 0; k < plaintext.length; k++) {
            i = (i + 1) % 256;
            j = (j + s[i]) % 256;
            [s[i], s[j]] = [s[j], s[i]];
            const t = (s[i] + s[j]) % 256;
            cipher.push(String.fromCharCode(s[t] ^ plaintext.charCodeAt(k)));
        }

        return cipher.join('');
    }

    /**
     * 生成结果（自定义 Base64 编码）
     */
    generateResult(str, mapKey = 's4') {
        const map = this.strMaps[mapKey];
        const result = [];

        for (let i = 0; i < str.length; i += 3) {
            let n;
            if (i + 2 < str.length) {
                n = (str.charCodeAt(i) << 16) | (str.charCodeAt(i + 1) << 8) | str.charCodeAt(i + 2);
            } else if (i + 1 < str.length) {
                n = (str.charCodeAt(i) << 16) | (str.charCodeAt(i + 1) << 8);
            } else {
                n = str.charCodeAt(i) << 16;
            }

            const masks = [0xFC0000, 0x03F000, 0x0FC0, 0x3F];
            const shifts = [18, 12, 6, 0];

            for (let j = 0; j < 4; j++) {
                if (shifts[j] === 6 && i + 1 >= str.length) break;
                if (shifts[j] === 0 && i + 2 >= str.length) break;
                result.push(map[(n & masks[j]) >> shifts[j]]);
            }
        }

        // 添加填充
        const padding = (4 - (result.length % 4)) % 4;
        result.push('='.repeat(padding));

        return result.join('');
    }

    /**
     * 生成参数编码
     */
    static generateArgsCode() {
        const a = [];
        const args = [0, 1, 14];

        for (let j = 24; j >= 0; j -= 8) {
            a.push(args[0] >> j);
        }
        a.push(args[1] / 256);
        a.push(args[1] % 256);
        a.push(args[1] >> 24);
        a.push(args[1] >> 16);
        for (let j = 24; j >= 0; j -= 8) {
            a.push(args[2] >> j);
        }
        return a.map(i => Math.floor(i) & 255);
    }

    /**
     * 生成浏览器信息
     */
    generateBrowserInfo(platform = 'Win32') {
        const innerWidth = this.randomInt(1280, 1920);
        const innerHeight = this.randomInt(720, 1080);
        const outerWidth = this.randomInt(innerWidth, 1920);
        const outerHeight = this.randomInt(innerHeight, 1080);
        const screenX = 0;
        const screenY = [0, 30][Math.floor(Math.random() * 2)];

        const valueList = [
            innerWidth, innerHeight, outerWidth, outerHeight,
            screenX, screenY, 0, 0, outerWidth, outerHeight,
            outerWidth, outerHeight, innerWidth, innerHeight,
            24, 24, platform
        ];

        return valueList.join('|');
    }

    /**
     * 生成随机整数
     */
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * 主方法 - 生成 a_bogus 参数
     *
     * @param {Object|string} urlParams - URL参数（对象或查询字符串）
     * @param {string} method - HTTP方法（默认GET）
     * @param {number} startTime - 开始时间戳（毫秒）
     * @param {number} endTime - 结束时间戳（毫秒）
     * @param {number} randomNum1 - 随机数1
     * @param {number} randomNum2 - 随机数2
     * @param {number} randomNum3 - 随机数3
     * @returns {string} a_bogus 参数
     */
    getValue(urlParams, method = 'GET', startTime = 0, endTime = 0, randomNum1 = null, randomNum2 = null, randomNum3 = null) {
        // 如果是对象，转换为查询字符串
        let paramsStr;
        if (typeof urlParams === 'object' && urlParams !== null) {
            paramsStr = new URLSearchParams(urlParams).toString();
        } else {
            paramsStr = urlParams;
        }

        const string1 = ABogus.generateString1(randomNum1, randomNum2, randomNum3);
        const string2 = this.generateString2(paramsStr, method, startTime, endTime);
        const combinedString = string1 + string2;

        return this.generateResult(combinedString, 's4');
    }
}

/**
 * 简化的辅助函数 - 直接生成 a_bogus
 *
 * @param {Object|string} params - 请求参数（对象或查询字符串）
 * @param {string} userAgent - User-Agent（当前未使用，保留接口兼容性）
 * @returns {string} a_bogus 参数
 */
function generateABogus(params, userAgent = '') {
    const ab = new ABogus();
    return ab.getValue(params);
}

module.exports = {
    ABogus,
    generateABogus
};
