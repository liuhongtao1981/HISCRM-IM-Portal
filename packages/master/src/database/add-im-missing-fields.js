/**
 * 数据库迁移脚本：添加 IM 系统缺失的字段
 *
 * 运行方式：
 *   node packages/master/src/database/add-im-missing-fields.js
 *
 * 功能：
 *   1. 添加 direct_messages 表缺失的字段（消息状态、引用回复、媒体文件等）
 *   2. 添加 conversations 表缺失的字段（置顶、免打扰等）
 *   3. 添加 accounts 表缺失的字段（头像、签名等）
 *   4. 添加 comments 和 discussions 表缺失的字段（头像、点赞数等）
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/master.db');

function runMigration() {
  console.log('开始添加 IM 系统缺失字段...');
  console.log(`数据库路径: ${DB_PATH}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ 数据库文件不存在:', DB_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  try {
    // 开始事务
    db.exec('BEGIN TRANSACTION');

    // ============================================
    // 1. direct_messages 表 - 添加高优先级字段
    // ============================================
    console.log('\n1. 更新 direct_messages 表...');

    // 检查并添加字段
    const dmColumns = db.prepare(`PRAGMA table_info(direct_messages)`).all();
    const dmColumnNames = dmColumns.map(col => col.name);

    const dmFields = [
      // 消息状态
      { name: 'status', sql: `ALTER TABLE direct_messages ADD COLUMN status TEXT DEFAULT 'sent'` },
      // 引用回复
      { name: 'reply_to_message_id', sql: `ALTER TABLE direct_messages ADD COLUMN reply_to_message_id TEXT` },
      // 媒体文件
      { name: 'media_url', sql: `ALTER TABLE direct_messages ADD COLUMN media_url TEXT` },
      { name: 'media_thumbnail', sql: `ALTER TABLE direct_messages ADD COLUMN media_thumbnail TEXT` },
      { name: 'file_size', sql: `ALTER TABLE direct_messages ADD COLUMN file_size INTEGER` },
      { name: 'file_name', sql: `ALTER TABLE direct_messages ADD COLUMN file_name TEXT` },
      { name: 'duration', sql: `ALTER TABLE direct_messages ADD COLUMN duration INTEGER` },
      // 删除和撤回
      { name: 'is_deleted', sql: `ALTER TABLE direct_messages ADD COLUMN is_deleted BOOLEAN DEFAULT 0` },
      { name: 'is_recalled', sql: `ALTER TABLE direct_messages ADD COLUMN is_recalled BOOLEAN DEFAULT 0` },
      { name: 'recalled_at', sql: `ALTER TABLE direct_messages ADD COLUMN recalled_at INTEGER` },
    ];

    let dmAdded = 0;
    for (const field of dmFields) {
      if (!dmColumnNames.includes(field.name)) {
        db.exec(field.sql);
        console.log(`   ✅ 添加字段: ${field.name}`);
        dmAdded++;
      } else {
        console.log(`   ⏭️  字段已存在: ${field.name}`);
      }
    }

    // 添加索引
    const dmIndexes = [
      `CREATE INDEX IF NOT EXISTS idx_dm_status ON direct_messages(status)`,
      `CREATE INDEX IF NOT EXISTS idx_dm_reply_to ON direct_messages(reply_to_message_id)`,
      `CREATE INDEX IF NOT EXISTS idx_dm_deleted ON direct_messages(is_deleted)`,
    ];

    for (const indexSql of dmIndexes) {
      db.exec(indexSql);
    }

    console.log(`   📊 direct_messages: 添加 ${dmAdded} 个字段`);

    // ============================================
    // 2. conversations 表 - 添加高优先级字段
    // ============================================
    console.log('\n2. 更新 conversations 表...');

    const convColumns = db.prepare(`PRAGMA table_info(conversations)`).all();
    const convColumnNames = convColumns.map(col => col.name);

    const convFields = [
      { name: 'is_pinned', sql: `ALTER TABLE conversations ADD COLUMN is_pinned BOOLEAN DEFAULT 0` },
      { name: 'is_muted', sql: `ALTER TABLE conversations ADD COLUMN is_muted BOOLEAN DEFAULT 0` },
      { name: 'last_message_type', sql: `ALTER TABLE conversations ADD COLUMN last_message_type TEXT DEFAULT 'text'` },
      { name: 'status', sql: `ALTER TABLE conversations ADD COLUMN status TEXT DEFAULT 'active'` },
    ];

    let convAdded = 0;
    for (const field of convFields) {
      if (!convColumnNames.includes(field.name)) {
        db.exec(field.sql);
        console.log(`   ✅ 添加字段: ${field.name}`);
        convAdded++;
      } else {
        console.log(`   ⏭️  字段已存在: ${field.name}`);
      }
    }

    // 添加索引
    const convIndexes = [
      `CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON conversations(is_pinned)`,
      `CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status)`,
    ];

    for (const indexSql of convIndexes) {
      db.exec(indexSql);
    }

    console.log(`   📊 conversations: 添加 ${convAdded} 个字段`);

    // ============================================
    // 3. accounts 表 - 添加必需字段
    // ============================================
    console.log('\n3. 更新 accounts 表...');

    const accountColumns = db.prepare(`PRAGMA table_info(accounts)`).all();
    const accountColumnNames = accountColumns.map(col => col.name);

    const accountFields = [
      { name: 'avatar', sql: `ALTER TABLE accounts ADD COLUMN avatar TEXT` },
      { name: 'signature', sql: `ALTER TABLE accounts ADD COLUMN signature TEXT` },
      { name: 'verified', sql: `ALTER TABLE accounts ADD COLUMN verified BOOLEAN DEFAULT 0` },
    ];

    let accountAdded = 0;
    for (const field of accountFields) {
      if (!accountColumnNames.includes(field.name)) {
        db.exec(field.sql);
        console.log(`   ✅ 添加字段: ${field.name}`);
        accountAdded++;
      } else {
        console.log(`   ⏭️  字段已存在: ${field.name}`);
      }
    }

    console.log(`   📊 accounts: 添加 ${accountAdded} 个字段`);

    // ============================================
    // 4. comments 表 - 添加显示字段
    // ============================================
    console.log('\n4. 更新 comments 表...');

    const commentColumns = db.prepare(`PRAGMA table_info(comments)`).all();
    const commentColumnNames = commentColumns.map(col => col.name);

    const commentFields = [
      { name: 'author_avatar', sql: `ALTER TABLE comments ADD COLUMN author_avatar TEXT` },
      { name: 'stats_like_count', sql: `ALTER TABLE comments ADD COLUMN stats_like_count INTEGER DEFAULT 0` },
      { name: 'reply_count', sql: `ALTER TABLE comments ADD COLUMN reply_count INTEGER DEFAULT 0` },
    ];

    let commentAdded = 0;
    for (const field of commentFields) {
      if (!commentColumnNames.includes(field.name)) {
        db.exec(field.sql);
        console.log(`   ✅ 添加字段: ${field.name}`);
        commentAdded++;
      } else {
        console.log(`   ⏭️  字段已存在: ${field.name}`);
      }
    }

    // 添加索引
    db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_like_count ON comments(stats_like_count)`);

    console.log(`   📊 comments: 添加 ${commentAdded} 个字段`);

    // ============================================
    // 5. discussions 表 - 添加显示字段
    // ============================================
    console.log('\n5. 更新 discussions 表...');

    const discussionColumns = db.prepare(`PRAGMA table_info(discussions)`).all();
    const discussionColumnNames = discussionColumns.map(col => col.name);

    const discussionFields = [
      { name: 'author_avatar', sql: `ALTER TABLE discussions ADD COLUMN author_avatar TEXT` },
      { name: 'stats_like_count', sql: `ALTER TABLE discussions ADD COLUMN stats_like_count INTEGER DEFAULT 0` },
    ];

    let discussionAdded = 0;
    for (const field of discussionFields) {
      if (!discussionColumnNames.includes(field.name)) {
        db.exec(field.sql);
        console.log(`   ✅ 添加字段: ${field.name}`);
        discussionAdded++;
      } else {
        console.log(`   ⏭️  字段已存在: ${field.name}`);
      }
    }

    console.log(`   📊 discussions: 添加 ${discussionAdded} 个字段`);

    // 提交事务
    db.exec('COMMIT');
    console.log('\n✅ IM 字段迁移完成！');

    // 输出统计信息
    console.log('\n📊 迁移统计:');
    console.log(`   direct_messages: ${dmAdded} 个新字段`);
    console.log(`   conversations: ${convAdded} 个新字段`);
    console.log(`   accounts: ${accountAdded} 个新字段`);
    console.log(`   comments: ${commentAdded} 个新字段`);
    console.log(`   discussions: ${discussionAdded} 个新字段`);
    console.log(`   总计: ${dmAdded + convAdded + accountAdded + commentAdded + discussionAdded} 个新字段`);

    // 验证结果
    console.log('\n🔍 验证表结构...');
    const tables = ['direct_messages', 'conversations', 'accounts', 'comments', 'discussions'];
    for (const table of tables) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all();
      console.log(`   ${table}: ${columns.length} 个字段`);
    }

  } catch (error) {
    // 回滚事务
    db.exec('ROLLBACK');
    console.error('\n❌ 迁移失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 运行迁移
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
