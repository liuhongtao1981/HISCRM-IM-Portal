const { createLogger } = require('../packages/shared/utils/logger');

const logger = createLogger('test-worker');

console.log('Logger 结构:');
console.log('transports数量:', logger.transports.length);

logger.transports.forEach((transport, index) => {
  console.log(`\n传输器 ${index}:`);
  console.log('  类型:', transport.constructor.name);
  console.log('  filename:', transport.filename);
  console.log('  dirname:', transport.dirname);
  console.log('  所有属性:', Object.keys(transport));
});
