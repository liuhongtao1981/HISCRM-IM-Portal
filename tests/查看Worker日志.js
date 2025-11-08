/**
 * 查看 Worker 日志
 *
 * 检�?Worker 进程的日志输出，确认 checkLoginStatus() 是否被调�?
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🔍 正在查看 Worker PID 21840 的日�?..');
console.log('💡 提示：Worker 应该在标准输出中打印日志');
console.log('');

// Worker 日志应该�?Master 启动 Worker 时的标准输出�?
// 但由�?Master 使用 spawn，Worker 的输出可能被重定�?

console.log('⚠️  由于 Worker 是由 Master 启动的子进程，日志可能在 Master 的输出中');
console.log('');
console.log('请检�?Master 的日志，查找以下关键信息�?);
console.log('');
console.log('�?应该看到�?);
console.log('  [checkLoginStatus] 📍 Current URL: https://www.douyin.com/passport/web/login...');
console.log('  [checkLoginStatus] 🔍 Login session tab detected - checking CURRENT page without navigation');
console.log('  [checkLoginStatus] 👁�?Monitoring for: avatar, nickname, douyin ID...');
console.log('');
console.log('�?不应该看到：');
console.log('  [checkLoginStatus] 🌐 Not login session tab - navigating to...');
console.log('');
console.log('如果看不到这些日志，说明代码修改没有生效，需要重�?Worker');
