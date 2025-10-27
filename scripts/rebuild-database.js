/**
 * 数据库重建脚本
 * 删除旧数据库，创建新数据库，迁移配置数据
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('../packages/master/src/database/init');

console.log('======================================');
console.log('🔧 数据库重建工具');
console.log('======================================\n');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const backupPath = path.join(__dirname, '../packages/master/data/master.db.config_backup_20251027');

// Step 1: 检查备份是否存在
if (!fs.existsSync(backupPath)) {
  console.error('❌ 备份数据库不存在:', backupPath);
  process.exit(1);
}

console.log('✅ 找到备份数据库:', backupPath);

// Step 2: 删除旧数据库（如果存在）
console.log('\n📝 Step 1: 删除旧数据库文件...');
const filesToDelete = [
  dbPath,
  `${dbPath}-shm`,
  `${dbPath}-wal`
];

let deleted = 0;
for (const file of filesToDelete) {
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
      console.log(`   ✅ 删除: ${path.basename(file)}`);
      deleted++;
    } catch (error) {
      console.error(`   ❌ 删除失败 (文件可能被占用): ${path.basename(file)}`);
      console.error(`      错误: ${error.message}`);
      console.error('\n⚠️  请先关闭所有使用数据库的进程（Master、Worker、测试脚本等）');
      process.exit(1);
    }
  }
}

console.log(`   删除了 ${deleted} 个文件\n`);

// Step 3: 创建新数据库
console.log('📝 Step 2: 创建新数据库...');
try {
  const db = initDatabase(dbPath);
  console.log('   ✅ 新数据库创建成功');
  db.close();
} catch (error) {
  console.error('   ❌ 创建数据库失败:', error.message);
  process.exit(1);
}

// Step 4: 迁移配置数据
console.log('\n📝 Step 3: 迁移配置数据...\n');

const backupDb = new Database(backupPath, { readonly: true });
const newDb = new Database(dbPath);

try {
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

  newDb.exec('BEGIN TRANSACTION');

  try {
    let totalMigrated = 0;

    // 迁移 accounts
    if (stats.accounts > 0) {
      console.log('📝 迁移 accounts 表...');
      const accountFields = backupDb.pragma('table_info(accounts)')
        .map(col => col.name)
        .join(', ');

      const accounts = backupDb.prepare(`SELECT ${accountFields} FROM accounts`).all();

      const placeholders = accountFields.split(', ').map(() => '?').join(', ');
      const insertStmt = newDb.prepare(`
        INSERT OR REPLACE INTO accounts (${accountFields})
        VALUES (${placeholders})
      `);

      for (const account of accounts) {
        const values = accountFields.split(', ').map(field => account[field]);
        insertStmt.run(...values);
      }

      console.log(`   ✅ 迁移了 ${accounts.length} 个账户\n`);
      totalMigrated += accounts.length;
    }

    // 迁移 workers
    if (stats.workers > 0) {
      console.log('📝 迁移 workers 表...');
      const workerFields = backupDb.pragma('table_info(workers)')
        .map(col => col.name)
        .join(', ');

      const workers = backupDb.prepare(`SELECT ${workerFields} FROM workers`).all();

      const placeholders = workerFields.split(', ').map(() => '?').join(', ');
      const insertStmt = newDb.prepare(`
        INSERT OR REPLACE INTO workers (${workerFields})
        VALUES (${placeholders})
      `);

      for (const worker of workers) {
        const values = workerFields.split(', ').map(field => worker[field]);
        insertStmt.run(...values);
      }

      console.log(`   ✅ 迁移了 ${workers.length} 个 Worker\n`);
      totalMigrated += workers.length;
    }

    // 迁移 proxies
    if (stats.proxies > 0) {
      console.log('📝 迁移 proxies 表...');
      const proxyFields = backupDb.pragma('table_info(proxies)')
        .map(col => col.name)
        .join(', ');

      const proxies = backupDb.prepare(`SELECT ${proxyFields} FROM proxies`).all();

      const placeholders = proxyFields.split(', ').map(() => '?').join(', ');
      const insertStmt = newDb.prepare(`
        INSERT OR REPLACE INTO proxies (${proxyFields})
        VALUES (${placeholders})
      `);

      for (const proxy of proxies) {
        const values = proxyFields.split(', ').map(field => proxy[field]);
        insertStmt.run(...values);
      }

      console.log(`   ✅ 迁移了 ${proxies.length} 个代理配置\n`);
      totalMigrated += proxies.length;
    }

    newDb.exec('COMMIT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ 迁移完成！共迁移 ${totalMigrated} 条配置数据`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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
}

// Step 5: 验证结果
console.log('📝 Step 4: 验证新数据库...\n');

const verifyDb = new Database(dbPath, { readonly: true });

try {
  // 验证表结构
  const tables = verifyDb.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  ).all();

  console.log('✅ 数据库表列表 (共 ' + tables.length + ' 个):');
  tables.forEach(t => console.log(`   - ${t.name}`));
  console.log();

  // 验证数据
  console.log('✅ 数据统计:');
  console.log(`   accounts: ${verifyDb.prepare('SELECT COUNT(*) as c FROM accounts').get().c} 条`);
  console.log(`   workers: ${verifyDb.prepare('SELECT COUNT(*) as c FROM workers').get().c} 条`);
  console.log(`   proxies: ${verifyDb.prepare('SELECT COUNT(*) as c FROM proxies').get().c} 条`);
  console.log(`   comments: ${verifyDb.prepare('SELECT COUNT(*) as c FROM comments').get().c} 条`);
  console.log(`   contents: ${verifyDb.prepare('SELECT COUNT(*) as c FROM contents').get().c} 条`);
  console.log(`   direct_messages: ${verifyDb.prepare('SELECT COUNT(*) as c FROM direct_messages').get().c} 条`);
  console.log();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ 数据库重建完成！');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📌 说明:');
  console.log('   - 新数据库使用最终 schema (v1.0)');
  console.log('   - 已迁移核心配置数据 (accounts, workers, proxies)');
  console.log('   - 业务数据表已清空 (comments, contents, direct_messages 等)');
  console.log('   - 现在可以启动 Master 和 Worker 开始爬取数据\n');

} finally {
  verifyDb.close();
}
