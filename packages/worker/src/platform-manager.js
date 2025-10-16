/**
 * Platform Manager - 平台管理器
 * 负责自动发现、加载和管理平台脚本
 */

const fs = require('fs');
const path = require('path');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('platform-manager');

class PlatformManager {
  constructor(workerBridge, browserManager) {
    this.workerBridge = workerBridge;
    this.browserManager = browserManager;
    this.platforms = new Map(); // platformName -> Platform instance
    this.platformConfigs = new Map(); // platformName -> config
  }

  /**
   * 自动扫描并加载平台脚本
   */
  async loadPlatforms() {
    const platformsDir = path.join(__dirname, 'platforms');
    
    try {
      const entries = fs.readdirSync(platformsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        // 跳过 base 目录
        if (entry.name === 'base' || !entry.isDirectory()) {
          continue;
        }
        
        const platformDir = path.join(platformsDir, entry.name);
        const configPath = path.join(platformDir, 'config.json');
        const platformPath = path.join(platformDir, 'platform.js');
        
        // 检查配置文件和平台脚本是否存在
        if (!fs.existsSync(configPath) || !fs.existsSync(platformPath)) {
          logger.warn(`Skipping ${entry.name}: missing config.json or platform.js`);
          continue;
        }
        
        try {
          // 加载配置
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          
          // 加载平台类
          const PlatformClass = require(platformPath);
          
          // 实例化平台
          const platform = new PlatformClass(config, this.workerBridge, this.browserManager);
          
          // 注册平台
          this.platforms.set(config.platform, platform);
          this.platformConfigs.set(config.platform, config);
          
          logger.info(`✓ Loaded platform: ${config.displayName} (${config.platform}) v${config.version}`);
        } catch (error) {
          logger.error(`Failed to load platform ${entry.name}:`, error);
        }
      }
      
      logger.info(`Platform manager initialized with ${this.platforms.size} platforms`);
    } catch (error) {
      logger.error('Failed to scan platforms directory:', error);
      throw error;
    }
  }

  /**
   * 获取指定平台实例
   * @param {string} platformName - 平台名称
   * @returns {PlatformBase|null} 平台实例，如果不存在则返回 null
   */
  getPlatform(platformName) {
    const platform = this.platforms.get(platformName);
    
    if (!platform) {
      logger.warn(`Platform not found: ${platformName}`);
      return null;
    }
    
    return platform;
  }

  /**
   * 获取支持的平台列表
   * @returns {Array<string>} 平台名称列表
   */
  getSupportedPlatforms() {
    return Array.from(this.platforms.keys());
  }

  /**
   * 获取平台配置
   * @param {string} platformName - 平台名称
   * @returns {Object} 平台配置
   */
  getPlatformConfig(platformName) {
    return this.platformConfigs.get(platformName);
  }

  /**
   * 获取所有平台的能力列表
   * @returns {Array<Object>} 平台能力列表
   */
  getAllPlatformCapabilities() {
    const capabilities = [];
    
    for (const [name, config] of this.platformConfigs.entries()) {
      capabilities.push({
        platform: name,
        displayName: config.displayName,
        version: config.version,
        capabilities: config.capabilities || [],
      });
    }
    
    return capabilities;
  }

  /**
   * 检查是否支持指定平台
   * @param {string} platformName - 平台名称
   * @returns {boolean}
   */
  isPlatformSupported(platformName) {
    return this.platforms.has(platformName);
  }

  /**
   * 为账户创建独立的上下文环境
   * @param {string} accountId - 账户 ID
   * @param {string} platformName - 平台名称
   * @param {Object} proxyConfig - 代理配置
   */
  async createAccountContext(accountId, platformName, proxyConfig = null) {
    const platform = this.getPlatform(platformName);
    return await platform.createAccountContext(accountId, proxyConfig);
  }

  /**
   * 获取账户的上下文环境
   * @param {string} accountId - 账户 ID
   * @param {string} platformName - 平台名称
   */
  getAccountContext(accountId, platformName) {
    const platform = this.getPlatform(platformName);
    return platform.getAccountContext(accountId);
  }

  /**
   * 清理所有平台资源
   */
  async cleanup() {
    logger.info('Cleaning up all platforms...');
    
    for (const [name, platform] of this.platforms.entries()) {
      try {
        // 清理平台内的所有账户上下文
        for (const [accountId, context] of platform.accountContexts.entries()) {
          await platform.cleanup(accountId);
        }
        logger.info(`Cleaned up platform: ${name}`);
      } catch (error) {
        logger.error(`Failed to cleanup platform ${name}:`, error);
      }
    }
    
    logger.info('All platforms cleaned up');
  }
}

module.exports = PlatformManager;
