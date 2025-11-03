/**
 * 对比 DataStore (内存) 和 数据库中的时间戳格式
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n╔═══════════════════════════════════════════════════════╗');
console.log('║  检查 cache_contents 表中的时间戳格式                ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 查询作品
const contents = db.prepare(`
  SELECT
    id,
    json_extract(data, '$.contentId') as content_id,
    json_extract(data, '$.title') as title,
    json_extract(data, '$.publishTime') as publish_time,
    json_extract(data, '$.lastCrawlTime') as last_crawl_time,
    json_extract(data, '$.createdAt') as created_at,
    json_extract(data, '$.updatedAt') as updated_at
  FROM cache_contents
  WHERE account_id = ?
  ORDER BY json_extract(data, '$.publishTime') DESC
  LIMIT 5
`).all(accountId);

console.log(`找到 ${contents.length} 个作品\n`);

if (contents.length > 0) {
  console.log('【作品时间戳检查】\n');

  contents.forEach((content, index) => {
    console.log(`${index + 1}. 作品: ${content.title?.substring(0, 40) || '无标题'}...`);
    console.log(`   contentId: ${content.content_id}`);
    console.log('');

    // 检查 publishTime
    if (content.publish_time !== null) {
      const isMilliseconds = content.publish_time >= 10000000000 && content.publish_time < 10000000000000;
      const status = isMilliseconds ? '✅' : '❌';
      console.log(`   ${status} publishTime: ${content.publish_time}`);
      console.log(`      格式: ${isMilliseconds ? '毫秒级 (13位)' : content.publish_time < 10000000000 ? '秒级 (10位) ❌' : '未知格式'}`);
      console.log(`      转换为日期: ${new Date(content.publish_time).toLocaleString('zh-CN')}`);
    } else {
      console.log(`   ⚠️  publishTime: null`);
    }
    console.log('');

    // 检查 lastCrawlTime
    if (content.last_crawl_time !== null) {
      const isMilliseconds = content.last_crawl_time >= 10000000000 && content.last_crawl_time < 10000000000000;
      const status = isMilliseconds ? '✅' : '❌';
      console.log(`   ${status} lastCrawlTime: ${content.last_crawl_time}`);
      console.log(`      格式: ${isMilliseconds ? '毫秒级 (13位)' : content.last_crawl_time < 10000000000 ? '秒级 (10位) ❌' : '未知格式'}`);
      console.log(`      转换为日期: ${new Date(content.last_crawl_time).toLocaleString('zh-CN')}`);
    } else {
      console.log(`   ⚠️  lastCrawlTime: null`);
    }
    console.log('');

    // 检查 createdAt
    if (content.created_at !== null) {
      const isMilliseconds = content.created_at >= 10000000000 && content.created_at < 10000000000000;
      const status = isMilliseconds ? '✅' : '❌';
      console.log(`   ${status} createdAt: ${content.created_at}`);
      console.log(`      格式: ${isMilliseconds ? '毫秒级 (13位)' : content.created_at < 10000000000 ? '秒级 (10位) ❌' : '未知格式'}`);
      console.log(`      转换为日期: ${new Date(content.created_at).toLocaleString('zh-CN')}`);
    } else {
      console.log(`   ⚠️  createdAt: null`);
    }
    console.log('');

    console.log('─────────────────────────────────────────────────────');
    console.log('');
  });
}

// 查询会话对比
console.log('\n╔═══════════════════════════════════════════════════════╗');
console.log('║  检查 cache_conversations 表中的时间戳格式            ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');

const conversations = db.prepare(`
  SELECT
    id,
    json_extract(data, '$.conversationId') as conversation_id,
    json_extract(data, '$.userName') as user_name,
    json_extract(data, '$.createdAt') as created_at,
    json_extract(data, '$.updatedAt') as updated_at,
    json_extract(data, '$.lastMessageTime') as last_message_time
  FROM cache_conversations
  WHERE account_id = ?
  ORDER BY json_extract(data, '$.lastMessageTime') DESC
  LIMIT 3
`).all(accountId);

console.log(`找到 ${conversations.length} 个会话\n`);

if (conversations.length > 0) {
  console.log('【会话时间戳检查】\n');

  conversations.forEach((conv, index) => {
    console.log(`${index + 1}. 会话: ${conv.user_name || '未知用户'}`);
    console.log(`   conversationId: ${conv.conversation_id}`);
    console.log('');

    // 检查 createdAt
    if (conv.created_at !== null) {
      const isMilliseconds = conv.created_at >= 10000000000 && conv.created_at < 10000000000000;
      const status = isMilliseconds ? '✅' : '❌';
      console.log(`   ${status} createdAt: ${conv.created_at}`);
      console.log(`      格式: ${isMilliseconds ? '毫秒级 (13位)' : conv.created_at < 10000000000 ? '秒级 (10位) ❌' : '未知格式'}`);
      console.log(`      转换为日期: ${new Date(conv.created_at).toLocaleString('zh-CN')}`);
    } else {
      console.log(`   ⚠️  createdAt: null`);
    }
    console.log('');

    // 检查 lastMessageTime
    if (conv.last_message_time !== null) {
      const isMilliseconds = conv.last_message_time >= 10000000000 && conv.last_message_time < 10000000000000;
      const status = isMilliseconds ? '✅' : '❌';
      console.log(`   ${status} lastMessageTime: ${conv.last_message_time}`);
      console.log(`      格式: ${isMilliseconds ? '毫秒级 (13位)' : conv.last_message_time < 10000000000 ? '秒级 (10位) ❌' : '未知格式'}`);
      console.log(`      转换为日期: ${new Date(conv.last_message_time).toLocaleString('zh-CN')}`);
    } else {
      console.log(`   ⚠️  lastMessageTime: null`);
    }
    console.log('');

    console.log('─────────────────────────────────────────────────────');
    console.log('');
  });
}

console.log('═══════════════════════════════════════════════════════\n');

db.close();
