/**
 * 测试优雅退出功能
 * 启动服务器2秒后发送 SIGINT 信号
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('Starting master server...');

const masterProcess = spawn('node', [path.join(__dirname, 'src/index.js')], {
  stdio: 'inherit',
  cwd: __dirname
});

masterProcess.on('error', (error) => {
  console.error('Failed to start process:', error);
  process.exit(1);
});

// 等待2秒让服务器启动
setTimeout(() => {
  console.log('\n\n========================================');
  console.log('Sending SIGINT to master process...');
  console.log('========================================\n');

  // 发送 SIGINT 信号
  masterProcess.kill('SIGINT');

  // 如果 15 秒后还没退出，强制杀死
  setTimeout(() => {
    if (!masterProcess.killed) {
      console.error('Process did not exit gracefully, force killing...');
      masterProcess.kill('SIGKILL');
      process.exit(1);
    }
  }, 15000);
}, 2000);

masterProcess.on('exit', (code, signal) => {
  console.log('\n========================================');
  console.log(`Process exited with code: ${code}, signal: ${signal}`);
  console.log('========================================\n');

  if (code === 0) {
    console.log('✅ Graceful shutdown successful!');
    process.exit(0);
  } else {
    console.log('❌ Graceful shutdown failed!');
    process.exit(1);
  }
});
