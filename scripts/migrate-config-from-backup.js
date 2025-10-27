/**
 * 配置数据迁移脚本
 * 从备份数据库迁移核心配置数据到新数据库
 *
 * 迁移表：
 * - accounts (账户配置)
 * - workers (Worker 配置)
 * - proxies (代理配置)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

console.log('======================================');
console.log('📦 配置数据迁移工具');
console.log('======================================\n');

// 数据库路径
const backupDbPath = path.join(__dirname, '../packages/master/data/master.db.config_backup_20251027');
const newDbPath = path.join(__dirname, '../packages/master/data/master.db');

// 检查文件存在性
if (!fs.existsSync(backupDbPath)) {
  console.error('❌ 备份数据库不存在:', backupDbPath);
  process.exit(1);
}

if (!fs.existsSync(newDbPath)) {
  console.error('❌ 新数据库不存在，请先运行 Master 创建数据库');
  console.error('   提示: cd packages/master && npm start');
  process.exit(1);
}

console.log('✅ 备份数据库:', backupDbPath);
console.log('✅ 新数据库:', newDbPath);
console.log();

// 打开数据库
const backupDb = new Database(backupDbPath, { readonly: true });
const newDb = new Database(newDbPath);

try {
  console.log('📊 分析备份数据库...\n');

  // 检查备份数据库中的数据量
  const stats = {
    accounts: backupDb.prepare('SELECT COUNT(*) as count FROM accounts').get().count,
    workers: backupDb.prepare('SELECT COUNT(*) as count FROM workers').get().count,
    proxies: backupDb.prepare('SELECT COUNT(*) as count FROM proxies').get().count
  };

  console.log('备份数据统计:');
  console.log(`  accounts: ${stats.accounts} 条`);
  console.log(`  workers: ${stats.workers} 条`);
  console.log(`  proxies: ${stats.proxies} 条`);
  console.log();

  if (stats.accounts === 0 && stats.workers === 0 && stats.proxies === 0) {
    console.log('⚠️  备份数据库中没有配置数据，跳过迁移');
    process.exit(0);
  }

  // 开始迁移
  console.log('🚀 开始迁移...\n');
  newDb.exec('BEGIN TRANSACTION');

  try {
    let totalMigrated = 0;

    // 1. 迁移 accounts
    if (stats.accounts > 0) {
      console.log('📝 迁移 accounts 表...');

      // 获取 accounts 表的所有字段
      const accountFields = backupDb.pragma('table_info(accounts)')
        .map(col => col.name)
        .join(', ');

      const accounts = backupDb.prepare(`SELECT ${accountFields} FROM accounts`).all();

      const insertStmt = newDb.prepare(`
        INSERT OR REPLACE INTO accounts (${accountFields})
        VALUES (${accountFields.split(', ').map(() => '?').join(', ')})
      `);

      for (const account of accounts) {
        const values = accountFields.split(', ').map(field => account[field]);
        insertStmt.run(...values);
      }

      console.log(`   ✅ 迁移了 ${accounts.length} 个账户\n`);
      totalMigrated += accounts.length;
    }

    // 2. 迁移 workers
    if (stats.workers > 0) {
      console.log('📝 迁移 workers 表...');

      const workerFields = backupDb.pragma('table_info(workers)')
        .map(col => col.name)
        .join(', ');

      const workers = backupDb.prepare(`SELECT ${workerFields} FROM workers`).all();

      const insertStmt = newDb.prepare(`
        INSERT OR REPLACE INTO workers (${workerFields})
        VALUES (${workerFields.split(', ').map(() => '?').join(', ')})
      `);

      for (const worker of workers) {
        const values = workerFields.split(', ').map(field => worker[field]);
        insertStmt.run(...values);
      }

      console.log(`   ✅ 迁移了 ${workers.length} 个 Worker\n`);
      totalMigrated += workers.length;
    }

    // 3. 迁移 proxies
    if (stats.proxies > 0) {
      console.log('📝 迁移 proxies 表...');

      const proxyFields = backupDb.pragma('table_info(proxies)')
        .map(col => col.name)
        .join(', ');

      const proxies = backupDb.prepare(`SELECT ${proxyFields} FROM proxies`).all();

      const insertStmt = newDb.prepare(`
        INSERT OR REPLACE INTO proxies (${proxyFields})
        VALUES (${proxyFields.split(', ').map(() => '?').join(', ')})
      `);

      for (const proxy of proxies) {
        const values = proxyFields.split(', ').map(field => proxy[field]);
        insertStmt.run(...values);
      }

      console.log(`   ✅ 迁移了 ${proxies.length} 个代理配置\n`);
      totalMigrated += proxies.length;
    }

    // 提交事务
    newDb.exec('COMMIT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ 迁移完成！共迁移 ${totalMigrated} 条配置数据`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 验证结果
    console.log('📊 新数据库数据统计:');
    console.log(`  accounts: ${newDb.prepare('SELECT COUNT(*) as c FROM accounts').get().c} 条`);
    console.log(`  workers: ${newDb.prepare('SELECT COUNT(*) as c FROM workers').get().c} 条`);
    console.log(`  proxies: ${newDb.prepare('SELECT COUNT(*) as c FROM proxies').get().c} 条`);
    console.log();

  } catch (error) {
    newDb.exec('ROLLBACK');
    console.error('\n❌ 迁移失败，已回滚:', error.message);
    throw error;
  }

} catch (error) {
  console.error('❌ 迁移过程出错:', error);
  process.exit(1);
} finally {
  backupDb.close();
  newDb.close();
  console.log('🔒 数据库连接已关闭\n');
}
