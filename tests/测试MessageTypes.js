/**
 * 测试 MessageTypes 是否包含 WORKER_DATA_SYNC
 */

const { MessageTypes } = require('../packages/shared/protocol/messages');

console.log('==================================================');
console.log('测试 MessageTypes 导出');
console.log('==================================================\n');

console.log('MessageTypes 类型:', typeof MessageTypes);
console.log('MessageTypes 是否�?undefined:', MessageTypes === undefined);

console.log('\n检�?WORKER_DATA_SYNC:');
console.log('  存在:', 'WORKER_DATA_SYNC' in MessageTypes);
console.log('  �?', MessageTypes.WORKER_DATA_SYNC);

console.log('\n所�?Worker 消息类型:');
Object.keys(MessageTypes).filter(key => key.startsWith('WORKER')).forEach(key => {
  console.log(`  ${key}: ${MessageTypes[key]}`);
});

console.log('\n==================================================');
