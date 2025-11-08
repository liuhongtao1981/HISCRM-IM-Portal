/**
 * �?DataManager 日志中提�?API 原始响应数据
 * 查看作品 API 和评�?API 的完整响应结�?
 */

const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, '../packages/worker/logs/douyin-data_acc-98296c87-2e42-447a-9d8b-8be008ddb6e4.log');

console.log('📖 读取日志文件...\n');
const logContent = fs.readFileSync(logPath, 'utf8');
const lines = logContent.split('\n').filter(line => line.trim());

// 查找作品 API 触发日志
console.log('📦 查找作品列表 API 原始响应:');
console.log('='.repeat(80));

const worksAPIs = lines
  .map(line => {
    try {
      const log = JSON.parse(line);
      if (log.message && log.message.includes('作品列表 API') && log.message.includes('触发')) {
        return log;
      }
    } catch (err) {}
    return null;
  })
  .filter(log => log !== null);

console.log(`找到 ${worksAPIs.length} 次作�?API 触发记录\n`);

if (worksAPIs.length > 0) {
  const firstLog = worksAPIs[0];
  console.log(`时间: ${firstLog.timestamp}`);
  console.log(`消息: ${firstLog.message}\n`);
}

// 查找评论 API 触发日志
console.log('📝 查找评论列表 API 原始响应:');
console.log('='.repeat(80));

const commentAPIs = lines
  .map(line => {
    try {
      const log = JSON.parse(line);
      if (log.message && log.message.includes('评论列表 API') && log.message.includes('触发')) {
        return log;
      }
    } catch (err) {}
    return null;
  })
  .filter(log => log !== null);

console.log(`找到 ${commentAPIs.length} 次评�?API 触发记录\n`);

if (commentAPIs.length > 0) {
  const firstLog = commentAPIs[0];
  console.log(`时间: ${firstLog.timestamp}`);
  console.log(`消息: ${firstLog.message}\n`);
}

// 最关键：查�?API 拦截管理器的匹配日志
console.log('🎯 查找 API 拦截器的响应日志:');
console.log('='.repeat(80));

const apiMatches = lines
  .map(line => {
    try {
      const log = JSON.parse(line);
      if (log.message && log.message.includes('[MATCH]')) {
        return log;
      }
    } catch (err) {}
    return null;
  })
  .filter(log => log !== null);

console.log(`找到 ${apiMatches.length} �?API 匹配记录`);

if (apiMatches.length > 0) {
  console.log('\n�?次匹�?');
  apiMatches.slice(0, 5).forEach((log, index) => {
    console.log(`${index + 1}. ${log.timestamp}`);
    console.log(`   ${log.message}\n`);
  });
}

// 尝试找到保存�?API body 数据
console.log('\n🔍 搜索可能包含完整 API 响应的日�?');
console.log('='.repeat(80));

const detailedLogs = lines
  .map(line => {
    try {
      const log = JSON.parse(line);
      // 查找包含 item_list �?aweme_id 的日�?
      if (JSON.stringify(log).includes('item_list') || JSON.stringify(log).includes('aweme_id')) {
        return log;
      }
    } catch (err) {}
    return null;
  })
  .filter(log => log !== null);

console.log(`找到 ${detailedLogs.length} 条可能包含详细数据的日志`);

if (detailedLogs.length > 0) {
  console.log('\n�?�?');
  detailedLogs.slice(0, 3).forEach((log, index) => {
    console.log(`${index + 1}. ${log.timestamp}`);
    console.log(`   消息: ${log.message}`);

    // 尝试找到 item_list
    const logStr = JSON.stringify(log);
    if (logStr.includes('item_list')) {
      console.log(`   �?包含 item_list 字段`);
    }
    if (logStr.includes('aweme_id')) {
      console.log(`   �?包含 aweme_id 字段`);
    }
    if (logStr.includes('sec_item_id')) {
      console.log(`   �?包含 sec_item_id 字段`);
    }
    console.log();
  });
}

console.log('\n💡 建议:');
console.log('='.repeat(80));
console.log('由于日志中没有保存完整的 API 响应体，我们需�?');
console.log('1. 修改 API 拦截器，临时记录完整的响应体（用于调试）');
console.log('2. 重新运行一次爬虫，捕获完整的作�?API 响应');
console.log('3. 分析响应中是否同时包�?aweme_id �?sec_item_id');
console.log('4. 如果有，修改数据收集逻辑同时保存两种 ID\n');
