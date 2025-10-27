/**
 * 测试评论 API 数据结构
 *
 * 目的：验证抖音评论 API 返回的数据中是否包含 reply_count 字段
 *
 * 测试方法：
 * 1. 手动在浏览器中打开评论管理页面
 * 2. 打开浏览器开发者工具 -> Network 标签
 * 3. 筛选 XHR 请求
 * 4. 点击视频查看评论
 * 5. 查找包含 "comment" 的 API 请求
 * 6. 查看响应数据结构
 */

console.log('📋 评论 API 数据结构测试指南\n');
console.log('═'.repeat(70));
console.log('测试步骤：\n');
console.log('1. 在浏览器中打开抖音创作者中心评论管理页面');
console.log('   URL: https://creator.douyin.com/creator-micro/interactive/comment\n');
console.log('2. 打开浏览器开发者工具（F12）');
console.log('   - 切换到 Network 标签');
console.log('   - 筛选 XHR 请求\n');
console.log('3. 点击视频缩略图，查看评论列表\n');
console.log('4. 在 Network 中查找包含 "comment" 的 API 请求');
console.log('   预期 API 模式: /comment.*list/\n');
console.log('5. 点击 API 请求，查看 Response 数据结构\n');
console.log('6. 验证以下字段是否存在：');
console.log('   - comment_info_list (评论列表)');
console.log('   - comment_info_list[].cid (评论ID)');
console.log('   - comment_info_list[].text (评论内容)');
console.log('   - comment_info_list[].user (用户信息)');
console.log('   - comment_info_list[].digg_count (点赞数)');
console.log('   - comment_info_list[].reply_comment_total ⭐ (回复总数)');
console.log('   - comment_info_list[].reply_to_reply_total ⭐ (二级回复总数)');
console.log('   - comment_info_list[].reply_list (回复列表，如果有)');
console.log('');
console.log('═'.repeat(70));
console.log('\n📊 已知的抖音评论 API 字段映射：\n');

const fieldMapping = {
  'cid': 'platform_comment_id',
  'text': 'content',
  'user.nickname': 'author_name',
  'user.uid': 'author_id',
  'user.avatar_thumb.url_list[0]': 'author_avatar',
  'create_time': 'created_at',
  'digg_count': 'stats_like_count',
  'reply_comment_total': 'reply_count ⭐',
};

Object.entries(fieldMapping).forEach(([apiField, dbField]) => {
  console.log(`  ${apiField.padEnd(35)} → ${dbField}`);
});

console.log('\n═'.repeat(70));
console.log('🔍 需要验证的关键问题：\n');
console.log('Q1: API 响应中是否有 reply_comment_total 字段？');
console.log('    - 如果有，这个字段的值是否准确反映了回复数？\n');
console.log('Q2: API 响应中是否直接返回了回复列表（reply_list）？');
console.log('    - 如果没有，是否需要点击"查看回复"按钮才会触发另一个 API？\n');
console.log('Q3: 如果需要额外的 API 来获取回复，这个 API 的模式是什么？');
console.log('    - 预期: /comment.*reply/ 或类似的模式\n');
console.log('═'.repeat(70));
console.log('\n💡 提示：\n');
console.log('如果 reply_comment_total = 0，说明评论确实没有回复');
console.log('如果 reply_comment_total > 0，但 discussions 表为空，说明需要改进爬虫逻辑');
console.log('');
