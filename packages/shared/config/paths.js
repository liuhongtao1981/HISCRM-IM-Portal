/**
 * 共享路径配置
 * Master 和 Worker 都可以使用这个配置来获取各种路径
 * 支持三层配置加载：环境变量 > config.json > 默认配置
 */

const path = require('path');
const fs = require('fs');

/**
 * 获取项目根目录
 * 从 packages/shared/config/paths.js 开始计算
 * 或者从环境变量 APP_ROOT 获取（用于打包部署）
 */
function getProjectRoot() {
  // 首先检查环境变量 (用于打包部署)
  if (process.env.APP_ROOT) {
    return process.env.APP_ROOT;
  }

  // 其次检查 NODE_PATH (用于某些部署方式)
  if (process.env.NODE_PATH) {
    return process.env.NODE_PATH;
  }

  // 默认: 从当前文件位置计算
  // __dirname = packages/shared/config
  // projectRoot = packages/shared/config/../../../../
  return path.resolve(__dirname, '../../../');
}

const PROJECT_ROOT = getProjectRoot();

/**
 * 加载配置文件 (config.json)
 * 支持从项目根目录或环境变量指定的路径加载
 */
function loadConfigFile() {
  try {
    // 从环境变量中获取配置文件路径
    let configPath = process.env.CONFIG_FILE;

    // 如果没有指定，使用默认位置
    if (!configPath) {
      configPath = path.join(PROJECT_ROOT, 'config.json');
    }

    // 如果配置文件存在，加载它
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);
      console.log(`[PATHS] 已加载配置文件: ${configPath}`);
      return config;
    }
  } catch (error) {
    console.warn(`[PATHS] 加载配置文件失败: ${error.message}`);
  }

  return null;
}

const CONFIG = loadConfigFile();

/**
 * 解析路径配置
 * 优先级: 环境变量 > config.json > 默认配置
 */
function resolvePath(envVar, configPath, defaultPath) {
  // 1. 检查环境变量 (最高优先级)
  if (process.env[envVar]) {
    const resolvedPath = path.resolve(process.env[envVar]);
    return resolvedPath;
  }

  // 2. 检查 config.json 配置 (中优先级)
  if (CONFIG && configPath) {
    const keys = configPath.split('.');
    let value = CONFIG;
    for (const key of keys) {
      value = value?.[key];
    }
    if (value) {
      // 如果配置是相对路径，相对于项目根目录解析
      if (!path.isAbsolute(value)) {
        return path.join(PROJECT_ROOT, value);
      }
      return value;
    }
  }

  // 3. 使用默认路径 (最低优先级)
  return path.isAbsolute(defaultPath)
    ? defaultPath
    : path.join(PROJECT_ROOT, defaultPath);
}

/**
 * 所有路径配置
 * 支持通过环境变量、config.json 或默认值覆盖
 */
const PATHS = {
  // 项目根目录 (通过环境变量 APP_ROOT 覆盖)
  project_root: PROJECT_ROOT,

  // Master 相关
  master: {
    src: resolvePath(
      'MASTER_SRC_PATH',
      'paths.master.src',
      path.join(PROJECT_ROOT, 'packages/master/src')
    ),
    data: resolvePath(
      'MASTER_DATA_PATH',
      'paths.master.data',
      path.join(PROJECT_ROOT, 'packages/master/data')
    ),
    logs: resolvePath(
      'MASTER_LOGS_PATH',
      'paths.master.logs',
      path.join(PROJECT_ROOT, 'packages/master/logs')
    ),
    get database() {
      const dbPath = resolvePath(
        'DATABASE_PATH',
        'paths.database.path',
        path.join(PROJECT_ROOT, 'packages/master/data/master.db')
      );
      return dbPath;
    },
  },

  // Worker 相关
  worker: {
    src: resolvePath(
      'WORKER_SRC_PATH',
      'paths.worker.src',
      path.join(PROJECT_ROOT, 'packages/worker/src')
    ),
    data: resolvePath(
      'WORKER_DATA_PATH',
      'paths.worker.data',
      path.join(PROJECT_ROOT, 'packages/worker/data')
    ),
    logs: resolvePath(
      'WORKER_LOGS_PATH',
      'paths.worker.logs',
      path.join(PROJECT_ROOT, 'packages/worker/logs')
    ),
    // ⭐ 关键：平台目录的统一配置，支持环境变量覆盖
    platforms: resolvePath(
      'WORKER_PLATFORMS_PATH',
      'paths.worker.platforms',
      path.join(PROJECT_ROOT, 'packages/worker/src/platforms')
    ),
  },

  // Admin Web 相关
  admin: {
    src: resolvePath(
      'ADMIN_SRC_PATH',
      'paths.admin.src',
      path.join(PROJECT_ROOT, 'packages/admin-web/src')
    ),
    public: resolvePath(
      'ADMIN_PUBLIC_PATH',
      'paths.admin.public',
      path.join(PROJECT_ROOT, 'packages/admin-web/public')
    ),
  },

  // Desktop Client 相关
  desktop: {
    src: resolvePath(
      'DESKTOP_SRC_PATH',
      'paths.desktop.src',
      path.join(PROJECT_ROOT, 'packages/desktop-client/src')
    ),
  },

  // Mobile Client 相关
  mobile: {
    src: resolvePath(
      'MOBILE_SRC_PATH',
      'paths.mobile.src',
      path.join(PROJECT_ROOT, 'packages/mobile-client/src')
    ),
  },

  // Shared 相关
  shared: {
    src: resolvePath(
      'SHARED_SRC_PATH',
      'paths.shared.src',
      path.join(PROJECT_ROOT, 'packages/shared')
    ),
    get utils() {
      return path.join(this.src, 'utils');
    },
    get models() {
      return path.join(this.src, 'models');
    },
    get protocol() {
      return path.join(this.src, 'protocol');
    },
    get config() {
      return path.join(this.src, 'config');
    },
  },

  // 文档相关
  docs: {
    root: resolvePath(
      'DOCS_PATH',
      'paths.docs.root',
      path.join(PROJECT_ROOT, '.docs')
    ),
  },
};

/**
 * 辅助函数：验证路径是否存在
 */
function validatePath(pathName, fullPath) {
  const fs = require('fs');
  if (!fs.existsSync(fullPath)) {
    console.warn(`Warning: ${pathName} does not exist at ${fullPath}`);
  }
  return fullPath;
}

/**
 * 辅助函数：获取相对于项目根目录的相对路径
 */
function getRelativePath(fullPath) {
  return path.relative(PROJECT_ROOT, fullPath);
}

/**
 * 输出当前的路径配置信息 (用于调试)
 */
function printConfig() {
  console.log('[PATHS] 配置信息:');
  console.log(`  项目根目录: ${PROJECT_ROOT}`);
  console.log(`  Master 数据: ${PATHS.master.data}`);
  console.log(`  Worker 数据: ${PATHS.worker.data}`);
  console.log(`  Worker 平台: ${PATHS.worker.platforms}`);
  console.log(`  Master 日志: ${PATHS.master.logs}`);
  console.log(`  Worker 日志: ${PATHS.worker.logs}`);
  console.log(`  数据库: ${PATHS.master.database}`);
  if (CONFIG) {
    console.log(`  [已加载 config.json]`);
  }
}

/**
 * 获取配置信息对象 (用于 API 响应)
 */
function getConfigInfo() {
  return {
    projectRoot: PROJECT_ROOT,
    environment: process.env.NODE_ENV || 'development',
    configLoaded: !!CONFIG,
    paths: {
      master: {
        data: PATHS.master.data,
        logs: PATHS.master.logs,
        database: PATHS.master.database,
      },
      worker: {
        data: PATHS.worker.data,
        logs: PATHS.worker.logs,
        platforms: PATHS.worker.platforms,
      },
    },
  };
}

module.exports = {
  PATHS,
  CONFIG,
  getProjectRoot,
  validatePath,
  getRelativePath,
  printConfig,
  getConfigInfo,
};
