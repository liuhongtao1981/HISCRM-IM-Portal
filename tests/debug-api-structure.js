/**
 * 调试脚本：查看抖音评�?API 响应的完整对象结�?
 *
 * 目的�?
 * 1. 完整打印 API 响应�?JSON 格式
 * 2. 递归显示对象结构�?
 * 3. 详细展示所有对象类型字段（可能包含视频信息�?
 */

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('�?   调试：抖音评�?API 响应完整对象结构分析工具              �?);
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('📝 已增强的日志输出包括：\n');

console.log('1️⃣  完整�?JSON 格式化输�?);
console.log('   - 包含�?2 条评论作为示�?);
console.log('   - 格式化缩进，易于阅读\n');

console.log('2️⃣  对象结构树（递归展示�?);
console.log('   - 显示每个属性的类型');
console.log('   - 对象：显示键数量和键名列�?);
console.log('   - 数组：显示长度和第一个元素结�?);
console.log('   - 字符串：显示内容和长�?);
console.log('   - 最大深度：4 层\n');

console.log('3️⃣  统计信息');
console.log('   - 顶层键名和数�?);
console.log('   - 评论总数');
console.log('   - Item ID');
console.log('   - 分页信息（has_more, cursor）\n');

console.log('4️⃣  所有对象类型字段详细展开');
console.log('   - 专门输出所有对象类型的字段');
console.log('   - 可能包含视频标题、描述等信息');
console.log('   - 逐个展示对象的所有属性和值\n');

console.log('�?.repeat(66));
console.log('\n📋 预期日志输出示例：\n');

console.log('╔═══════════════════════════════════════════════════════════════�?);
console.log('�? 🔍 Comment API Response - Complete Object Structure          �?);
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

console.log('📦 Complete JSON (formatted):');
console.log('{');
console.log('  "comment_info_list": [');
console.log('    { /* 第一条评�?*/ },');
console.log('    { /* 第二条评�?*/ },');
console.log('    "... (2 more comments)"');
console.log('  ],');
console.log('  "cursor": 4,');
console.log('  "extra": { "now": 1761531814000 },');
console.log('  "has_more": false,');
console.log('  "total_count": 4,');
console.log('  "aweme_info": {  �?可能包含视频信息�?);
console.log('    "aweme_id": "7xxx...",');
console.log('    "desc": "视频标题...",');
console.log('    "create_time": 1703200978');
console.log('  }');
console.log('}\n');

console.log('📋 Object Structure Tree:');
console.log('Root object:');
console.log('  comment_info_list: [Array, length: 4]');
console.log('    First item structure:');
console.log('      comment_id: "..." (string, length: 120)');
console.log('      create_time: "1703200978" (string, length: 10)');
console.log('      text: "[赞][赞][赞]" (string, length: 15)');
console.log('      user_info: {Object, keys: 3} [avatar_url, screen_name, user_id]');
console.log('        avatar_url: "https://..." (string, length: 150)');
console.log('        screen_name: "夕阳" (string, length: 2)');
console.log('        user_id: "..." (string, length: 120)');
console.log('  cursor: 4 (number)');
console.log('  extra: {Object, keys: 1} [now]');
console.log('    now: 1761531814000 (number)');
console.log('  has_more: false (boolean)');
console.log('  total_count: 4 (number)\n');

console.log('📊 Statistics:');
console.log('   - Top-level keys (8): comment_info_list, cursor, extra, has_more, ...');
console.log('   - Total comments in response: 4');
console.log('   - Item ID: @j/du7rRFQE76t8pb8r3ttsB...');
console.log('   - Has more pages: false');
console.log('   - Total count: 4\n');

console.log('🔎 All Object-type Fields (potential video info):');
console.log('');
console.log('   📦 extra:');
console.log('      Keys (1): now');
console.log('      Content:');
console.log('         now: 1761531814000');
console.log('');
console.log('   📦 aweme_info:  �?如果存在，这里就有视频信息！');
console.log('      Keys (10): aweme_id, desc, create_time, statistics, ...');
console.log('      Content:');
console.log('         aweme_id: "7xxx..."');
console.log('         desc: "第一次排位五杀，感谢中国好队友"  �?视频标题�?);
console.log('         create_time: 1703200978');
console.log('         statistics: {Object, keys: play_count, stats_like_count, ...}');
console.log('');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

console.log('�?.repeat(66));
console.log('\n🚀 使用步骤：\n');

console.log('1. 重启 Worker:');
console.log('   npm run start:worker\n');

console.log('2. 等待评论抓取，查看日志文�?');
console.log('   tail -f packages/worker/logs/douyin-crawl-comments.log\n');

console.log('3. 查找 "Complete Object Structure" 部分');
console.log('   重点关注 "All Object-type Fields" 部分');
console.log('   找到包含 "desc"�?title" �?"aweme" 的字段\n');

console.log('4. 如果发现视频标题字段，记录下来：');
console.log('   - 字段路径（如：json.aweme_info.desc�?);
console.log('   - 字段值（确认是否为视频标题）\n');

console.log('�?.repeat(66));
console.log('\n�?准备就绪！重�?Worker 并查看详细日志输出。\n');
