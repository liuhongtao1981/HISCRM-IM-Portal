#!/usr/bin/env node

/**
 * 从当前的 master.db 导出完整的 schema
 * 用于生成新的 schema.sql
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../data/master.db');

console.log(`连接到数据库: ${dbPath}`);
const db = new Database(dbPath);

// 获取所有表
const tables = db.prepare(
  `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
).all();

console.log(`\n找到 ${tables.length} 个表\n`);

let schemaSQL = '-- HisCRM-IM Master Database Schema\n';
schemaSQL += '-- Generated from current master.db\n';
schemaSQL += `-- Generated at: ${new Date().toISOString()}\n`;
schemaSQL += `-- Total tables: ${tables.length}\n\n`;

// 对每个表导出 CREATE TABLE 语句
for (const table of tables) {
  const tableName = table.name;

  // 获取创建表的 SQL
  const createTableSQL = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`
  ).get(tableName);

  if (createTableSQL && createTableSQL.sql) {
    schemaSQL += `-- ============================================================================\n`;
    schemaSQL += `-- Table: ${tableName}\n`;
    schemaSQL += `-- ============================================================================\n`;
    schemaSQL += createTableSQL.sql + ';\n\n';
  }

  // 获取该表的所有索引
  const indexes = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL`
  ).all(tableName);

  if (indexes.length > 0) {
    for (const idx of indexes) {
      schemaSQL += idx.sql + ';\n';
    }
    schemaSQL += '\n';
  }
}

// 获取所有视图（如果有）
const views = db.prepare(
  `SELECT name, sql FROM sqlite_master WHERE type='view' ORDER BY name`
).all();

if (views.length > 0) {
  schemaSQL += `-- ============================================================================\n`;
  schemaSQL += `-- Views (${views.length})\n`;
  schemaSQL += `-- ============================================================================\n`;

  for (const view of views) {
    schemaSQL += view.sql + ';\n\n';
  }
}

// 输出到控制台
console.log('=== SCHEMA SUMMARY ===\n');
console.log(`Total Tables: ${tables.length}`);
console.log(`Total Views: ${views.length}\n`);
console.log('Tables:');
tables.forEach(t => console.log(`  - ${t.name}`));

// 保存到文件
const outputPath = path.join(__dirname, 'schema-final.sql');
fs.writeFileSync(outputPath, schemaSQL, 'utf-8');
console.log(`\n✅ Schema exported to: ${outputPath}`);
console.log(`📊 File size: ${(schemaSQL.length / 1024).toFixed(2)} KB`);

// 打印统计信息
console.log('\n=== TABLE DETAILS ===\n');
for (const table of tables) {
  const tableInfo = db.prepare(`PRAGMA table_info(${table.name})`).all();
  const rowCount = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();

  console.log(`📋 ${table.name}`);
  console.log(`   Columns: ${tableInfo.length}, Rows: ${rowCount.count}`);
  tableInfo.forEach(col => {
    console.log(`     - ${col.name}: ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.pk ? ' PRIMARY KEY' : ''}`);
  });
  console.log('');
}

db.close();
console.log('✅ Done!');
