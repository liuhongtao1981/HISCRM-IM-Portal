/**
 * 测试私信爬虫新架构（统一数据管理�?
 *
 * 目的�?
 * 1. 验证 DataManager 自动接收 API 数据
 * 2. 验证数据自动映射和状态管�?
 * 3. 验证自动同步�?Master
 * 4. 对比新旧架构的数据收集结�?
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');

async function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.all(sql, params, (err, rows) => {
      db.close();
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function main() {
  console.log('========================================');
  console.log('私信爬虫新架构测�?);
  console.log('========================================\n');

  try {
    // 1. 检查测试账�?
    console.log('1. 检查测试账�?..');
    const accounts = await runQuery(`
      SELECT id, platform, platform_user_id, platform_user_name, status
      FROM accounts
      WHERE platform = 'douyin' AND status = 'active'
      LIMIT 1
    `);

    if (accounts.length === 0) {
      console.log('�?没有找到已登录的抖音账户');
      console.log('\n请先运行以下操作:');
      console.log('1. 启动 Master: npm run start:master');
      console.log('2. 启动 Worker: npm run start:worker');
      console.log('3. 通过 Admin Web 登录一个抖音账�?);
      return;
    }

    const account = accounts[0];
    console.log(`�?找到测试账户: ${account.platform_user_name} (ID: ${account.id})`);
    console.log(`   平台用户 ID: ${account.platform_user_id}`);
    console.log(`   状�? ${account.status}\n`);

    // 2. 检�?Worker 状�?
    console.log('2. 检�?Worker 状�?..');
    const workers = await runQuery(`
      SELECT id, status, last_heartbeat_at
      FROM workers
      WHERE status = 'active'
    `);

    if (workers.length === 0) {
      console.log('�?没有活动�?Worker');
      console.log('   请启�?Worker: npm run start:worker');
      return;
    }

    console.log(`�?找到 ${workers.length} 个活�?Worker\n`);

    // 3. 清空测试数据（可选）
    console.log('3. 清空旧的测试数据...');
    const deleteConversations = await runQuery(`
      DELETE FROM conversations WHERE account_id = ?
    `, [account.id]);

    const deleteMessages = await runQuery(`
      DELETE FROM direct_messages WHERE account_id = ?
    `, [account.id]);

    console.log(`�?已清空旧数据\n`);

    // 4. 触发私信爬虫
    console.log('4. 触发私信爬虫...');
    console.log('   说明: 需要手动触发爬虫任�?);
    console.log('   方式 1: 通过 Admin Web 触发');
    console.log('   方式 2: 通过 Worker API 触发');
    console.log('   方式 3: 等待定时任务自动执行\n');

    console.log('========================================');
    console.log('测试准备完成�?);
    console.log('========================================\n');

    console.log('下一步操作：');
    console.log('1. 触发私信爬虫任务');
    console.log('2. 观察 Worker 日志输出�?);
    console.log('   - 查找 "[API] 会话列表 -> DataManager"');
    console.log('   - 查找 "[API] 历史消息 -> DataManager"');
    console.log('   - 查找 "[DataManager] 统计"');
    console.log('3. 等待任务完成后运行验证脚本：');
    console.log('   node tests/验证私信爬虫新架构结�?js\n');

    console.log('实时监控命令�?);
    console.log('   tail -f packages/worker/logs/crawl-direct-messages-v2.log\n');

  } catch (error) {
    console.error('�?测试失败:', error);
    console.error(error.stack);
  }
}

main();
