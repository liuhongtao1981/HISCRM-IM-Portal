/**
 * 修复 cache_messages 表中的时间戳格式
 * 将 ISO 8601 字符串转换为秒级时间戳
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('📊 开始修复 cache_messages 时间戳格式...\n');

// 获取所有需要转换的消息
const messages = db
  .prepare(`SELECT id, created_at, read_at FROM cache_messages`)
  .all();

console.log(`✅ 找到 ${messages.length} 条消息记录\n`);

let convertedCount = 0;
let skippedCount = 0;

// 开始事务
const transaction = db.transaction(() => {
  const updateStmt = db.prepare(
    `UPDATE cache_messages SET created_at = ?, read_at = ? WHERE id = ?`
  );

  for (const message of messages) {
    let needsUpdate = false;
    let newCreatedAt = message.created_at;
    let newReadAt = message.read_at;

    // 转换 created_at
    if (typeof message.created_at === 'string') {
      newCreatedAt = Math.floor(new Date(message.created_at).getTime() / 1000);
      needsUpdate = true;
    } else if (message.created_at > 100000000000) {
      // 毫秒级 → 秒级
      newCreatedAt = Math.floor(message.created_at / 1000);
      needsUpdate = true;
    }

    // 转换 read_at
    if (message.read_at) {
      if (typeof message.read_at === 'string') {
        newReadAt = Math.floor(new Date(message.read_at).getTime() / 1000);
        needsUpdate = true;
      } else if (message.read_at > 100000000000) {
        // 毫秒级 → 秒级
        newReadAt = Math.floor(message.read_at / 1000);
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      updateStmt.run(newCreatedAt, newReadAt, message.id);
      convertedCount++;

      if (convertedCount <= 5) {
        console.log(
          `🔄 ${message.id}:\n` +
            `   created_at: ${message.created_at} → ${newCreatedAt}` +
            (message.read_at ? `\n   read_at: ${message.read_at} → ${newReadAt}` : '')
        );
      }
    } else {
      skippedCount++;
    }
  }
});

try {
  transaction();
  console.log(`\n✅ 时间戳修复完成:`);
  console.log(`   - 已转换: ${convertedCount} 条`);
  console.log(`   - 已跳过 (无需转换): ${skippedCount} 条`);
  console.log(`   - 总计: ${messages.length} 条\n`);
} catch (error) {
  console.error('\n❌ 修复失败:', error.message);
  process.exit(1);
} finally {
  db.close();
}
