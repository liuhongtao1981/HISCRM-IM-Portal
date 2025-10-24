/**
 * 验证 Discussions 数据入库测试
 * 用于验证 discussions 表数据是否成功入库
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../packages/master/data/master.db');
const db = new Database(dbPath);

console.log('\n📊 Discussions 数据入库验证\n');
console.log('=' .repeat(80));

// 1. 统计所有表的数据
console.log('\n📈 数据统计:');
const tables = [
  { name: 'douyin_videos', label: '作品 (douyin_videos)' },
  { name: 'works', label: '作品 (works)' },
  { name: 'comments', label: '评论 (comments)' },
  { name: 'discussions', label: '讨论 (discussions)' },
  { name: 'direct_messages', label: '私信 (direct_messages)' },
  { name: 'conversations', label: '会话 (conversations)' },
];

tables.forEach(({ name, label }) => {
  try {
    const result = db.prepare(`SELECT COUNT(*) as count FROM ${name}`).get();
    const icon = result.count > 0 ? '✅' : '❌';
    console.log(`  ${icon} ${label}: ${result.count} 条`);
  } catch (error) {
    console.log(`  ⚠️  ${label}: 表不存在或查询失败`);
  }
});

// 2. 查看 discussions 详细数据
console.log('\n\n📝 Discussions 详细数据:');
console.log('-'.repeat(80));

try {
  const discussions = db.prepare(`
    SELECT
      id,
      account_id,
      platform,
      platform_user_id,
      platform_discussion_id,
      parent_comment_id,
      content,
      author_name,
      author_id,
      like_count,
      detected_at,
      created_at
    FROM discussions
    ORDER BY created_at DESC
    LIMIT 10
  `).all();

  if (discussions.length === 0) {
    console.log('  ⚠️  没有找到任何 discussions 数据');
  } else {
    console.log(`  找到 ${discussions.length} 条 discussions 数据:\n`);

    discussions.forEach((d, index) => {
      console.log(`  [${index + 1}] Discussion ID: ${d.id.substring(0, 20)}...`);
      console.log(`      账户: ${d.account_id?.substring(0, 30)}...`);
      console.log(`      平台: ${d.platform}`);
      console.log(`      平台用户ID: ${d.platform_user_id || 'null'}`);
      console.log(`      平台讨论ID: ${d.platform_discussion_id}`);
      console.log(`      父评论ID: ${d.parent_comment_id}`);
      console.log(`      内容: ${d.content?.substring(0, 50) || ''}...`);
      console.log(`      作者: ${d.author_name} (ID: ${d.author_id})`);
      console.log(`      点赞数: ${d.like_count}`);
      console.log(`      检测时间: ${new Date(d.detected_at * 1000).toLocaleString('zh-CN')}`);
      console.log(`      创建时间: ${new Date(d.created_at * 1000).toLocaleString('zh-CN')}`);
      console.log();
    });
  }
} catch (error) {
  console.error('  ❌ 查询失败:', error.message);
}

// 3. 检查 discussions 和 comments 的关联
console.log('\n🔗 Discussions 与 Comments 关联检查:');
console.log('-'.repeat(80));

try {
  const linkedDiscussions = db.prepare(`
    SELECT
      d.id as discussion_id,
      d.content as discussion_content,
      d.parent_comment_id,
      c.id as comment_id,
      c.content as comment_content
    FROM discussions d
    LEFT JOIN comments c ON d.parent_comment_id = c.id
    LIMIT 5
  `).all();

  if (linkedDiscussions.length === 0) {
    console.log('  ⚠️  没有找到关联数据');
  } else {
    linkedDiscussions.forEach((item, index) => {
      console.log(`  [${index + 1}] Discussion: ${item.discussion_content?.substring(0, 40)}...`);
      if (item.comment_id) {
        console.log(`      ✅ 关联评论: ${item.comment_content?.substring(0, 40)}...`);
      } else {
        console.log(`      ❌ 未找到父评论 (parent_comment_id: ${item.parent_comment_id})`);
      }
      console.log();
    });
  }
} catch (error) {
  console.error('  ❌ 关联检查失败:', error.message);
}

// 4. 最近入库时间
console.log('\n⏰ 最近数据入库时间:');
console.log('-'.repeat(80));

['comments', 'discussions', 'direct_messages'].forEach(tableName => {
  try {
    const latest = db.prepare(`
      SELECT
        created_at,
        detected_at
      FROM ${tableName}
      ORDER BY created_at DESC
      LIMIT 1
    `).get();

    if (latest) {
      const createdTime = new Date(latest.created_at * 1000).toLocaleString('zh-CN');
      const detectedTime = new Date(latest.detected_at * 1000).toLocaleString('zh-CN');
      console.log(`  ${tableName}:`);
      console.log(`    创建时间: ${createdTime}`);
      console.log(`    检测时间: ${detectedTime}`);
    } else {
      console.log(`  ${tableName}: 无数据`);
    }
  } catch (error) {
    console.log(`  ${tableName}: 查询失败`);
  }
});

console.log('\n' + '='.repeat(80));
console.log('\n✅ 验证完成！\n');

db.close();
