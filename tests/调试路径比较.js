const path = require('path');
const { createLogger } = require('../packages/shared/utils/logger');

const PROJECT_ROOT = path.resolve(__dirname, '..');
console.log('PROJECT_ROOT:', PROJECT_ROOT);

const logger = createLogger('shared');
const fileTransport = logger.transports.find(t => t.constructor.name === 'File');

console.log('\nshared 服务:');
console.log('  actualDir:', fileTransport.dirname);
console.log('  expectedDir (原始):', 'logs');
console.log('  expectedFullPath:', path.join(PROJECT_ROOT, 'logs'));
console.log('  normalizedActual:', path.normalize(fileTransport.dirname));
console.log('  normalizedExpected:', path.normalize(path.join(PROJECT_ROOT, 'logs')));
console.log('  相等?:', path.normalize(fileTransport.dirname) === path.normalize(path.join(PROJECT_ROOT, 'logs')));

// 打印详细信息
console.log('\n详细信息:');
console.log('  actualDir length:', fileTransport.dirname.length);
console.log('  expectedFullPath length:', path.join(PROJECT_ROOT, 'logs').length);
console.log('  actualDir bytes:', Buffer.from(fileTransport.dirname).toJSON());
console.log('  expectedFullPath bytes:', Buffer.from(path.join(PROJECT_ROOT, 'logs')).toJSON());
