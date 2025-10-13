const { v4: uuidv4 } = require('uuid');

/**
 * 生成请求ID
 * @returns {string} UUID格式的请求ID
 */
function generateRequestId() {
  return `req-${uuidv4()}`;
}

/**
 * Express中间件: 为每个请求生成并注入requestId
 * @param {object} req - Express请求对象
 * @param {object} res - Express响应对象
 * @param {function} next - Express next函数
 */
function requestIdMiddleware(req, res, next) {
  req.requestId = req.headers['x-request-id'] || generateRequestId();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

module.exports = {
  generateRequestId,
  requestIdMiddleware,
};
