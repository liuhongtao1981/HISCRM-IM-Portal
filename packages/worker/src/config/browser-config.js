/**
 * 浏览器架构配置
 *
 * 系统使用多Browser架构:
 * - 每个账户独立Browser进程
 * - 完美指纹隔离 (100%)
 * - 指纹稳定持久化
 *
 * 详细文档: ../../../.docs/architecture/多Browser架构详解.md
 */

const BrowserManagerV2 = require('../browser/browser-manager-v2');

/**
 * 获取浏览器管理器实例
 * @param {string} workerId - Worker ID
 * @param {object} options - 配置选项
 * @returns {BrowserManagerV2}
 */
function getBrowserManager(workerId, options = {}) {
  return new BrowserManagerV2(workerId, options);
}

/**
 * 获取架构配置信息
 * @returns {object}
 */
function getArchitectureInfo() {
  return {
    type: 'multi',
    name: '多Browser架构',
    description: '每个账户独立Browser进程',
    fingerprint_isolation: '100% (完美隔离)',
    memory_per_account: '~200MB',
    startup_time: '~5秒/账户',
    max_recommended_accounts: 10,
    features: [
      '100%指纹隔离,无关联风险',
      '进程隔离,崩溃不互相影响',
      '指纹稳定,不会频繁变化',
      '可独立配置代理和环境'
    ],
    notes: [
      '内存占用: ~200MB/账户',
      '启动时间: ~5秒/账户',
      '建议最大账户数: ≤10个/Worker'
    ],
    docs: './.docs/architecture/多Browser架构详解.md'
  };
}

module.exports = {
  getBrowserManager,
  getArchitectureInfo
};
