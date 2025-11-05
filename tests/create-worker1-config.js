/**
 * 创建 worker1 配置记录
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n=== 创建 worker1 配置 ===\n');

// 检查是否已存在
const existing = db.prepare('SELECT * FROM worker_configs WHERE id = ?').get('worker1');

if (existing) {
  console.log('✅ worker1 配置已存在,无需创建');
  db.close();
  process.exit(0);
}

// 创建默认配置
const insert = db.prepare(`
  INSERT INTO worker_configs (
    id,
    monitoring_interval_seconds,
    crawl_comments_enabled,
    crawl_direct_messages_enabled,
    direct_message_crawl_depth,
    max_concurrent_tasks,
    task_timeout_seconds,
    retry_max_attempts,
    retry_delay_seconds,
    browser_headless,
    browser_timeout_seconds,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const now = Math.floor(Date.now() / 1000);

insert.run(
  'worker1',
  20,      // monitoring_interval_seconds - 20秒监控间隔
  1,       // crawl_comments_enabled - 启用评论爬取
  1,       // crawl_direct_messages_enabled - 启用私信爬取
  'full',  // direct_message_crawl_depth - 完整爬取
  5,       // max_concurrent_tasks
  300,     // task_timeout_seconds
  3,       // retry_max_attempts
  5,       // retry_delay_seconds
  1,       // browser_headless - 无头模式
  30,      // browser_timeout_seconds
  now,     // created_at
  now      // updated_at
);

console.log('✅ worker1 配置创建成功!');
console.log('\n配置详情:');
console.log('  监控间隔: 20 秒');
console.log('  爬取评论: 启用');
console.log('  爬取私信: 启用');
console.log('  私信深度: full (完整爬取)');
console.log('  最大并发: 5');
console.log('  超时时间: 300 秒');
console.log('  重试次数: 3');

db.close();

console.log('\n✨ 请重启 Worker 以应用新配置');
