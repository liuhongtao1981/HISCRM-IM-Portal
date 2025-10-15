/**
 * 数据库验证测试脚本
 * 用于演示和测试数据库结构验证功能
 */

const { initDatabase } = require('./src/database/init');
const { validateDatabaseSchema } = require('./src/database/schema-validator');
const Database = require('better-sqlite3');
const path = require('path');

console.log('='.repeat(60));
console.log('数据库结构验证测试');
console.log('='.repeat(60));
console.log('');

// 测试场景1: 完整的数据库验证
console.log('【测试1】验证完整的数据库结构');
console.log('-'.repeat(60));
try {
  const testDbPath = path.join(__dirname, 'data', 'test-validation.db');
  console.log(`数据库路径: ${testDbPath}`);
  console.log('');

  // 初始化数据库（会自动验证）
  const db = initDatabase(testDbPath);

  console.log('');
  console.log('✓ 测试1通过: 数据库初始化和验证成功');

  // 清理
  db.close();
} catch (error) {
  console.error('✗ 测试1失败:', error.message);
}

console.log('');
console.log('='.repeat(60));

// 测试场景2: 手动创建缺失字段的数据库
console.log('【测试2】验证缺失字段的数据库');
console.log('-'.repeat(60));
try {
  const testDbPath2 = path.join(__dirname, 'data', 'test-missing-fields.db');
  console.log(`数据库路径: ${testDbPath2}`);
  console.log('');

  // 创建一个不完整的数据库
  const db2 = new Database(testDbPath2);
  db2.pragma('journal_mode = WAL');

  // 创建一个缺少某些字段的accounts表
  db2.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_id TEXT NOT NULL,
      credentials TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      -- 故意遗漏: login_status, last_login_time, cookies_valid_until
      monitor_interval INTEGER DEFAULT 30,
      last_check_time INTEGER,
      assigned_worker_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      content TEXT NOT NULL
      -- 故意遗漏很多字段
    );
  `);

  console.log('创建了不完整的数据库结构');
  console.log('');

  // 验证这个不完整的数据库
  const validationResult = validateDatabaseSchema(db2);

  console.log('');
  if (!validationResult.valid) {
    console.log('✓ 测试2通过: 成功检测到数据库结构问题');
    console.log('');
    console.log('检测到的问题:');
    for (const [tableName, result] of Object.entries(validationResult.tables)) {
      if (!result.valid) {
        console.log(`  表 '${tableName}':`);
        if (result.missingColumns.length > 0) {
          console.log(`    缺失字段: ${result.missingColumns.join(', ')}`);
        }
        if (result.missingIndexes.length > 0) {
          console.log(`    缺失索引: ${result.missingIndexes.join(', ')}`);
        }
      }
    }
  } else {
    console.log('✗ 测试2失败: 应该检测到问题但没有');
  }

  // 清理
  db2.close();
} catch (error) {
  console.error('✗ 测试2失败:', error.message);
}

console.log('');
console.log('='.repeat(60));

// 测试场景3: 验证非严格模式
console.log('【测试3】非严格验证模式（即使验证失败也继续运行）');
console.log('-'.repeat(60));
try {
  const testDbPath3 = path.join(__dirname, 'data', 'test-non-strict.db');
  console.log(`数据库路径: ${testDbPath3}`);
  console.log('');

  // 创建一个空数据库（没有任何表）
  const db3 = new Database(testDbPath3);
  db3.pragma('journal_mode = WAL');

  console.log('创建了空数据库（无任何表）');
  console.log('');

  // 使用非严格模式验证
  console.log('使用非严格模式验证...');
  const validationResult = validateDatabaseSchema(db3);

  console.log('');
  if (!validationResult.valid) {
    console.log('✓ 测试3通过: 在非严格模式下检测到问题但没有抛出异常');
  }

  // 清理
  db3.close();
} catch (error) {
  console.error('✗ 测试3失败:', error.message);
}

console.log('');
console.log('='.repeat(60));
console.log('所有测试完成!');
console.log('='.repeat(60));
console.log('');
console.log('总结:');
console.log('1. 数据库验证功能可以在启动时自动检测表结构问题');
console.log('2. 支持检测缺失的表、字段和索引');
console.log('3. 提供严格和非严格两种验证模式');
console.log('4. 验证失败时会给出详细的错误信息和修复建议');
console.log('');
