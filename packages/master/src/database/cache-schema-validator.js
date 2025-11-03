/**
 * Cache Schema Validator
 * 验证缓存数据库表结构的完整性
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 期望的表结构
const EXPECTED_TABLES = {
  cache_metadata: {
    columns: ['id', 'account_id', 'platform', 'last_update', 'last_persist', 'last_load',
              'comments_count', 'contents_count', 'conversations_count', 'messages_count',
              'notifications_count', 'created_at', 'updated_at'],
    indexes: ['idx_cache_metadata_account_id', 'idx_cache_metadata_last_persist',
              'idx_cache_metadata_platform'],
  },
  cache_comments: {
    columns: ['id', 'account_id', 'content_id', 'data', 'created_at', 'updated_at', 'persist_at'],
    indexes: ['idx_cache_comments_account_id', 'idx_cache_comments_content_id',
              'idx_cache_comments_created_at', 'idx_cache_comments_persist_at',
              'idx_cache_comments_unique', 'idx_cache_comments_account_created'],
  },
  cache_contents: {
    columns: ['id', 'account_id', 'data', 'publish_time', 'updated_at', 'persist_at'],
    indexes: ['idx_cache_contents_account_id', 'idx_cache_contents_publish_time',
              'idx_cache_contents_persist_at', 'idx_cache_contents_unique',
              'idx_cache_contents_account_publish'],
  },
  cache_conversations: {
    columns: ['id', 'account_id', 'user_id', 'data', 'last_message_time', 'updated_at', 'persist_at'],
    indexes: ['idx_cache_conversations_account_id', 'idx_cache_conversations_user_id',
              'idx_cache_conversations_last_message_time', 'idx_cache_conversations_persist_at',
              'idx_cache_conversations_unique', 'idx_cache_conversations_account_last_message'],
  },
  cache_messages: {
    columns: ['id', 'account_id', 'conversation_id', 'data', 'created_at', 'updated_at', 'persist_at'],
    indexes: ['idx_cache_messages_account_id', 'idx_cache_messages_conversation_id',
              'idx_cache_messages_created_at', 'idx_cache_messages_persist_at',
              'idx_cache_messages_unique', 'idx_cache_messages_conversation_created',
              'idx_cache_messages_account_created'],
  },
  cache_notifications: {
    columns: ['id', 'account_id', 'data', 'created_at', 'updated_at', 'persist_at'],
    indexes: ['idx_cache_notifications_account_id', 'idx_cache_notifications_created_at',
              'idx_cache_notifications_persist_at', 'idx_cache_notifications_unique',
              'idx_cache_notifications_account_created'],
  },
};

/**
 * 验证数据库 Schema
 */
function validateSchema(dbPath) {
  console.log('🔍 Cache Schema Validator');
  console.log('='.repeat(80));
  console.log(`Database: ${dbPath}\n`);

  // 检查数据库文件是否存在
  if (!fs.existsSync(dbPath)) {
    console.log('⚠️  Database file does not exist. Creating new database...\n');
  }

  const db = new Database(dbPath);
  let allValid = true;
  const results = {
    tables: {},
    summary: {
      totalTables: Object.keys(EXPECTED_TABLES).length,
      validTables: 0,
      missingTables: 0,
      invalidTables: 0,
      totalColumns: 0,
      totalIndexes: 0,
    },
  };

  try {
    // 验证每个表
    for (const [tableName, expected] of Object.entries(EXPECTED_TABLES)) {
      console.log(`\n📋 Table: ${tableName}`);
      console.log('-'.repeat(80));

      const tableResult = {
        exists: false,
        columns: { expected: expected.columns.length, actual: 0, missing: [], extra: [] },
        indexes: { expected: expected.indexes.length, actual: 0, missing: [], extra: [] },
        valid: true,
      };

      // 检查表是否存在
      const tableInfo = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `).get(tableName);

      if (!tableInfo) {
        console.log(`❌ Table does not exist`);
        tableResult.valid = false;
        allValid = false;
        results.summary.missingTables++;
      } else {
        tableResult.exists = true;
        console.log(`✅ Table exists`);

        // 验证列
        const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
        const actualColumns = columns.map(col => col.name);
        tableResult.columns.actual = actualColumns.length;

        const missingColumns = expected.columns.filter(col => !actualColumns.includes(col));
        const extraColumns = actualColumns.filter(col => !expected.columns.includes(col));

        tableResult.columns.missing = missingColumns;
        tableResult.columns.extra = extraColumns;

        console.log(`\n  Columns: ${actualColumns.length} (expected: ${expected.columns.length})`);
        if (missingColumns.length > 0) {
          console.log(`  ❌ Missing columns: ${missingColumns.join(', ')}`);
          tableResult.valid = false;
          allValid = false;
        }
        if (extraColumns.length > 0) {
          console.log(`  ⚠️  Extra columns: ${extraColumns.join(', ')}`);
        }
        if (missingColumns.length === 0 && extraColumns.length === 0) {
          console.log(`  ✅ All columns present`);
        }

        // 验证索引
        const indexes = db.prepare(`PRAGMA index_list(${tableName})`).all();
        const actualIndexes = indexes.map(idx => idx.name);
        tableResult.indexes.actual = actualIndexes.length;

        const missingIndexes = expected.indexes.filter(idx => !actualIndexes.includes(idx));
        const extraIndexes = actualIndexes.filter(idx =>
          !expected.indexes.includes(idx) &&
          !idx.startsWith('sqlite_autoindex_') // 忽略自动索引
        );

        tableResult.indexes.missing = missingIndexes;
        tableResult.indexes.extra = extraIndexes;

        console.log(`\n  Indexes: ${actualIndexes.length} (expected: ${expected.indexes.length})`);
        if (missingIndexes.length > 0) {
          console.log(`  ❌ Missing indexes: ${missingIndexes.join(', ')}`);
          tableResult.valid = false;
          allValid = false;
        }
        if (extraIndexes.length > 0) {
          console.log(`  ⚠️  Extra indexes: ${extraIndexes.join(', ')}`);
        }
        if (missingIndexes.length === 0 && extraIndexes.length === 0) {
          console.log(`  ✅ All indexes present`);
        }

        results.summary.totalColumns += actualColumns.length;
        results.summary.totalIndexes += actualIndexes.length;
      }

      results.tables[tableName] = tableResult;

      if (tableResult.valid) {
        results.summary.validTables++;
        console.log(`\n✅ Table ${tableName} is valid`);
      } else {
        results.summary.invalidTables++;
        console.log(`\n❌ Table ${tableName} has issues`);
      }
    }

    // 打印总结
    console.log('\n' + '='.repeat(80));
    console.log('📊 Validation Summary');
    console.log('='.repeat(80));
    console.log(`Total Tables: ${results.summary.totalTables}`);
    console.log(`Valid Tables: ${results.summary.validTables} ✅`);
    console.log(`Invalid Tables: ${results.summary.invalidTables} ${results.summary.invalidTables > 0 ? '❌' : ''}`);
    console.log(`Missing Tables: ${results.summary.missingTables} ${results.summary.missingTables > 0 ? '❌' : ''}`);
    console.log(`Total Columns: ${results.summary.totalColumns}`);
    console.log(`Total Indexes: ${results.summary.totalIndexes}`);

    if (allValid) {
      console.log('\n✅ All cache tables are valid!');
      console.log('='.repeat(80));
      return { success: true, results };
    } else {
      console.log('\n❌ Some cache tables have issues. Please check the details above.');
      console.log('='.repeat(80));
      return { success: false, results };
    }

  } catch (error) {
    console.error('\n❌ Validation error:', error);
    return { success: false, error: error.message, results };
  } finally {
    db.close();
  }
}

/**
 * 初始化缓存数据库
 */
function initializeCacheDatabase(dbPath) {
  console.log('\n🚀 Initializing cache database...');
  console.log('='.repeat(80));

  const schemaPath = path.join(__dirname, 'cache-schema.sql');

  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ Schema file not found: ${schemaPath}`);
    return { success: false, error: 'Schema file not found' };
  }

  const schema = fs.readFileSync(schemaPath, 'utf-8');
  const db = new Database(dbPath);

  try {
    // 执行 Schema
    console.log('📝 Executing cache-schema.sql...');
    db.exec(schema);

    console.log('✅ Cache database initialized successfully!');
    console.log('='.repeat(80));

    return { success: true };

  } catch (error) {
    console.error('❌ Failed to initialize cache database:', error);
    return { success: false, error: error.message };
  } finally {
    db.close();
  }
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  const dbPath = args[0] || path.join(__dirname, '..', '..', 'data', 'master.db');

  console.log('\n🗄️  Master Cache Schema Validator');
  console.log('='.repeat(80));
  console.log(`Target Database: ${dbPath}`);
  console.log('='.repeat(80));

  // 检查是否需要初始化
  if (args.includes('--init') || !fs.existsSync(dbPath)) {
    const initResult = initializeCacheDatabase(dbPath);
    if (!initResult.success) {
      process.exit(1);
    }
  }

  // 验证 Schema
  const validationResult = validateSchema(dbPath);

  if (validationResult.success) {
    console.log('\n✅ Cache schema validation passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Cache schema validation failed!');
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = {
  validateSchema,
  initializeCacheDatabase,
  EXPECTED_TABLES,
};
