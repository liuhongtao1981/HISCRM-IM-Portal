/**
 * 检�?Worker 和账户状�?
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('=== Workers 状�?===');
const workers = db.prepare('SELECT id, status, last_heartbeat, assigned_accounts FROM workers').all();

if (workers.length === 0) {
  console.log('�?没有 Worker 注册\n');
} else {
  workers.forEach(w => {
    const lastHeartbeat = new Date(w.last_heartbeat * 1000);
    const now = Date.now();
    const timeSinceHeartbeat = Math.floor((now - w.last_heartbeat * 1000) / 1000);

    console.log(`Worker: ${w.id}`);
    console.log(`  状�? ${w.status}`);
    console.log(`  最后心�? ${lastHeartbeat.toLocaleString('zh-CN')} (${timeSinceHeartbeat}秒前)`);
    console.log(`  分配账户�? ${w.assigned_accounts}`);
    console.log();
  });
}

console.log('=== 账户状�?===');
const accounts = db.prepare('SELECT id, account_name, login_status, worker_status, assigned_worker_id, last_crawl_time FROM accounts').all();

if (accounts.length === 0) {
  console.log('�?没有账户配置\n');
} else {
  accounts.forEach(acc => {
    console.log(`账户: ${acc.account_name}`);
    console.log(`  登录状�? ${acc.login_status}`);
    console.log(`  Worker状�? ${acc.worker_status}`);
    console.log(`  分配�? ${acc.assigned_worker_id || '未分�?}`);

    if (acc.last_crawl_time) {
      const lastCrawl = new Date(acc.last_crawl_time * 1000);
      console.log(`  最后爬�? ${lastCrawl.toLocaleString('zh-CN')}`);
    } else {
      console.log(`  最后爬�? 从未爬取`);
    }
    console.log();
  });
}

console.log('=== 爬取数据统计 ===');
const stats = {
  contents: db.prepare('SELECT COUNT(*) as c FROM contents').get().c,
  comments: db.prepare('SELECT COUNT(*) as c FROM comments').get().c,
  discussions: db.prepare('SELECT COUNT(*) as c FROM discussions').get().c,
  direct_messages: db.prepare('SELECT COUNT(*) as c FROM direct_messages').get().c,
  conversations: db.prepare('SELECT COUNT(*) as c FROM conversations').get().c
};

console.log(`作品 (contents): ${stats.contents}`);
console.log(`评论 (comments): ${stats.comments}`);
console.log(`讨论 (discussions): ${stats.discussions}`);
console.log(`私信 (direct_messages): ${stats.direct_messages}`);
console.log(`会话 (conversations): ${stats.conversations}`);

db.close();
