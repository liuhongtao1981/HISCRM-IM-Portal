/**
 * 检查所有爬虫的 DataManager 集成状�?
 */

const fs = require('fs');
const path = require('path');

console.log('══════════════════════════════════════════════════════�?);
console.log('  爬虫 DataManager 集成状态检�?);
console.log('═══════════════════════════════════════════════════════\n');

const crawlers = [
  {
    name: '私信爬虫',
    file: 'packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js',
    keywords: ['globalContext', 'dataManager', 'batchUpsertConversations', 'batchUpsertMessages']
  },
  {
    name: '作品爬虫',
    file: 'packages/worker/src/platforms/douyin/crawl-contents.js',
    keywords: ['globalContext', 'dataManager', 'batchUpsertContents']
  },
  {
    name: '评论爬虫',
    file: 'packages/worker/src/platforms/douyin/crawl-comments.js',
    keywords: ['globalContext', 'dataManager', 'batchUpsertComments']
  }
];

crawlers.forEach(crawler => {
  console.log(`📋 ${crawler.name}`);
  console.log(`   文件: ${crawler.file}`);

  if (!fs.existsSync(crawler.file)) {
    console.log(`   �?文件不存在\n`);
    return;
  }

  const content = fs.readFileSync(crawler.file, 'utf-8');

  const checks = {
    hasGlobalContext: content.includes('globalContext'),
    hasDataManagerParam: /async function.*\(.*dataManager.*\)/.test(content),
    hasDataManagerUsage: content.includes('dataManager.'),
  };

  console.log(`   ${checks.hasGlobalContext ? '�? : '�?} globalContext 定义`);
  console.log(`   ${checks.hasDataManagerParam ? '�? : '�?} dataManager 参数`);
  console.log(`   ${checks.hasDataManagerUsage ? '�? : '�?} DataManager 使用`);

  // 检查关键方�?
  crawler.keywords.forEach(keyword => {
    const has = content.includes(keyword);
    console.log(`   ${has ? '�? : '⏸️ '} ${keyword}`);
  });

  const integrated = checks.hasGlobalContext && checks.hasDataManagerParam && checks.hasDataManagerUsage;
  console.log(`   ${integrated ? '�?已集�? : '�?未集�?}\n`);
});

console.log('══════════════════════════════════════════════════════�?);
