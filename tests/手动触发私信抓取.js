/**
 * 手动触发私信抓取任务，验证用户信息提取功�?
 */

const Database = require('better-sqlite3');
const path = require('path');
const io = require('socket.io-client');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n========================================');
console.log('🔥 手动触发私信抓取任务');
console.log('========================================\n');

// 1. 获取账户信息
const account = db.prepare('SELECT * FROM accounts WHERE platform = ?').get('douyin');
if (!account) {
  console.log('�?未找到抖音账�?);
  db.close();
  process.exit(1);
}

console.log('📱 目标账户:');
console.log('  ID:', account.id);
console.log('  用户�?', account.platform_username || '(�?');
console.log('');

// 2. 获取 Worker 信息
const worker = db.prepare('SELECT * FROM workers WHERE status = ? LIMIT 1').get('online');
if (!worker) {
  console.log('�?未找到在�?Worker');
  db.close();
  process.exit(1);
}

console.log('🔧 目标 Worker:');
console.log('  ID:', worker.id);
console.log('  状�?', worker.status);
console.log('');

db.close();

// 3. 连接 Master �?admin 命名空间
console.log('🔌 连接�?Master 服务�?..');
const socket = io('http://localhost:3000/admin', {
  reconnection: false,
  timeout: 5000
});

socket.on('connect', () => {
  console.log('�?已连接到 Master\n');
  console.log('📤 发送私信抓取任�?..\n');

  // 发送任务指�?
  socket.emit('MASTER_TASK_ASSIGN', {
    messageType: 'MASTER_TASK_ASSIGN',
    data: {
      taskId: `manual_dm_task_${Date.now()}`,
      workerId: worker.id,
      accountId: account.id,
      taskType: 'crawl_direct_messages',
      priority: 'high',
      params: {
        maxConversations: 5,
        maxMessagesPerConversation: 20
      }
    },
    timestamp: Date.now()
  });

  console.log('�?任务已发送\n');
  console.log('�?等待 30 秒让爬虫执行...\n');

  // 30秒后检查结�?
  setTimeout(async () => {
    const db2 = new Database(dbPath);

    const totalMessages = db2.prepare('SELECT COUNT(*) as count FROM direct_messages WHERE account_id = ?').get(account.id).count;
    const recentMessages = db2.prepare(`
      SELECT * FROM direct_messages
      WHERE account_id = ?
      ORDER BY created_at DESC
      LIMIT 3
    `).all(account.id);

    console.log('========================================');
    console.log('📊 抓取结果');
    console.log('========================================\n');
    console.log('  总消息数:', totalMessages);

    if (recentMessages.length > 0) {
      console.log('\n  最�?3 条消�?\n');
      recentMessages.forEach((msg, i) => {
        console.log(`    ${i + 1}. ${msg.platform_message_id}`);
        console.log(`       发送者ID: ${msg.platform_sender_id || '(�?'}`);
        console.log(`       昵称: ${msg.sender_nickname || '(�?'}`);
        console.log(`       头像: ${msg.sender_avatar ? '�? : '(�?'}`);
        console.log(`       内容: ${(msg.content || '').substring(0, 30)}...`);
        console.log('');
      });
    }

    db2.close();
    socket.close();
    process.exit(0);
  }, 30000);
});

socket.on('connect_error', (err) => {
  console.error('�?连接 Master 失败:', err.message);
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('\n🔌 已断开连接');
});
