/**
 * X-Bogus算法实现（JavaScript版）
 *
 * 移植自：packages/Douyin_TikTok_Download_API-main/crawlers/douyin/web/xbogus.py
 *
 * 原作者：
 * - https://github.com/Evil0ctal
 * - https://github.com/Johnserf-Seed
 *
 * 许可证：Apache License 2.0
 */

const CryptoJS = require('crypto-js');
const crypto = require('crypto');

class XBogus {
    constructor(userAgent = null) {
        // 用于MD5字符串到数组转换的映射表
        // 索引48-57 ('0'-'9') => 0-9
        // 索引97-102 ('a'-'f') => 10-15
        this.Array = [
            null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
            null, 10, 11, 12, 13, 14, 15
        ];

        // Base64编码字符表
        this.character = "Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=";

        // RC4加密密钥
        this.uaKey = [0, 1, 12];

        // User-Agent
        this.userAgent = (userAgent && userAgent !== "")
            ? userAgent
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0";
    }

    /**
     * MD5哈希
     * @param {string|Array} inputData - 输入数据
     * @returns {string} MD5哈希值（32位小写十六进制）
     */
    md5(inputData) {
        let array;

        if (typeof inputData === 'string') {
            array = this.md5StrToArray(inputData);
        } else if (Array.isArray(inputData)) {
            array = inputData;
        } else {
            throw new Error('Invalid input type. Expected string or array.');
        }

        // 使用Node.js原生crypto计算MD5
        // 修复：CryptoJS.lib.WordArray.create(array) 会把字节数组当作32位字处理，导致MD5错误
        const buffer = Buffer.from(array);
        return crypto.createHash('md5').update(buffer).digest('hex');
    }

    /**
     * MD5字符串转整数数组
     * @param {string} md5Str - MD5字符串或普通字符串
     * @returns {Array<number>} 整数数组
     */
    md5StrToArray(md5Str) {
        if (typeof md5Str === 'string' && md5Str.length > 32) {
            // 长字符串直接转换为字符码数组
            return Array.from(md5Str, char => char.charCodeAt(0));
        } else {
            // MD5十六进制字符串转换为字节数组
            const array = [];
            let idx = 0;
            while (idx < md5Str.length) {
                array.push(
                    (this.Array[md5Str.charCodeAt(idx)] << 4) |
                    this.Array[md5Str.charCodeAt(idx + 1)]
                );
                idx += 2;
            }
            return array;
        }
    }

    /**
     * 多轮MD5加密
     * @param {string} urlPath - URL路径
     * @returns {Array<number>} 加密后的数组
     */
    md5Encrypt(urlPath) {
        return this.md5StrToArray(
            this.md5(this.md5StrToArray(this.md5(urlPath)))
        );
    }

    /**
     * RC4加密算法
     * @param {Array<number>} key - 密钥
     * @param {Array<number>} data - 数据
     * @returns {Array<number>} 加密后的数据
     */
    rc4Encrypt(key, data) {
        const S = Array.from({ length: 256 }, (_, i) => i);
        let j = 0;
        const encryptedData = [];

        // 初始化S盒
        for (let i = 0; i < 256; i++) {
            j = (j + S[i] + key[i % key.length]) % 256;
            [S[i], S[j]] = [S[j], S[i]];
        }

        // 生成密文
        let i = 0;
        j = 0;
        for (const byte of data) {
            i = (i + 1) % 256;
            j = (j + S[i]) % 256;
            [S[i], S[j]] = [S[j], S[i]];
            const encryptedByte = byte ^ S[(S[i] + S[j]) % 256];
            encryptedData.push(encryptedByte);
        }

        return encryptedData;
    }

    /**
     * 编码转换（第一次）
     * @param {number} a - 参数a
     * @param {number} b - 参数b
     * @param {...number} args - 其他参数
     * @returns {string} 编码结果
     */
    encodingConversion(a, b, c, e, d, t, f, r, n, o, i, _, x, u, s, l, v, h, p) {
        const y = [a];
        y.push(Math.floor(i));
        y.push(b, _, c, x, e, u, d, s, t, l, f, v, r, h, n, p, o);

        // 将字节数组转换为ISO-8859-1字符串
        return String.fromCharCode(...y);
    }

    /**
     * 编码转换（第二次）
     * @param {number} a - 参数a
     * @param {number} b - 参数b
     * @param {string|Array} c - 参数c
     * @returns {string} 编码结果
     */
    encodingConversion2(a, b, c) {
        if (Array.isArray(c)) {
            c = String.fromCharCode(...c);
        }
        return String.fromCharCode(a) + String.fromCharCode(b) + c;
    }

    /**
     * 位运算计算
     * @param {number} a1 - 参数1
     * @param {number} a2 - 参数2
     * @param {number} a3 - 参数3
     * @returns {string} 计算结果（4个字符）
     */
    calculation(a1, a2, a3) {
        const x1 = (a1 & 255) << 16;
        const x2 = (a2 & 255) << 8;
        const x3 = x1 | x2 | a3;

        return (
            this.character[(x3 & 16515072) >> 18] +
            this.character[(x3 & 258048) >> 12] +
            this.character[(x3 & 4032) >> 6] +
            this.character[x3 & 63]
        );
    }

    /**
     * 生成X-Bogus值
     * @param {string} urlPath - URL参数字符串（不包含域名和路径）
     * @returns {Array} [完整URL参数, X-Bogus值, User-Agent]
     */
    getXBogus(urlPath) {
        // 1. User-Agent RC4加密 -> Base64编码 -> MD5哈希 -> 数组
        const uaBytes = Array.from(this.userAgent, char => char.charCodeAt(0));
        const encryptedUa = this.rc4Encrypt(this.uaKey, uaBytes);

        // Base64编码
        const base64Ua = Buffer.from(encryptedUa).toString('base64');

        // MD5哈希并转换为数组
        const base64UaBytes = Array.from(base64Ua, char => char.charCodeAt(0));
        const array1 = this.md5StrToArray(this.md5(base64UaBytes));

        // 2. 固定MD5值的数组
        const array2 = this.md5StrToArray(
            this.md5(this.md5StrToArray("d41d8cd98f00b204e9800998ecf8427e"))
        );

        // 3. URL路径的多轮MD5加密
        const urlPathArray = this.md5Encrypt(urlPath);

        // 4. 时间戳（秒级）
        const timer = Math.floor(Date.now() / 1000);

        // 5. 固定常量
        const ct = 536919696;

        // 6. 构建新数组
        const newArray = [
            64, 0.00390625, 1, 12,
            urlPathArray[14], urlPathArray[15], array2[14], array2[15], array1[14], array1[15],
            (timer >> 24) & 255, (timer >> 16) & 255, (timer >> 8) & 255, timer & 255,
            (ct >> 24) & 255, (ct >> 16) & 255, (ct >> 8) & 255, ct & 255
        ];

        // 7. 计算XOR校验值
        let xorResult = newArray[0];
        for (let i = 1; i < newArray.length; i++) {
            let b = newArray[i];
            if (typeof b === 'number' && b % 1 !== 0) {
                b = Math.floor(b);
            }
            xorResult ^= b;
        }
        newArray.push(xorResult);

        // 8. 分组处理
        const array3 = [];
        const array4 = [];
        let idx = 0;
        while (idx < newArray.length) {
            array3.push(newArray[idx]);
            if (idx + 1 < newArray.length) {
                array4.push(newArray[idx + 1]);
            }
            idx += 2;
        }

        // 9. 合并数组
        const mergeArray = array3.concat(array4);

        // 10. 编码转换并RC4加密
        const encoded = this.encodingConversion(...mergeArray);
        const encodedBytes = Array.from(encoded, char => char.charCodeAt(0));
        const garbledCodeBytes = this.rc4Encrypt([255], encodedBytes);
        const garbledCode = this.encodingConversion2(2, 255, garbledCodeBytes);

        // 11. 计算最终X-Bogus字符串
        let xb = "";
        idx = 0;
        while (idx < garbledCode.length) {
            xb += this.calculation(
                garbledCode.charCodeAt(idx),
                garbledCode.charCodeAt(idx + 1),
                garbledCode.charCodeAt(idx + 2)
            );
            idx += 3;
        }

        this.params = `${urlPath}&X-Bogus=${xb}`;
        this.xb = xb;

        return [this.params, this.xb, this.userAgent];
    }
}

/**
 * 便捷函数：生成X-Bogus值
 * @param {string} urlParams - URL参数字符串
 * @param {string} userAgent - User-Agent（可选）
 * @returns {string} X-Bogus值
 */
function generateXBogus(urlParams, userAgent = null) {
    const xb = new XBogus(userAgent);
    const result = xb.getXBogus(urlParams);
    return result[1]; // 返回X-Bogus值
}

module.exports = {
    XBogus,
    generateXBogus
};
