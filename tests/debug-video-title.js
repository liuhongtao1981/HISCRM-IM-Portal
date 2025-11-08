/**
 * 调试脚本：查看抖音评�?API 响应中的视频标题信息
 *
 * 目的�?
 * 1. 拦截评论 API 响应
 * 2. 查看响应中包含的视频信息字段
 * 3. 找出正确的标题字段映�?
 */

async function debugVideoTitle() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('�?        调试：抖音评�?API 响应中的视频标题信息              �?);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('⚠️  此脚本需要在 Worker 环境中运�?);
  console.log('   请执行以下步骤：');
  console.log('   1. 启动 Master: npm run start:master');
  console.log('   2. 启动 Worker: npm run start:worker');
  console.log('   3. 等待 Worker 登录账户并抓取评�?);
  console.log('   4. 查看 Worker 日志输出\n');

  console.log('预期日志输出�?);
  console.log('  ╔═══════════════════════════════════════════════════════════════�?);
  console.log('  �? 🔍 Comment API Response Structure (First Page)               �?);
  console.log('  ╚═══════════════════════════════════════════════════════════════�?);
  console.log('  📋 Top-level keys: ...');
  console.log('  📦 可能的视频信息字�?..\n');

  console.log('�?调试日志已添加到 crawl-comments.js');
  console.log('   位置: packages/worker/src/platforms/douyin/crawl-comments.js:73-106\n');

  console.log('📝 问题分析�?);
  console.log('   当前问题：作品标题显示为"未知作品"');
  console.log('   原因：视频信息匹配逻辑不可�?);
  console.log('   位置：crawl-comments.js:422-425');
  console.log('   ```javascript');
  console.log('   const videoInfo = videosToClick.find(v => v.commentCountText == totalCount.toString()) || {');
  console.log('     title: "未知作品",');
  console.log('   };');
  console.log('   ```\n');

  console.log('   此匹配方式问题：');
  console.log('   �?两个视频评论数相同时会匹配错�?);
  console.log('   �?videosToClick 数组�?API 响应�?item_id 无直接关联\n');

  console.log('💡 解决方案�?);
  console.log('   1. 查看 API 响应中是否包含视频标题信�?);
  console.log('   2. 如果有，直接�?API 响应中提�?);
  console.log('   3. 如果没有，需要建�?DOM 元素索引�?item_id 的映射\n');

  console.log('🔍 下一步：');
  console.log('   运行 Worker 并查看日志，找到 API 响应中的视频信息字段');
}

debugVideoTitle();
