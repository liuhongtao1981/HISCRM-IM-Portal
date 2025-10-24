/**
 * 查看表结构和数据
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('📊 数据库表结构和数据\n');

// 查看 conversations 表结构
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 conversations 表结构');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const convColumns = db.prepare("PRAGMA table_info(conversations)").all();
convColumns.forEach(col => {
  console.log(`  ${col.name} (${col.type})${col.pk ? ' PRIMARY KEY' : ''}`);
});

// 查看 conversations 数据
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('💬 conversations 数据');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const conversations = db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 10").all();
if (conversations.length === 0) {
  console.log('暂无数据\n');
} else {
  conversations.forEach((conv, i) => {
    console.log(`${i + 1}. 会话 ${conv.id || conv.conversation_id}`);
    Object.entries(conv).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        console.log(`   ${key}: ${value}`);
      }
    });
    console.log('');
  });
}

// 查看 direct_messages 表结构
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 direct_messages 表结构');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const dmColumns = db.prepare("PRAGMA table_info(direct_messages)").all();
dmColumns.forEach(col => {
  console.log(`  ${col.name} (${col.type})${col.pk ? ' PRIMARY KEY' : ''}`);
});

// 查看 direct_messages 数据
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✉️  direct_messages 数据');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const messages = db.prepare("SELECT * FROM direct_messages ORDER BY created_at DESC LIMIT 10").all();
if (messages.length === 0) {
  console.log('暂无数据\n');
} else {
  messages.forEach((msg, i) => {
    console.log(`${i + 1}. 消息 ${msg.id || msg.message_id}`);
    Object.entries(msg).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        console.log(`   ${key}: ${value}`);
      }
    });
    console.log('');
  });
}

// 统计
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📈 数据统计');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const stats = {
  conversations: db.prepare("SELECT COUNT(*) as count FROM conversations").get().count,
  direct_messages: db.prepare("SELECT COUNT(*) as count FROM direct_messages").get().count,
  comments: db.prepare("SELECT COUNT(*) as count FROM comments").get().count,
  discussions: db.prepare("SELECT COUNT(*) as count FROM discussions").get().count,
};

Object.entries(stats).forEach(([table, count]) => {
  console.log(`${table}: ${count} 条`);
});

db.close();
console.log('\n✅ 查询完成');
