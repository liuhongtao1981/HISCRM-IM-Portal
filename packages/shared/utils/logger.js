const winston = require('winston');
const path = require('path');

/**
 * 创建Winston logger实例
 * @param {string} serviceName - 服务名称 (master/worker/client)
 * @param {string} [logDir] - 日志目录路径
 * @returns {winston.Logger} Logger实例
 */
function createLogger(serviceName, logDir = './logs') {
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
        filename: path.join(logDir, `${serviceName}-error.log`),
        level: 'error',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
      }),

      new winston.transports.File({
        filename: path.join(logDir, `${serviceName}.log`),
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
