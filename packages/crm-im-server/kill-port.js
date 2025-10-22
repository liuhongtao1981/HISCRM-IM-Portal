/**
 * 查找并结束占用指定端口的进程
 */

const { exec } = require('child_process');
const port = process.argv[2] || 8080;

console.log(`正在查找占用端口 ${port} 的进程...`);

// Windows 命令查找占用端口的进程
const findCmd = `netstat -ano | findstr :${port}`;

exec(findCmd, (error, stdout, stderr) => {
  if (error || !stdout) {
    console.log(`端口 ${port} 未被占用，可以启动服务器`);
    process.exit(0);
    return;
  }

  // 解析 PID
  const lines = stdout.split('\n').filter(line => line.trim());
  const pids = new Set();

  lines.forEach(line => {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && !isNaN(pid)) {
      pids.add(pid);
    }
  });

  if (pids.size === 0) {
    console.log(`端口 ${port} 未被占用`);
    process.exit(0);
    return;
  }

  console.log(`发现 ${pids.size} 个进程占用端口 ${port}:`);
  pids.forEach(pid => console.log(`  - PID: ${pid}`));

  // 结束所有占用端口的进程
  const killPromises = Array.from(pids).map(pid => {
    return new Promise((resolve) => {
      console.log(`正在结束进程 ${pid}...`);
      exec(`taskkill /F /PID ${pid}`, (error) => {
        if (error) {
          console.log(`  ✗ 无法结束进程 ${pid}`);
        } else {
          console.log(`  ✓ 进程 ${pid} 已结束`);
        }
        resolve();
      });
    });
  });

  Promise.all(killPromises).then(() => {
    console.log('所有进程已处理完成');
    process.exit(0);
  });
});
