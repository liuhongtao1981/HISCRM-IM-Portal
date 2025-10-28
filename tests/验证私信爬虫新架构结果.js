/**
 * 验证私信爬虫新架构结果
 *
 * 检查项：
 * 1. 数据是否正确插入数据库
 * 2. DataManager 统计是否正确
 * 3. 新旧架构数据一致性
 * 4. 自动同步是否工作
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../packages/master/data/master.db');
const LOG_PATH = path.join(__dirname, '../packages/worker/logs/crawl-direct-messages-v2.log');

async function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.all(sql, params, (err, rows) => {
      db.close();
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function parseLogFile() {
  if (!fs.existsSync(LOG_PATH)) {
    return {
      apiStats: {},
      dmStats: {},
      found: false
    };
  }

  const content = fs.readFileSync(LOG_PATH, 'utf-8');
  const lines = content.split('\n');

  const result = {
    apiStats: {
      conversations: 0,
      messages: 0,
    },
    dmStats: {},
    crawlComplete: false,
    errors: [],
  };

  for (const line of lines) {
    // 查找 API 数据收集日志
    if (line.includes('[API] 会话列表 -> DataManager')) {
      const match = line.match(/(\d+)\s*个会话/);
      if (match) result.apiStats.conversations += parseInt(match[1]);
    }

    if (line.includes('[API] 历史消息 -> DataManager') || line.includes('[API] 初始化消息 -> DataManager')) {
      const match = line.match(/(\d+)\s*条/);
      if (match) result.apiStats.messages += parseInt(match[1]);
    }

    // 查找 DataManager 统计
    if (line.includes('[DataManager] 统计')) {
      const match = line.match(/\{.*\}/);
      if (match) {
        try {
          result.dmStats = JSON.parse(match[0]);
        } catch (e) {
          // ignore
        }
      }
    }

    // 查找完成标记
    if (line.includes('✅ Crawl completed')) {
      result.crawlComplete = true;
    }

    // 查找错误
    if (line.includes('ERROR') || line.includes('❌')) {
      result.errors.push(line);
    }
  }

  result.found = true;
  return result;
}

async function main() {
  console.log('========================================');
  console.log('私信爬虫新架构结果验证');
  console.log('========================================\n');

  try {
    // 1. 解析日志文件
    console.log('1. 解析 Worker 日志...');
    const logData = parseLogFile();

    if (!logData.found) {
      console.log(`❌ 未找到日志文件: ${LOG_PATH}`);
      console.log('   请确保已运行爬虫任务');
      return;
    }

    if (!logData.crawlComplete) {
      console.log('⚠️  爬虫任务未完成或日志未更新');
      console.log('   请等待任务完成后重新运行此脚本\n');
    }

    console.log('日志分析结果:');
    console.log(`   API 收集会话数: ${logData.apiStats.conversations}`);
    console.log(`   API 收集消息数: ${logData.apiStats.messages}`);

    if (Object.keys(logData.dmStats).length > 0) {
      console.log(`   DataManager 统计:`, JSON.stringify(logData.dmStats, null, 2));
    } else {
      console.log(`   ⚠️  未找到 DataManager 统计信息`);
    }

    if (logData.errors.length > 0) {
      console.log(`\n   ⚠️  发现 ${logData.errors.length} 个错误:`);
      logData.errors.slice(0, 3).forEach(err => {
        console.log(`   - ${err.substring(0, 100)}...`);
      });
    }
    console.log('');

    // 2. 查询数据库
    console.log('2. 查询数据库数据...');

    const accounts = await runQuery(`
      SELECT id, platform_user_name
      FROM accounts
      WHERE platform = 'douyin' AND status = 'active'
      LIMIT 1
    `);

    if (accounts.length === 0) {
      console.log('❌ 未找到测试账户');
      return;
    }

    const account = accounts[0];

    // 查询会话
    const conversations = await runQuery(`
      SELECT COUNT(*) as count,
             MIN(created_at) as oldest,
             MAX(updated_at) as latest
      FROM conversations
      WHERE account_id = ?
    `, [account.id]);

    const convStats = conversations[0];
    console.log(`   数据库会话数: ${convStats.count}`);
    if (convStats.count > 0) {
      console.log(`   最早创建时间: ${new Date(convStats.oldest * 1000).toLocaleString()}`);
      console.log(`   最近更新时间: ${new Date(convStats.latest * 1000).toLocaleString()}`);
    }

    // 查询消息
    const messages = await runQuery(`
      SELECT COUNT(*) as count,
             COUNT(DISTINCT conversation_id) as unique_conversations
      FROM direct_messages
      WHERE account_id = ?
    `, [account.id]);

    const msgStats = messages[0];
    console.log(`   数据库消息数: ${msgStats.count}`);
    console.log(`   涉及会话数: ${msgStats.unique_conversations}\n`);

    // 3. 数据一致性检查
    console.log('3. 数据一致性检查...');

    let checks = {
      conversationMatch: false,
      messageMatch: false,
      dataManagerWorking: false,
    };

    // 检查会话数一致性
    if (logData.apiStats.conversations > 0) {
      const diff = Math.abs(convStats.count - logData.apiStats.conversations);
      checks.conversationMatch = diff === 0;
      console.log(`   会话数一致性: ${checks.conversationMatch ? '✅' : '⚠️'} (API: ${logData.apiStats.conversations}, DB: ${convStats.count})`);
      if (!checks.conversationMatch) {
        console.log(`     差异: ${diff} 个会话`);
      }
    } else {
      console.log(`   会话数一致性: ⚠️  API 未收集到会话数据`);
    }

    // 检查消息数（可能不完全匹配，因为有 DOM 提取）
    if (logData.apiStats.messages > 0) {
      console.log(`   消息数对比: API: ${logData.apiStats.messages}, DB: ${msgStats.count}`);
      if (msgStats.count >= logData.apiStats.messages) {
        console.log(`     ✅ 数据库包含 API 数据及更多（可能有 DOM 提取）`);
      } else {
        console.log(`     ⚠️  数据库消息数少于 API（可能存在问题）`);
      }
    }

    // 检查 DataManager 是否工作
    checks.dataManagerWorking = Object.keys(logData.dmStats).length > 0;
    console.log(`   DataManager 工作状态: ${checks.dataManagerWorking ? '✅' : '❌'}`);
    if (!checks.dataManagerWorking) {
      console.log(`     ⚠️  未找到 DataManager 统计信息，可能未使用新架构`);
    }

    console.log('');

    // 4. 最近数据示例
    console.log('4. 最近数据示例...');

    const recentConversations = await runQuery(`
      SELECT platform_user_id, platform_user_name,
             datetime(created_at, 'unixepoch', 'localtime') as created,
             datetime(updated_at, 'unixepoch', 'localtime') as updated
      FROM conversations
      WHERE account_id = ?
      ORDER BY updated_at DESC
      LIMIT 5
    `, [account.id]);

    if (recentConversations.length > 0) {
      console.log('   最近会话:');
      recentConversations.forEach((conv, i) => {
        console.log(`   ${i + 1}. ${conv.platform_user_name} (ID: ${conv.platform_user_id})`);
        console.log(`      创建: ${conv.created}, 更新: ${conv.updated}`);
      });
    } else {
      console.log('   ⚠️  没有会话数据');
    }
    console.log('');

    const recentMessages = await runQuery(`
      SELECT platform_message_id, conversation_id, content,
             datetime(created_at, 'unixepoch', 'localtime') as created
      FROM direct_messages
      WHERE account_id = ?
      ORDER BY created_at DESC
      LIMIT 3
    `, [account.id]);

    if (recentMessages.length > 0) {
      console.log('   最近消息:');
      recentMessages.forEach((msg, i) => {
        const content = msg.content ? msg.content.substring(0, 30) : '(无内容)';
        console.log(`   ${i + 1}. ${content}...`);
        console.log(`      会话 ID: ${msg.conversation_id}, 时间: ${msg.created}`);
      });
    } else {
      console.log('   ⚠️  没有消息数据');
    }
    console.log('');

    // 5. 总结
    console.log('========================================');
    console.log('验证总结');
    console.log('========================================\n');

    const allPassed = checks.conversationMatch && checks.dataManagerWorking && convStats.count > 0;

    if (allPassed) {
      console.log('✅ 所有检查通过！新架构工作正常\n');
      console.log('验证项:');
      console.log('  ✅ DataManager 正常工作');
      console.log('  ✅ API 数据自动收集');
      console.log('  ✅ 数据正确入库');
      console.log('  ✅ 数据一致性良好\n');
    } else {
      console.log('⚠️  部分检查未通过\n');
      if (!checks.dataManagerWorking) {
        console.log('问题: DataManager 未工作');
        console.log('  可能原因:');
        console.log('  1. PlatformBase.initialize() 未调用');
        console.log('  2. DouyinPlatform.createDataManager() 未实现');
        console.log('  3. crawlDirectMessagesV2() 未传递 dataManager 参数\n');
      }
      if (!checks.conversationMatch) {
        console.log('问题: 会话数不一致');
        console.log('  可能原因:');
        console.log('  1. API 回调未正确调用 dataManager.batchUpsertConversations()');
        console.log('  2. 数据映射错误');
        console.log('  3. 自动同步失败\n');
      }
      if (convStats.count === 0) {
        console.log('问题: 数据库无数据');
        console.log('  可能原因:');
        console.log('  1. 爬虫任务未执行');
        console.log('  2. 账户未登录');
        console.log('  3. 数据推送到 Master 失败\n');
      }
    }

    console.log('日志文件位置:');
    console.log(`  ${LOG_PATH}\n`);

  } catch (error) {
    console.error('❌ 验证失败:', error);
    console.error(error.stack);
  }
}

main();
