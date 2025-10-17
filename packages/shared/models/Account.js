/**
 * Account模型
 * T033: 账户模型定义和加密工具
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// 加密算法配置
const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-32-character-key-change-me!!'; // 必须是32字符
const IV_LENGTH = 16; // AES block size

/**
 * 加密凭证数据
 * @param {object} credentials - 凭证对象
 * @returns {string} 加密后的Base64字符串
 */
function encryptCredentials(credentials) {
  if (!credentials || typeof credentials !== 'object') {
    throw new Error('Credentials must be an object');
  }

  const credentialsStr = JSON.stringify(credentials);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32), 'utf8');

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(credentialsStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // 将IV和加密数据组合
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * 解密凭证数据
 * @param {string} encryptedCredentials - 加密的凭证字符串
 * @returns {object} 解密后的凭证对象
 */
function decryptCredentials(encryptedCredentials) {
  // 如果凭证为空或不是字符串，返回 null 而不是抛出错误
  if (!encryptedCredentials || typeof encryptedCredentials !== 'string') {
    return null;
  }

  const parts = encryptedCredentials.split(':');
  if (parts.length !== 2) {
    // 格式不正确，返回 null
    return null;
  }

  try {
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32), 'utf8');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    // 解密失败，返回 null
    console.warn('Failed to decrypt credentials, returning null:', error.message);
    return null;
  }
}

/**
 * Account类
 */
class Account {
  constructor(data = {}) {
    this.id = data.id || `acc-${uuidv4()}`;
    this.platform = data.platform;
    this.account_name = data.account_name;
    this.account_id = data.account_id;
    this.credentials = data.credentials; // 未加密的凭证对象
    this.status = data.status || 'active';
    this.login_status = data.login_status || 'not_logged_in';
    this.monitor_interval = data.monitor_interval || 30;
    this.last_check_time = data.last_check_time || null;
    this.last_login_time = data.last_login_time || null;
    this.cookies_valid_until = data.cookies_valid_until || null;
    this.assigned_worker_id = data.assigned_worker_id || null;
    this.created_at = data.created_at || Math.floor(Date.now() / 1000);
    this.updated_at = data.updated_at || Math.floor(Date.now() / 1000);
    this.user_info = data.user_info || null;
    this.fingerprint = data.fingerprint || null;
    this.platform_user_id = data.platform_user_id || null;
    this.platform_username = data.platform_username || null;
  }

  /**
   * 验证账户数据
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate() {
    const errors = [];

    if (!this.platform) {
      errors.push('Platform is required');
    } else if (!['douyin'].includes(this.platform)) {
      errors.push('Unsupported platform: ' + this.platform);
    }

    if (!this.account_name || this.account_name.length < 1 || this.account_name.length > 50) {
      errors.push('Account name must be 1-50 characters');
    }

    // account_id 是可选的（可以是临时ID，登录后更新）
    if (!this.account_id) {
      errors.push('Account ID is required');
    }

    // credentials 可以是空对象（登录后更新）
    if (this.credentials !== null && this.credentials !== undefined && typeof this.credentials !== 'object') {
      errors.push('Credentials must be an object');
    }

    if (this.monitor_interval < 10 || this.monitor_interval > 300) {
      errors.push('Monitor interval must be 10-300 seconds');
    }

    if (!['active', 'paused', 'error', 'expired'].includes(this.status)) {
      errors.push('Invalid status: ' + this.status);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 转换为数据库行格式
   * @returns {object} 数据库行对象
   */
  toDbRow() {
    return {
      id: this.id,
      platform: this.platform,
      account_name: this.account_name,
      account_id: this.account_id,
      credentials: encryptCredentials(this.credentials), // 加密
      status: this.status,
      monitor_interval: this.monitor_interval,
      last_check_time: this.last_check_time,
      assigned_worker_id: this.assigned_worker_id,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  /**
   * 从数据库行创建Account实例
   * @param {object} row - 数据库行
   * @returns {Account}
   */
  static fromDbRow(row) {
    const data = { ...row };

    // 解密凭证（如果解密失败，decryptCredentials 会返回 null）
    if (data.credentials) {
      data.credentials = decryptCredentials(data.credentials);
    }

    return new Account(data);
  }

  /**
   * 转换为安全的JSON格式（不包含敏感信息）
   * @returns {object}
   */
  toSafeJSON() {
    return {
      id: this.id,
      platform: this.platform,
      account_name: this.account_name,
      account_id: this.account_id,
      status: this.status,
      login_status: this.login_status,
      monitor_interval: this.monitor_interval,
      last_check_time: this.last_check_time,
      last_login_time: this.last_login_time,
      cookies_valid_until: this.cookies_valid_until,
      assigned_worker_id: this.assigned_worker_id,
      created_at: this.created_at,
      updated_at: this.updated_at,
      user_info: this.user_info,
      credentials: this.credentials, // Include credentials for Cookie status display
      platform_user_id: this.platform_user_id,
      platform_username: this.platform_username,
      // 注意: 包含 credentials 用于 Cookie 状态显示，但不包含明文密码
    };
  }

  /**
   * 转换为JSON格式（包含加密的凭证）
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      platform: this.platform,
      account_name: this.account_name,
      account_id: this.account_id,
      credentials: this.credentials ? encryptCredentials(this.credentials) : null,
      status: this.status,
      monitor_interval: this.monitor_interval,
      last_check_time: this.last_check_time,
      assigned_worker_id: this.assigned_worker_id,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}

module.exports = {
  Account,
  encryptCredentials,
  decryptCredentials,
};
