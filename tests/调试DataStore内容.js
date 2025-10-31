/**
 * 调试 DataStore 内容 - 查看内存中到底有什么数据
 */

const http = require('http');

console.log('==================================================');
console.log('调试 DataStore 内容');
console.log('==================================================\n');

// 通过添加一个临时 API 来查看 DataStore 内容
// 或者我们可以通过 IM WebSocket 连接来推断

async function checkDataViaIMAPI() {
  console.log('通过 IM API 检查数据（这些来自数据库）:\n');

  const accountId = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';

  try {
    // 1. 会话
    const convResp = await fetch(`http://localhost:3000/api/im/conversations?account_id=${accountId}&count=50`);
    const convData = await convResp.json();
    console.log('✅ 数据库中的会话数:', convData.data.conversations?.length || 0);
    if (convData.data.conversations?.length > 0) {
      console.log('   会话示例:', convData.data.conversations.slice(0, 2).map(c => ({
        id: c.conversation_id,
        user: c.participant?.user_name,
        unread: c.unread_count
      })));
    }

    // 2. 作品
    const workResp = await fetch(`http://localhost:3000/api/im/contents?account_id=${accountId}&count=50`);
    const workData = await workResp.json();
    console.log('\n✅ 数据库中的作品数:', workData.data.contents?.length || 0);
    if (workData.data.contents?.length > 0) {
      console.log('   作品示例:', workData.data.contents.slice(0, 2).map(c => ({
        id: c.work_id,
        title: c.title,
        comments: c.comment_count
      })));
    }

    // 3. 评论
    const commResp = await fetch(`http://localhost:3000/api/im/discussions?account_id=${accountId}&count=50`);
    const commData = await commResp.json();
    console.log('\n✅ 数据库中的评论数:', commData.data.discussions?.length || 0);

    // 4. 私信
    const msgResp = await fetch(`http://localhost:3000/api/im/messages?account_id=${accountId}&count=50`);
    const msgData = await msgResp.json();
    console.log('✅ 数据库中的私信数:', msgData.data.messages?.length || 0);

  } catch (error) {
    console.error('检查失败:', error.message);
  }
}

async function main() {
  await checkDataViaIMAPI();

  console.log('\n==================================================');
  console.log('分析:');
  console.log('==================================================');
  console.log('IM API 返回数据 → 说明数据库有完整数据');
  console.log('IM WebSocket 返回空 → 说明 DataStore (内存) 缺少数据');
  console.log('\n原因:');
  console.log('Worker 的数据同步(WORKER_DATA_SYNC)没有推送:');
  console.log('  - contents (作品列表)');
  console.log('  - conversations (会话列表)');
  console.log('\n到 Master 的 DataStore');
  console.log('\n解决方案:');
  console.log('1. 确认 Worker 的 DouyinDataManager 是否创建');
  console.log('2. 确认数据同步定时器是否运行');
  console.log('3. 确认 syncToMaster() 方法是否包含完整数据');
  console.log('==================================================\n');
}

main();
