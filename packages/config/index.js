/**
 * HisCRM-IM 配置管理模块
 * 提供统一的配置加载和管理
 */

const fs = require('fs');
const path = require('path');

/**
 * 获取配置文件路径
 */
function getConfigPath() {
  // 优先级: 环境变量 > 根目录 > packages/config
  if (process.env.CONFIG_FILE) {
    return process.env.CONFIG_FILE;
  }

  const rootConfig = path.join(__dirname, '../../config.json');
  if (fs.existsSync(rootConfig)) {
    return rootConfig;
  }

  return path.join(__dirname, 'config/config.json');
}

/**
 * 加载配置文件
 */
function loadConfig() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn(`[CONFIG] 加载配置文件失败: ${error.message}`);
  }
  return null;
}

/**
 * 生成默认配置
 */
function generateDefaultConfig(environment = 'development') {
  return {
    environment,
    paths: {
      projectRoot: './',
      master: {
        data: './packages/master/data',
        logs: './packages/master/logs'
      },
      worker: {
        data: './packages/worker/data',
        platforms: './packages/worker/src/platforms',
        logs: './packages/worker/logs'
      }
    }
  };
}

module.exports = {
  getConfigPath,
  loadConfig,
  generateDefaultConfig,
};
