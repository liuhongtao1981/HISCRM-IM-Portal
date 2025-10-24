/**
 * 持续监控数据入库情况
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');

let lastMessageCount = 0;
let lastConvCount = 0;
let checkCount = 0;

console.log('\n========================================');
console.log('👀 持续监控数据入库情况');
console.log('========================================\n');
console.log('每 5 秒检查一次，最多检查 18 次（90秒）\n');

const interval = setInterval(() => {
  checkCount++;

  const db = new Database(dbPath);
  const msgs = db.prepare('SELECT COUNT(*) as count FROM direct_messages').get().count;
  const convs = db.prepare('SELECT COUNT(*) as count FROM conversations').get().count;
  db.close();

  const now = new Date().toLocaleTimeString('zh-CN');
  console.log(`[${now}] 第 ${checkCount} 次检查: 📩 私信 ${msgs} 条, 💬 会话 ${convs} 个`);

  if (msgs > lastMessageCount || convs > lastConvCount) {
    console.log('\n✅ 发现新数据入库！\n');

    const db2 = new Database(dbPath);
    const recent = db2.prepare(`
      SELECT * FROM direct_messages
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    console.log('最新 5 条消息:\n');
    recent.forEach((m, i) => {
      console.log(`  ${i + 1}. 消息ID: ${m.platform_message_id}`);
      console.log(`     发送者ID: ${m.platform_sender_id || '(无)'}`);
      console.log(`     昵称: ${m.sender_nickname || '(无)'}`);
      console.log(`     头像: ${m.sender_avatar ? '有' : '(无)'}`);
      console.log(`     内容: ${(m.content || '').substring(0, 30)}...`);
      console.log('');
    });

    db2.close();

    clearInterval(interval);
    console.log('========================================');
    console.log('✅ 监控完成！');
    console.log('========================================\n');
    process.exit(0);
  }

  lastMessageCount = msgs;
  lastConvCount = convs;

  if (checkCount >= 18) {
    console.log('\n⏱️  已检查 90 秒，未发现新数据入库\n');
    console.log('========================================');
    console.log('⚠️  可能原因：');
    console.log('   1. 账户未登录 (login_status: not_logged_in)');
    console.log('   2. Worker 未自动触发爬虫任务');
    console.log('   3. 爬虫执行失败');
    console.log('========================================\n');
    clearInterval(interval);
    process.exit(0);
  }
}, 5000);

// 首次立即执行
console.log(`[${new Date().toLocaleTimeString('zh-CN')}] 开始监控...\n`);
