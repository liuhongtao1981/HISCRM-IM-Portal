/**
 * 快速检�?Master 状�? * 运行前确�?Master 已启�? */

const http = require('http');

console.log('='.repeat(80));
console.log('�?快速检�?Master 状�?);
console.log('='.repeat(80));
console.log('');

// 检�?Master HTTP API
const checkAPI = () => {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3000/api/health', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('�?Master HTTP API 正常 (端口 3000)');
          resolve(true);
        } else {
          console.log(`⚠️  Master HTTP API 响应异常 (状态码: ${res.statusCode})`);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.log('�?Master HTTP API 无响�?);
      console.log(`   错误: ${err.message}`);
      console.log('');
      console.log('请先启动 Master:');
      console.log('   cd packages/master && npm start');
      resolve(false);
    });

    req.setTimeout(3000, () => {
      req.destroy();
      console.log('�?Master HTTP API 超时');
      resolve(false);
    });
  });
};

// 检�?WebSocket 端口
const checkWebSocket = () => {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();

    socket.setTimeout(2000);

    socket.on('connect', () => {
      console.log('�?WebSocket 端口可访�?(端口 3000)');
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      console.log('�?WebSocket 端口不可访问');
      resolve(false);
    });

    socket.on('timeout', () => {
      console.log('�?WebSocket 端口超时');
      socket.destroy();
      resolve(false);
    });

    socket.connect(3000, 'localhost');
  });
};

// 检查数据库文件
const checkDatabase = () => {
  const fs = require('fs');
  const path = require('path');
  const dbPath = path.join(__dirname, '../packages/master/data/master.db');

  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    console.log('�?Master 数据库文件存�?);
    console.log(`   大小: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   修改时间: ${stats.mtime.toLocaleString('zh-CN')}`);
    return true;
  } else {
    console.log('�?Master 数据库文件不存在');
    console.log(`   路径: ${dbPath}`);
    return false;
  }
};

// 主函�?(async () => {
  console.log('1️⃣ 检查数据库文件...');
  const dbOk = checkDatabase();
  console.log('');

  console.log('2️⃣ 检�?HTTP API...');
  const apiOk = await checkAPI();
  console.log('');

  console.log('3️⃣ 检�?WebSocket 端口...');
  const wsOk = await checkWebSocket();
  console.log('');

  console.log('='.repeat(80));
  console.log('📊 检查结�?');
  console.log('='.repeat(80));
  console.log('');

  if (dbOk && apiOk && wsOk) {
    console.log('�?所有检查通过�?);
    console.log('');
    console.log('下一步：运行完整诊断');
    console.log('   node tests/debug-im-client-display.js');
    process.exit(0);
  } else {
    console.log('�?部分检查失�?);
    console.log('');
    console.log('请确认：');
    console.log('   1. Master 已启�? cd packages/master && npm start');
    console.log('   2. 端口 3000 未被占用');
    console.log('   3. 数据库文件存在且有数�?);
    console.log('');
    process.exit(1);
  }
})();
