/**
 * 测试脚本：检查登录成功后爬虫任务是否执行
 *
 * 使用方法：
 * node tests/测试爬虫任务执行.js
 */

const path = require('path');
const Database = require('better-sqlite3');

// 连接数据库
const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('='.repeat(80));
console.log('检查登录成功后的账户状态和爬虫任务');
console.log('='.repeat(80));
console.log('');

// 1. 查询账户信息
console.log('📊 1. 账户信息:');
console.log('-'.repeat(80));
const accounts = db.prepare(`
  SELECT
    id,
    platform,
    account_name,
    account_id,
    platform_user_id,
    login_status,
    worker_status,
    last_error_message,
    assigned_worker_id,
    created_at,
    updated_at
  FROM accounts
  ORDER BY updated_at DESC
`).all();

if (accounts.length === 0) {
  console.log('❌ 没有找到任何账户');
} else {
  accounts.forEach((acc, index) => {
    console.log(`\n[${index + 1}] 账户 ID: ${acc.id}`);
    console.log(`    平台: ${acc.platform}`);
    console.log(`    账户名: ${acc.account_name || '(未设置)'}`);
    console.log(`    账户ID: ${acc.account_id || '(无)'}`);
    console.log(`    平台用户ID: ${acc.platform_user_id || '❌ 缺失！'}`);
    console.log(`    登录状态: ${acc.login_status}`);
    console.log(`    Worker状态: ${acc.worker_status || '(无)'}`);
    console.log(`    分配Worker: ${acc.assigned_worker_id || '(未分配)'}`);
    console.log(`    错误信息: ${acc.last_error_message || '(无)'}`);
    console.log(`    更新时间: ${new Date(acc.updated_at * 1000).toLocaleString('zh-CN')}`);
  });
}

console.log('\n');

// 2. 查询Workers信息
console.log('🔄 2. Worker 注册信息:');
console.log('-'.repeat(80));
const workers = db.prepare(`
  SELECT
    id,
    status,
    assigned_accounts,
    last_heartbeat,
    started_at
  FROM workers
  ORDER BY last_heartbeat DESC
`).all();

if (workers.length === 0) {
  console.log('❌ 没有找到任何Worker');
} else {
  workers.forEach((worker, index) => {
    console.log(`\n[${index + 1}] Worker ID: ${worker.id}`);
    console.log(`    状态: ${worker.status}`);
    console.log(`    分配账户数: ${worker.assigned_accounts}`);
    console.log(`    最后心跳: ${new Date(worker.last_heartbeat * 1000).toLocaleString('zh-CN')}`);
    console.log(`    启动时间: ${new Date(worker.started_at * 1000).toLocaleString('zh-CN')}`);
  });
}

console.log('\n');

// 3. 查询监控任务
console.log('🕷️  3. 监控任务:');
console.log('-'.repeat(80));
const monitorTasks = db.prepare(`
  SELECT
    id,
    account_id,
    task_type,
    status,
    interval_seconds,
    last_run_time,
    next_run_time,
    created_at
  FROM monitoring_tasks
  ORDER BY created_at DESC
`).all();

if (monitorTasks.length === 0) {
  console.log('❌ 没有创建任何监控任务');
  console.log('原因：Worker需要在登录成功后创建监控任务');
} else {
  monitorTasks.forEach((task, index) => {
    console.log(`\n[${index + 1}] 任务 ID: ${task.id}`);
    console.log(`    账户 ID: ${task.account_id}`);
    console.log(`    任务类型: ${task.task_type}`);
    console.log(`    状态: ${task.status}`);
    console.log(`    间隔: ${task.interval_seconds} 秒`);
    console.log(`    最后运行: ${task.last_run_time ? new Date(task.last_run_time * 1000).toLocaleString('zh-CN') : '(从未运行)'}`);
    console.log(`    下次运行: ${task.next_run_time ? new Date(task.next_run_time * 1000).toLocaleString('zh-CN') : '(未计划)'}`);
    console.log(`    创建时间: ${new Date(task.created_at * 1000).toLocaleString('zh-CN')}`);
  });
}

console.log('\n');

// 4. 查询最近的评论数据
console.log('💬 4. 最近的评论数据（最多5条）:');
console.log('-'.repeat(80));
const comments = db.prepare(`
  SELECT
    id,
    account_id,
    work_id,
    comment_text,
    author_name,
    created_at
  FROM comments
  ORDER BY created_at DESC
  LIMIT 5
`).all();

if (comments.length === 0) {
  console.log('❌ 没有找到任何评论数据');
} else {
  comments.forEach((comment, index) => {
    const text = comment.comment_text || '';
    const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
    console.log(`\n[${index + 1}] 评论 ID: ${comment.id}`);
    console.log(`    账户 ID: ${comment.account_id}`);
    console.log(`    作品 ID: ${comment.work_id}`);
    console.log(`    评论内容: ${preview}`);
    console.log(`    作者: ${comment.author_name}`);
    console.log(`    创建时间: ${new Date(comment.created_at * 1000).toLocaleString('zh-CN')}`);
  });
}

console.log('\n');

// 5. 查询最近的私信数据
console.log('✉️  5. 最近的私信数据（最多5条）:');
console.log('-'.repeat(80));
const messages = db.prepare(`
  SELECT
    id,
    account_id,
    message_text,
    sender_name,
    created_at
  FROM direct_messages
  ORDER BY created_at DESC
  LIMIT 5
`).all();

if (messages.length === 0) {
  console.log('❌ 没有找到任何私信数据');
} else {
  messages.forEach((msg, index) => {
    const text = msg.message_text || '';
    const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
    console.log(`\n[${index + 1}] 私信 ID: ${msg.id}`);
    console.log(`    账户 ID: ${msg.account_id}`);
    console.log(`    消息内容: ${preview}`);
    console.log(`    发送者: ${msg.sender_name}`);
    console.log(`    创建时间: ${new Date(msg.created_at * 1000).toLocaleString('zh-CN')}`);
  });
}

console.log('\n');

// 6. 诊断问题
console.log('🔍 6. 问题诊断:');
console.log('-'.repeat(80));

const issues = [];

// 检查 platform_user_id
const accountsWithoutUserId = accounts.filter(acc => !acc.platform_user_id);
if (accountsWithoutUserId.length > 0) {
  issues.push({
    level: 'ERROR',
    message: `${accountsWithoutUserId.length} 个账户缺少 platform_user_id`,
    solution: '需要重新登录以获取 platform_user_id'
  });
}

// ⭐ 核心问题：账户有 platform_user_id，但 Worker 仍报错
const accountsWithIdButError = accounts.filter(acc =>
  acc.platform_user_id &&
  acc.last_error_message &&
  acc.last_error_message.includes('missing platform_user_id')
);
if (accountsWithIdButError.length > 0) {
  accountsWithIdButError.forEach(acc => {
    issues.push({
      level: 'CRITICAL',
      message: `账户 ${acc.id} 数据库中有 platform_user_id (${acc.platform_user_id})，但 Worker 仍报错缺失`,
      solution: '需要重启 Worker 以重新加载账户配置，或者实现配置热更新机制'
    });
  });
}

// 检查其他错误状态
const accountsWithOtherErrors = accounts.filter(acc =>
  acc.last_error_message &&
  !acc.last_error_message.includes('missing platform_user_id')
);
if (accountsWithOtherErrors.length > 0) {
  accountsWithOtherErrors.forEach(acc => {
    issues.push({
      level: 'ERROR',
      message: `账户 ${acc.id} 有错误: ${acc.last_error_message}`,
      solution: '检查 Worker 日志，解决错误后重启 Worker'
    });
  });
}

// 检查监控任务
if (monitorTasks.length === 0) {
  issues.push({
    level: 'WARNING',
    message: '没有创建任何监控任务',
    solution: '检查账户是否已分配给 Worker，Worker 是否正常启动'
  });
}

// 检查任务状态
const inactiveTasks = monitorTasks.filter(task => task.status !== 'active');
if (inactiveTasks.length > 0) {
  issues.push({
    level: 'WARNING',
    message: `${inactiveTasks.length} 个监控任务未激活`,
    solution: '检查账户登录状态和 Worker 状态'
  });
}

// 检查数据收集
if (comments.length === 0 && messages.length === 0) {
  issues.push({
    level: 'INFO',
    message: '还没有收集到任何评论或私信数据',
    solution: '等待爬虫运行，或检查账户是否有新数据'
  });
}

if (issues.length === 0) {
  console.log('✅ 没有发现问题！');
} else {
  issues.forEach((issue, index) => {
    const emoji = issue.level === 'CRITICAL' ? '🚨' : issue.level === 'ERROR' ? '❌' : issue.level === 'WARNING' ? '⚠️' : 'ℹ️';
    console.log(`\n${emoji} [${issue.level}] ${index + 1}. ${issue.message}`);
    console.log(`    💡 解决方案: ${issue.solution}`);
  });
}

console.log('\n');
console.log('='.repeat(80));
console.log('检查完成');
console.log('='.repeat(80));

db.close();
