/**
 * 检查作�?API 原始数据结构
 * 目的：确�?API 响应中是否包�?aweme_id �?share_url
 */

const fs = require('fs');
const path = require('path');

// 读取最新的日志文件（排�?error 日志�?
const logDir = path.join(__dirname, '../packages/worker/logs');
const logFiles = fs.readdirSync(logDir)
  .filter(f => f.startsWith('douyin-data_') && !f.includes('-error'))
  .map(f => ({
    name: f,
    time: fs.statSync(path.join(logDir, f)).mtime.getTime()
  }))
  .sort((a, b) => b.time - a.time);

if (logFiles.length === 0) {
  console.log('�?没有找到日志文件');
  process.exit(1);
}

const logFile = path.join(logDir, logFiles[0].name);
console.log(`📖 读取日志文件: ${logFiles[0].name}\n`);

const logContent = fs.readFileSync(logFile, 'utf8');
const lines = logContent.split('\n').filter(line => line.trim());

console.log(`总共 ${lines.length} 行日志\n`);

// 查找数据快照
const snapshots = lines
  .map((line, index) => {
    try {
      const log = JSON.parse(line);
      if (log.message === '📸 Data Snapshot' && log.snapshot) {
        return {
          index,
          snapshot: log.snapshot
        };
      }
    } catch (err) {}
    return null;
  })
  .filter(s => s !== null);

if (snapshots.length === 0) {
  console.log('�?没有找到数据快照');
  process.exit(1);
}

const latest = snapshots[snapshots.length - 1].snapshot;

console.log('📊 最新快照数据统�?');
console.log(`   作品: ${latest.data.contents?.length || 0} 个`);
console.log(`   评论: ${latest.data.comments?.length || 0} 条\n`);

// 检查作品数据中是否�?rawData
if (latest.data.contents && latest.data.contents.length > 0) {
  const firstContent = latest.data.contents[0];

  console.log('📦 第一个作品的字段:');
  console.log('='.repeat(80));
  console.log(`标题: ${firstContent.title?.substring(0, 50)}...`);
  console.log(`contentId: ${firstContent.contentId?.substring(0, 60)}...`);
  console.log(`commentCount: ${firstContent.commentCount}`);

  // 检查是否有 rawData
  if (firstContent.rawData) {
    console.log('\n�?找到 rawData 字段！\n');

    const rawData = firstContent.rawData;
    console.log('🔍 rawData 中的 ID 相关字段:');
    console.log('-'.repeat(80));

    if (rawData.aweme_id) {
      console.log(`  �?aweme_id: ${rawData.aweme_id}`);
    } else {
      console.log(`  �?aweme_id: 不存在`);
    }

    if (rawData.item_id) {
      console.log(`  �?item_id: ${rawData.item_id?.substring(0, 60)}...`);
    } else {
      console.log(`  �?item_id: 不存在`);
    }

    if (rawData.sec_item_id) {
      console.log(`  �?sec_item_id: ${rawData.sec_item_id?.substring(0, 60)}...`);
    } else {
      console.log(`  �?sec_item_id: 不存在`);
    }

    if (rawData.item_id_plain) {
      console.log(`  �?item_id_plain: ${rawData.item_id_plain}`);
    } else {
      console.log(`  �?item_id_plain: 不存在`);
    }

    if (rawData.share_url) {
      console.log(`  �?share_url: ${rawData.share_url}`);

      // 尝试�?share_url 提取 aweme_id
      const match = rawData.share_url.match(/\/video\/(\d+)/);
      if (match) {
        console.log(`  🎯 �?share_url 提取�?aweme_id: ${match[1]}`);
      }
    } else {
      console.log(`  �?share_url: 不存在`);
    }

    console.log(`\n📝 rawData 的所有顶层字�?`);
    console.log(`   ${Object.keys(rawData).join(', ')}`);

  } else {
    console.log('\n�?没有找到 rawData 字段');
    console.log('   DataManager 没有保存原始 API 数据\n');
  }
} else {
  console.log('�?没有作品数据');
}

// 检查评论数�?
if (latest.data.comments && latest.data.comments.length > 0) {
  console.log('\n\n💬 评论数据分析:');
  console.log('='.repeat(80));

  const firstComment = latest.data.comments[0];
  console.log(`内容: ${firstComment.content}`);
  console.log(`commentId: ${firstComment.commentId}`);
  console.log(`contentId: ${firstComment.contentId} (纯数�?`);

  if (firstComment.rawData) {
    console.log('\n�?评论也有 rawData');
    const rawData = firstComment.rawData;
    console.log(`  aweme_id: ${rawData.aweme_id || '不存�?}`);
    console.log(`  sec_aweme_id: ${rawData.sec_aweme_id || '不存�?}`);
  }
}

console.log('\n\n💡 结论:');
console.log('='.repeat(80));
if (latest.data.contents && latest.data.contents[0]?.rawData) {
  const rawData = latest.data.contents[0].rawData;

  if (rawData.aweme_id) {
    console.log('�?作品 API 返回�?aweme_id，应该直接使�?);
  } else if (rawData.share_url) {
    const match = rawData.share_url.match(/\/video\/(\d+)/);
    if (match) {
      console.log('�?可以�?share_url 提取 aweme_id');
      console.log(`   当前代码应该能工作，但实�?contentId 仍是 Base64`);
      console.log(`   可能的原因：`);
      console.log(`   1. 代码修改后没有重�?Worker`);
      console.log(`   2. 数据是从旧的缓存中读取的`);
      console.log(`   3. API 响应被修改前就已经处理了`);
    } else {
      console.log('�?share_url 格式不符合预�?);
    }
  } else {
    console.log('�?作品 API 既没�?aweme_id 也没�?share_url');
    console.log('   需要寻找其他方法获取数�?ID');
  }
} else {
  console.log('⚠️  无法分析：作品数据中没有 rawData 字段');
}
