#!/usr/bin/env node

/**
 * 检查数据库结构
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/master.db');

try {
  const db = new Database(dbPath, { readonly: true });

  console.log('\n📊 数据库结构检查\n');
  console.log('=' .repeat(80));

  // 获取所有表
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    ORDER BY name
  `).all();

  for (const table of tables) {
    const tableName = table.name;
    console.log(`\n📋 表: ${tableName}`);
    console.log('-'.repeat(80));

    // 获取表的列信息
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();

    console.log('\n  字段信息:');
    columns.forEach((col, idx) => {
      console.log(`    ${idx + 1}. ${col.name.padEnd(25)} | 类型: ${col.type.padEnd(15)} | 必需: ${col.notnull ? '是' : '否'} | 默认值: ${col.dflt_value || 'N/A'}`);
    });

    // 获取表的索引
    const indexes = db.prepare(`PRAGMA index_list(${tableName})`).all();
    if (indexes.length > 0) {
      console.log('\n  索引信息:');
      indexes.forEach((idx) => {
        console.log(`    - ${idx.name} (唯一: ${idx.unique ? '是' : '否'})`);
      });
    }

    // 获取表的行数
    const countResult = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
    console.log(`\n  行数: ${countResult.count}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ 数据库结构检查完成\n');

  db.close();
} catch (error) {
  console.error('❌ 检查失败:', error.message);
  process.exit(1);
}
