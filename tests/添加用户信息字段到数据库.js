/**
 * 为 direct_messages 表添加 sender_avatar 和 sender_nickname 字段
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n========================================');
console.log('📝 数据库 Schema 更新');
console.log('========================================\n');

try {
  // 1. 检查字段是否已存在
  const schema = db.prepare('PRAGMA table_info(direct_messages)').all();
  const hasAvatarField = schema.some(col => col.name === 'sender_avatar');
  const hasNicknameField = schema.some(col => col.name === 'sender_nickname');

  console.log('🔍 检查现有字段:');
  console.log(`  sender_avatar: ${hasAvatarField ? '✅ 已存在' : '❌ 不存在'}`);
  console.log(`  sender_nickname: ${hasNicknameField ? '✅ 已存在' : '❌ 不存在'}`);
  console.log('');

  // 2. 添加缺失的字段
  if (!hasAvatarField) {
    console.log('➕ 添加 sender_avatar 字段...');
    db.prepare('ALTER TABLE direct_messages ADD COLUMN sender_avatar TEXT').run();
    console.log('   ✅ sender_avatar 字段添加成功');
  }

  if (!hasNicknameField) {
    console.log('➕ 添加 sender_nickname 字段...');
    db.prepare('ALTER TABLE direct_messages ADD COLUMN sender_nickname TEXT').run();
    console.log('   ✅ sender_nickname 字段添加成功');
  }

  if (hasAvatarField && hasNicknameField) {
    console.log('✅ 所有字段已存在，无需更新');
  }

  console.log('');

  // 3. 验证更新
  const updatedSchema = db.prepare('PRAGMA table_info(direct_messages)').all();
  const hasAvatar = updatedSchema.some(col => col.name === 'sender_avatar');
  const hasNickname = updatedSchema.some(col => col.name === 'sender_nickname');

  console.log('✅ 验证结果:');
  console.log(`  sender_avatar: ${hasAvatar ? '✅ 存在' : '❌ 缺失'}`);
  console.log(`  sender_nickname: ${hasNickname ? '✅ 存在' : '❌ 缺失'}`);

  console.log('\n========================================');
  console.log('✅ Schema 更新完成！');
  console.log('========================================\n');

} catch (error) {
  console.error('❌ Schema 更新失败:', error.message);
  console.error(error.stack);
} finally {
  db.close();
}
