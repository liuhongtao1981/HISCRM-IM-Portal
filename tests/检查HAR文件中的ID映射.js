/**
 * 检查 HAR 文件中作品 API 和评论 API 的完整响应
 * 找出是否包含两种 ID 的映射关系
 */

const fs = require('fs');
const path = require('path');

const harPath = path.join(__dirname, 'creator.douyin.com.har');

console.log('📖 读取 HAR 文件...\n');
const harContent = JSON.parse(fs.readFileSync(harPath, 'utf8'));

// 查找作品列表 API
console.log('📦 检查作品列表 API:');
console.log('='.repeat(80));

const worksAPIs = harContent.log.entries.filter(entry =>
  entry.request.url.includes('/aweme/v1/creator/item/list/')
);

console.log(`找到 ${worksAPIs.length} 次作品列表 API 调用\n`);

if (worksAPIs.length > 0) {
  const firstAPI = worksAPIs[0];
  const responseText = firstAPI.response.content.text;

  if (responseText) {
    const respData = JSON.parse(responseText);

    if (respData.item_list && respData.item_list.length > 0) {
      console.log(`✅ 找到 ${respData.item_list.length} 个作品`);
      console.log('\n📝 第一个作品的完整数据结构:');
      console.log('-'.repeat(80));

      const firstItem = respData.item_list[0];

      // 打印所有关键字段
      console.log(`标题: ${firstItem.desc || firstItem.title || '无'}`);
      console.log(`\nID 相关字段:`);

      if (firstItem.aweme_id) console.log(`  ✅ aweme_id: ${firstItem.aweme_id}`);
      if (firstItem.item_id) console.log(`  ✅ item_id: ${firstItem.item_id}`);
      if (firstItem.sec_item_id) console.log(`  ✅ sec_item_id: ${firstItem.sec_item_id}`);
      if (firstItem.share_info?.sec_item_id) console.log(`  ✅ share_info.sec_item_id: ${firstItem.share_info.sec_item_id}`);

      console.log(`\n其他关键字段:`);
      console.log(`  评论数: ${firstItem.statistics?.comment_count || 0}`);
      console.log(`  创建时间: ${firstItem.create_time || '无'}`);

      // 检查所有作品是否都有这两种 ID
      console.log('\n🔍 检查所有作品的 ID 字段:');
      console.log('-'.repeat(80));

      let hasAwemeId = 0;
      let hasSecItemId = 0;
      let hasBothIds = 0;

      respData.item_list.forEach((item, index) => {
        const aweme = item.aweme_id || item.item_id;
        const sec = item.sec_item_id || item.share_info?.sec_item_id;

        if (aweme) hasAwemeId++;
        if (sec) hasSecItemId++;
        if (aweme && sec) hasBothIds++;

        if (index < 3) {
          console.log(`\n作品 ${index + 1}:`);
          console.log(`  标题: ${(item.desc || item.title || '').substring(0, 40)}...`);
          if (aweme) console.log(`  ✅ aweme_id: ${aweme}`);
          if (sec) console.log(`  ✅ sec_item_id: ${sec.substring(0, 50)}...`);
        }
      });

      console.log(`\n📊 统计结果 (共 ${respData.item_list.length} 个作品):`);
      console.log(`  有 aweme_id: ${hasAwemeId} 个`);
      console.log(`  有 sec_item_id: ${hasSecItemId} 个`);
      console.log(`  两种 ID 都有: ${hasBothIds} 个`);

      if (hasBothIds === respData.item_list.length) {
        console.log(`\n✅ 所有作品都包含两种 ID！可以建立映射关系`);
      } else {
        console.log(`\n⚠️  不是所有作品都有两种 ID，需要进一步检查`);
      }
    }
  }
}

// 查找评论 API
console.log('\n\n📝 检查评论列表 API:');
console.log('='.repeat(80));

const commentAPIs = harContent.log.entries.filter(entry =>
  entry.request.url.includes('/comment/list/')
);

console.log(`找到 ${commentAPIs.length} 次评论列表 API 调用\n`);

if (commentAPIs.length > 0) {
  const firstAPI = commentAPIs[0];
  const responseText = firstAPI.response.content.text;

  if (responseText) {
    const respData = JSON.parse(responseText);

    if (respData.comments && respData.comments.length > 0) {
      console.log(`✅ 找到 ${respData.comments.length} 条评论`);
      console.log('\n📝 第一条评论的完整数据结构:');
      console.log('-'.repeat(80));

      const firstComment = respData.comments[0];

      console.log(`评论内容: ${firstComment.text}`);
      console.log(`\nID 相关字段:`);

      if (firstComment.aweme_id) console.log(`  ✅ aweme_id: ${firstComment.aweme_id}`);
      if (firstComment.cid) console.log(`  ✅ cid (评论ID): ${firstComment.cid}`);
      if (firstComment.sec_aweme_id) console.log(`  ✅ sec_aweme_id: ${firstComment.sec_aweme_id}`);

      console.log(`\n其他关键字段:`);
      console.log(`  作者: ${firstComment.user?.nickname || '无'}`);
      console.log(`  创建时间: ${firstComment.create_time || '无'}`);

      // 检查所有评论的 ID 字段
      console.log('\n🔍 检查所有评论的 ID 字段:');
      console.log('-'.repeat(80));

      let hasAwemeId = 0;
      let hasSecAwemeId = 0;
      let hasBothIds = 0;

      respData.comments.forEach((comment, index) => {
        const aweme = comment.aweme_id;
        const sec = comment.sec_aweme_id;

        if (aweme) hasAwemeId++;
        if (sec) hasSecAwemeId++;
        if (aweme && sec) hasBothIds++;

        if (index < 3) {
          console.log(`\n评论 ${index + 1}:`);
          console.log(`  内容: ${comment.text.substring(0, 30)}...`);
          if (aweme) console.log(`  ✅ aweme_id: ${aweme}`);
          if (sec) console.log(`  ✅ sec_aweme_id: ${sec}`);
        }
      });

      console.log(`\n📊 统计结果 (共 ${respData.comments.length} 条评论):`);
      console.log(`  有 aweme_id: ${hasAwemeId} 条`);
      console.log(`  有 sec_aweme_id: ${hasSecAwemeId} 条`);
      console.log(`  两种 ID 都有: ${hasBothIds} 条`);

      if (hasBothIds === respData.comments.length) {
        console.log(`\n✅ 所有评论都包含两种 ID！可以建立映射关系`);
      } else {
        console.log(`\n⚠️  不是所有评论都有两种 ID`);
      }
    }
  }
}

console.log('\n\n💡 结论和建议:');
console.log('='.repeat(80));
console.log('基于以上分析，我们需要:');
console.log('1. 在爬取作品时，同时保存 aweme_id 和 sec_item_id');
console.log('2. 在爬取评论时，检查是否有 sec_aweme_id 字段');
console.log('3. 使用 aweme_id 作为关联的主键');
console.log('4. 修改数据模型，添加额外的 ID 字段用于映射\n');
