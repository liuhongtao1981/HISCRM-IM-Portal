/**
 * 数据库迁移脚�?- 添加 API 新字�?
 *
 * �?comments �?discussions 表添加从 API 提取的新字段�?
 * - is_author: 是否为作者自己的评论/回复（用于避免回复自己）
 * - level: 评论/回复层级�?=一级评�? 2=二级回复, 3=三级回复�?
 * - reply_to_user_id, reply_to_user_name, reply_to_user_avatar: 回复目标用户信息（仅 discussions�?
 * - reply_count: 回复数量（discussions�?
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');

console.log('='.repeat(70));
console.log('数据库迁移：添加 API 新字�?);
console.log('='.repeat(70));

// 检查数据库文件
if (!fs.existsSync(DB_PATH)) {
  console.error(`�?数据库文件不存在: ${DB_PATH}`);
  process.exit(1);
}

console.log(`📂 数据库路�? ${DB_PATH}\n`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

try {
  console.log('开始迁�?..\n');

  // =========================================================================
  // 1. 检查当前表结构
  // =========================================================================
  console.log('📋 步骤 1: 检查当前表结构');
  console.log('-'.repeat(70));

  const commentsSchema = db.prepare("PRAGMA table_info(comments)").all();
  const discussionsSchema = db.prepare("PRAGMA table_info(discussions)").all();

  console.log('\n当前 comments 表字�?');
  commentsSchema.forEach(col => {
    console.log(`  ${col.name.padEnd(30)} ${col.type.padEnd(15)} ${col.notnull ? 'NOT NULL' : ''}`);
  });

  console.log('\n当前 discussions 表字�?');
  discussionsSchema.forEach(col => {
    console.log(`  ${col.name.padEnd(30)} ${col.type.padEnd(15)} ${col.notnull ? 'NOT NULL' : ''}`);
  });

  // =========================================================================
  // 2. 检查字段是否已存在
  // =========================================================================
  console.log('\n📋 步骤 2: 检查字段是否已存在');
  console.log('-'.repeat(70));

  const commentsFieldsToAdd = [
    { name: 'is_author', type: 'BOOLEAN', default: '0' },
    { name: 'level', type: 'INTEGER', default: '1' }
  ];

  const discussionsFieldsToAdd = [
    { name: 'is_author', type: 'BOOLEAN', default: '0' },
    { name: 'level', type: 'INTEGER', default: '2' },
    { name: 'reply_to_user_id', type: 'TEXT', default: 'NULL' },
    { name: 'reply_to_user_name', type: 'TEXT', default: 'NULL' },
    { name: 'reply_to_user_avatar', type: 'TEXT', default: 'NULL' },
    { name: 'reply_count', type: 'INTEGER', default: '0' }
  ];

  const commentsExistingFields = new Set(commentsSchema.map(col => col.name));
  const discussionsExistingFields = new Set(discussionsSchema.map(col => col.name));

  const commentsMissing = commentsFieldsToAdd.filter(f => !commentsExistingFields.has(f.name));
  const discussionsMissing = discussionsFieldsToAdd.filter(f => !discussionsExistingFields.has(f.name));

  console.log('\ncomments 表需要添加的字段:');
  if (commentsMissing.length === 0) {
    console.log('  �?所有字段已存在，无需迁移');
  } else {
    commentsMissing.forEach(f => {
      console.log(`  ⚠️  ${f.name.padEnd(30)} ${f.type.padEnd(15)} DEFAULT ${f.default}`);
    });
  }

  console.log('\ndiscussions 表需要添加的字段:');
  if (discussionsMissing.length === 0) {
    console.log('  �?所有字段已存在，无需迁移');
  } else {
    discussionsMissing.forEach(f => {
      console.log(`  ⚠️  ${f.name.padEnd(30)} ${f.type.padEnd(15)} DEFAULT ${f.default}`);
    });
  }

  // 如果所有字段都已存在，退�?
  if (commentsMissing.length === 0 && discussionsMissing.length === 0) {
    console.log('\n�?数据库已是最新版本，无需迁移');
    process.exit(0);
  }

  // =========================================================================
  // 3. 执行迁移
  // =========================================================================
  console.log('\n📋 步骤 3: 执行迁移 (添加新字�?');
  console.log('-'.repeat(70));

  db.exec('BEGIN TRANSACTION');

  // 添加 comments 表字�?
  if (commentsMissing.length > 0) {
    console.log('\n�?comments 表添加字�?');
    commentsMissing.forEach(field => {
      const sql = `ALTER TABLE comments ADD COLUMN ${field.name} ${field.type} DEFAULT ${field.default}`;
      console.log(`  执行: ${sql}`);
      db.exec(sql);
      console.log(`  �?添加成功: ${field.name}`);
    });
  }

  // 添加 discussions 表字�?
  if (discussionsMissing.length > 0) {
    console.log('\n�?discussions 表添加字�?');
    discussionsMissing.forEach(field => {
      const sql = `ALTER TABLE discussions ADD COLUMN ${field.name} ${field.type} DEFAULT ${field.default}`;
      console.log(`  执行: ${sql}`);
      db.exec(sql);
      console.log(`  �?添加成功: ${field.name}`);
    });
  }

  // =========================================================================
  // 4. 创建索引
  // =========================================================================
  console.log('\n📋 步骤 4: 创建索引');
  console.log('-'.repeat(70));

  const indexes = [
    { table: 'comments', name: 'idx_comments_is_author', column: 'is_author' },
    { table: 'comments', name: 'idx_comments_level', column: 'level' },
    { table: 'discussions', name: 'idx_discussions_is_author', column: 'is_author' },
    { table: 'discussions', name: 'idx_discussions_level', column: 'level' }
  ];

  indexes.forEach(idx => {
    try {
      const sql = `CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.column})`;
      console.log(`  执行: ${sql}`);
      db.exec(sql);
      console.log(`  �?索引创建成功: ${idx.name}`);
    } catch (error) {
      console.log(`  ⚠️  索引已存在或创建失败: ${idx.name} (${error.message})`);
    }
  });

  // =========================================================================
  // 5. 验证迁移结果
  // =========================================================================
  console.log('\n📋 步骤 5: 验证迁移结果');
  console.log('-'.repeat(70));

  const commentsSchemaAfter = db.prepare("PRAGMA table_info(comments)").all();
  const discussionsSchemaAfter = db.prepare("PRAGMA table_info(discussions)").all();

  console.log('\n迁移�?comments 表字�?(�?' + commentsSchemaAfter.length + ' �?:');
  commentsSchemaAfter.forEach(col => {
    const isNew = !commentsExistingFields.has(col.name);
    const marker = isNew ? '�?NEW' : '';
    console.log(`  ${col.name.padEnd(30)} ${col.type.padEnd(15)} ${marker}`);
  });

  console.log('\n迁移�?discussions 表字�?(�?' + discussionsSchemaAfter.length + ' �?:');
  discussionsSchemaAfter.forEach(col => {
    const isNew = !discussionsExistingFields.has(col.name);
    const marker = isNew ? '�?NEW' : '';
    console.log(`  ${col.name.padEnd(30)} ${col.type.padEnd(15)} ${marker}`);
  });

  // 提交事务
  db.exec('COMMIT');
  console.log('\n�?事务已提�?);

  console.log('\n' + '='.repeat(70));
  console.log('迁移完成总结');
  console.log('='.repeat(70));

  console.log(`\n�?数据库迁移成功完成`);
  console.log(`\n新增字段统计:`);
  console.log(`  comments �?    +${commentsMissing.length} 个字段`);
  console.log(`  discussions �? +${discussionsMissing.length} 个字段`);
  console.log(`  索引:           +${indexes.length} 个`);

  console.log(`\n📝 新增字段说明:`);
  console.log(`  is_author:              是否为作者自己的评论/回复 (避免回复自己)`);
  console.log(`  level:                  评论层级 (1=一�? 2=二级, 3=三级)`);
  console.log(`  reply_to_user_id:       回复目标用户 ID`);
  console.log(`  reply_to_user_name:     回复目标用户昵称`);
  console.log(`  reply_to_user_avatar:   回复目标用户头像`);
  console.log(`  reply_count:            回复数量`);

  console.log(`\n📝 下一�?`);
  console.log(`  1. 清空测试数据: node tests/clear-test-data.js`);
  console.log(`  2. 启动 Master:  cd packages/master && npm start`);
  console.log(`  3. 验证数据抓取: node tests/check-crawled-data.js`);

} catch (error) {
  db.exec('ROLLBACK');
  console.error('\n�?迁移失败，已回滚事务:', error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  db.close();
}
