/**
 * 检查作品的 publishTime �?lastCrawlTime 时间戳格�? */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath, { readonly: true });

console.log('\n╔═══════════════════════════════════════════════════════�?);
console.log('�? 检查作品的时间戳格�?                               �?);
console.log('╚═══════════════════════════════════════════════════════╝\n');

const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

// 查询作品
const contents = db.prepare(`
  SELECT
    id,
    json_extract(data, '$.contentId') as content_id,
    json_extract(data, '$.title') as title,
    json_extract(data, '$.publishTime') as publish_time,
    json_extract(data, '$.lastCrawlTime') as last_crawl_time
  FROM cache_contents
  WHERE account_id = ?
  ORDER BY json_extract(data, '$.publishTime') DESC
  LIMIT 5
`).all(accountId);

console.log(`找到 ${contents.length} 个作品\n`);

if (contents.length > 0) {
  console.log('【作品时间戳检查】\n');

  contents.forEach((content, index) => {
    const publishTime = content.publish_time;
    const lastCrawlTime = content.last_crawl_time;

    const isPublishMilliseconds = publishTime >= 10000000000 && publishTime < 10000000000000;
    const isCrawlMilliseconds = lastCrawlTime >= 10000000000 && lastCrawlTime < 10000000000000;

    const publishStatus = isPublishMilliseconds ? '�? : '�?;
    const crawlStatus = isCrawlMilliseconds ? '�? : '�?;

    console.log(`${index + 1}. 作品: ${content.title?.substring(0, 30) || '无标�?}...`);
    console.log(`   contentId: ${content.content_id}`);
    console.log('');
    console.log(`   ${publishStatus} publishTime: ${publishTime}`);
    console.log(`      格式: ${isPublishMilliseconds ? '毫秒�?(13�?' : publishTime < 10000000000 ? '秒级 (10�? �? : '未知格式'}`);
    console.log(`      转换为日�? ${new Date(publishTime).toLocaleString('zh-CN')}`);
    console.log('');
    console.log(`   ${crawlStatus} lastCrawlTime: ${lastCrawlTime}`);
    console.log(`      格式: ${isCrawlMilliseconds ? '毫秒�?(13�?' : lastCrawlTime < 10000000000 ? '秒级 (10�? �? : '未知格式'}`);
    console.log(`      转换为日�? ${new Date(lastCrawlTime).toLocaleString('zh-CN')}`);
    console.log('');
    console.log('─────────────────────────────────────────────────────');
    console.log('');
  });
}

console.log('═══════════════════════════════════════════════════════\n');

db.close();
