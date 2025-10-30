/**
 * 测试 API 模式匹配
 * 验证 Playwright 的 route.request().url() 匹配逻辑
 */

const minimatch = require('minimatch');

// 测试 URL
const testUrls = [
  'https://creator.douyin.com/aweme/v1/creator/item/list?cursor=',
  'https://creator.douyin.com/aweme/v1/creator/item/list/?cursor=',
  'https://creator.douyin.com/creator/item/list?cursor=',
  'https://creator.douyin.com/creator/item/list/?cursor=',
];

// 测试模式
const patterns = [
  '**/creator/item/list?**',      // 旧模式（无斜杠）
  '**/creator/item/list/?**',     // 新模式（有斜杠）
  '**/creator/item/list{/,}?**',  // 兼容模式（可选斜杠）
];

console.log('🔍 API 模式匹配测试\n');

patterns.forEach((pattern, pi) => {
  console.log(`\n模式 ${pi + 1}: ${pattern}`);
  console.log('='.repeat(80));

  testUrls.forEach((url, ui) => {
    const match = minimatch(url, pattern);
    const icon = match ? '✅' : '❌';
    console.log(`${icon} URL ${ui + 1}: ${url}`);
  });
});

console.log('\n\n📊 统计结果:');
console.log('='.repeat(80));

patterns.forEach((pattern, pi) => {
  const matchCount = testUrls.filter(url => minimatch(url, pattern)).length;
  console.log(`模式 ${pi + 1} 匹配: ${matchCount}/${testUrls.length} 个 URL`);
});

console.log('\n\n💡 结论:');
console.log('='.repeat(80));

const oldPattern = patterns[0];
const newPattern = patterns[1];
const flexPattern = patterns[2];

const oldMatches = testUrls.filter(url => minimatch(url, oldPattern)).length;
const newMatches = testUrls.filter(url => minimatch(url, newPattern)).length;
const flexMatches = testUrls.filter(url => minimatch(url, flexPattern)).length;

if (oldMatches === 0) {
  console.log('❌ 旧模式 (**/creator/item/list?**) 无法匹配任何 URL');
  console.log('   原因：抖音 API 返回的 URL 末尾有斜杠 (list/?)');
}

if (newMatches > oldMatches) {
  console.log('✅ 新模式 (**/creator/item/list/?**) 成功匹配 ' + newMatches + ' 个 URL');
  console.log('   推荐使用此模式！');
}

if (flexMatches === testUrls.length) {
  console.log('🌟 兼容模式 (**/creator/item/list{/,}?**) 匹配所有 URL');
  console.log('   如果需要兼容两种格式，可以使用此模式');
}

console.log('\n');
