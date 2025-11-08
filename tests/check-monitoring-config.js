const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 监控配置检�?                                        �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

// 查看账户配置
const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';
const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);

if (account) {
  console.log('📊 账户配置�?);
  console.log(`  账户 ID: ${accountId.substring(0, 20)}...`);
  console.log(`  平台: ${account.platform}`);
  console.log(`  状�? ${account.status}`);
  console.log(`  Worker: ${account.assigned_worker_id || '未分�?}`);
  console.log(`  手动分配: ${account.is_manually_assigned === 1 ? '�? : '�?}`);
} else {
  console.log('�?账户不存�?);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 查看 Worker 配置
const workerConfig = db.prepare('SELECT * FROM worker_configs WHERE id = ?').get('worker1');
if (workerConfig) {
  console.log('🔧 Worker 配置 (worker1)�?);
  console.log(`  监控间隔: ${workerConfig.monitoring_interval_seconds} 秒`);
  console.log(`  爬取评论: ${workerConfig.crawl_comments_enabled === 1 ? '�?启用' : '�?禁用'}`);
  console.log(`  爬取私信: ${workerConfig.crawl_direct_messages_enabled === 1 ? '�?启用' : '�?禁用'}`);
  console.log(`  爬取作品: ${workerConfig.crawl_contents_enabled === 1 ? '�?启用' : '�?禁用'}`);
  console.log(`  爬取粉丝: ${workerConfig.crawl_fans_enabled === 1 ? '�?启用' : '�?禁用'}`);
} else {
  console.log('�?Worker 配置不存�?);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 检�?Worker 运行时状�?const workerRuntime = db.prepare('SELECT * FROM worker_runtime WHERE worker_id = ?').get('worker1');
if (workerRuntime) {
  console.log('📈 Worker 运行时状态：');
  console.log(`  状�? ${workerRuntime.status}`);
  console.log(`  PID: ${workerRuntime.process_id || '�?}`);
  const lastHeartbeat = workerRuntime.last_heartbeat_time ? new Date(workerRuntime.last_heartbeat_time).toLocaleString('zh-CN') : '�?;
  console.log(`  最后心�? ${lastHeartbeat}`);
  console.log(`  正在监控的账户数: ${workerRuntime.monitoring_accounts_count || 0}`);
}

db.close();
