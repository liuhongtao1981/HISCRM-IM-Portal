const winston = require('winston');
const path = require('path');
const fs = require('fs');

/**
 * 获取统一的日志目录
 * 优先级: 环境变量 > 自动推断 > 默认相对路径
 */
function getLogDir(serviceName) {
  // 1. 优先使用环境变量
  if (process.env.LOG_DIR) {
    return process.env.LOG_DIR;
  }

  // 2. 根据服务名称自动推断日志目录
  const PROJECT_ROOT = path.resolve(__dirname, '../../..');

  // Master 相关服务（优先匹配，因为 worker-dao 也包含 worker）
  if (serviceName.includes('master') ||
      serviceName.includes('-dao') ||  // 匹配 xxx-dao 格式
      serviceName.includes('notification')) {
    return path.join(PROJECT_ROOT, 'packages/master/logs');
  }

  // Worker 相关服务
  if (serviceName.includes('worker') ||
      serviceName.includes('platform') ||
      serviceName.includes('data-manager') ||
      serviceName.includes('douyin') ||  // 抖音相关模块
      serviceName.includes('xiaohongshu') ||  // 小红书相关模块
      serviceName.includes('reply') ||  // 回复相关模块
      serviceName.includes('browser-manager') ||
      serviceName.includes('crawl-') ||
      serviceName.includes('spider') ||
      serviceName.includes('api-interceptor') ||
      serviceName.includes('cache-')) {
    return path.join(PROJECT_ROOT, 'packages/worker/logs');
  }

  // Admin Web 相关服务
  if (serviceName.includes('admin')) {
    return path.join(PROJECT_ROOT, 'packages/admin-web/logs');
  }

  // 默认: 项目根目录下的 logs
  return path.join(PROJECT_ROOT, 'logs');
}

/**
 * 清理文件名中的非法字符
 * Windows 不允许: < > : " / \ | ? *
 * @param {string} filename - 原始文件名
 * @returns {string} 清理后的文件名
 */
function sanitizeFilename(filename) {
  return filename.replace(/[<>:"/\\|?*]/g, '_');
}

/**
 * 创建Winston logger实例
 * @param {string} serviceName - 服务名称 (master/worker/client)
 * @param {string} [logDir] - 日志目录路径（可选，不指定则自动推断）
 * @returns {winston.Logger} Logger实例
 */
function createLogger(serviceName, logDir) {
  // 如果未指定 logDir，自动推断
  if (!logDir) {
    logDir = getLogDir(serviceName);
  }

  // 确保日志目录存在
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // 清理服务名称中的非法字符
  const safeServiceName = sanitizeFilename(serviceName);

  const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

  const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: serviceName },
    transports: [
      // Console transport (开发环境彩色输出)
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, service, requestId, ...meta }) => {
            let msg = `${timestamp} [${service}] ${level}: ${message}`;
            if (requestId) {
              msg += ` (reqId: ${requestId})`;
            }
            if (Object.keys(meta).length > 0) {
              msg += ` ${JSON.stringify(meta)}`;
            }
            return msg;
          })
        ),
      }),

      // File transport (生产环境JSON格式)
      new winston.transports.File({
        filename: path.join(logDir, `${safeServiceName}-error.log`),
        level: 'error',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
      }),

      new winston.transports.File({
        filename: path.join(logDir, `${safeServiceName}.log`),
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
      }),
    ],
  });

  return logger;
}

// 默认logger(用于shared模块)
const logger = createLogger('shared');

module.exports = logger;
module.exports.createLogger = createLogger;
