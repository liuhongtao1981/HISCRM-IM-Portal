/**
 * 消息验证工具
 */

/**
 * 验证消息格式
 * @param {object} message - 待验证的消息
 * @returns {{valid: boolean, error: string|null}} 验证结果
 */
function validateMessage(message) {
  if (!message || typeof message !== 'object') {
    return { valid: false, error: 'Message must be an object' };
  }

  const requiredFields = ['type', 'version', 'payload', 'timestamp'];
  for (const field of requiredFields) {
    if (!(field in message)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  if (typeof message.type !== 'string') {
    return { valid: false, error: 'Field "type" must be a string' };
  }

  if (typeof message.version !== 'string') {
    return { valid: false, error: 'Field "version" must be a string' };
  }

  if (typeof message.timestamp !== 'number') {
    return { valid: false, error: 'Field "timestamp" must be a number' };
  }

  // 验证版本号
  if (message.version !== 'v1') {
    return { valid: false, error: `Unsupported version: ${message.version}` };
  }

  return { valid: true, error: null };
}

/**
 * 验证账户数据
 * @param {object} account - 账户对象
 * @returns {{valid: boolean, error: string|null}} 验证结果
 */
function validateAccount(account) {
  if (!account || typeof account !== 'object') {
    return { valid: false, error: 'Account must be an object' };
  }

  const requiredFields = ['platform', 'account_name', 'account_id', 'credentials'];
  for (const field of requiredFields) {
    if (!(field in account)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  // 验证平台类型
  const supportedPlatforms = ['douyin']; // 初期仅支持抖音
  if (!supportedPlatforms.includes(account.platform)) {
    return { valid: false, error: `Unsupported platform: ${account.platform}` };
  }

  // 验证账户名称长度
  if (account.account_name.length < 1 || account.account_name.length > 50) {
    return { valid: false, error: 'Account name must be 1-50 characters' };
  }

  // 验证监控间隔
  if (account.monitor_interval !== undefined) {
    if (account.monitor_interval < 10 || account.monitor_interval > 300) {
      return { valid: false, error: 'Monitor interval must be 10-300 seconds' };
    }
  }

  return { valid: true, error: null };
}

module.exports = {
  validateMessage,
  validateAccount,
};
