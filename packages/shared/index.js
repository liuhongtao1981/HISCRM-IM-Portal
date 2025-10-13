/**
 * Shared模块入口
 * 导出协议定义、模型、工具函数
 */

module.exports = {
  // 协议定义
  messages: require('./protocol/messages'),
  events: require('./protocol/events'),

  // 工具函数
  logger: require('./utils/logger'),
  requestId: require('./utils/request-id'),
  validator: require('./utils/validator'),
};
