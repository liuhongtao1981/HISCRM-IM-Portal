/**
 * 发送回复评论请求到 Master
 * 验证 Tab3 临时页面是否被正确创建和使用
 */

const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

const API_URL = 'http://localhost:3000/api';
const dbPath = path.join(__dirname, 'packages/master/data/master.db');

async function sendReplyComment() {
  let db = null;
  try {
    // 1. 从数据库获取一条评�?
    console.log('📋 步骤 1: 从数据库获取评论数据');
    db = new Database(dbPath);

    const comment = db.prepare(`SELECT * FROM comments LIMIT 1`).get();

    if (!comment) {
      console.log('�?数据库中没有评论数据');
      return;
    }

    console.log(`�?获取到评论：`);
    console.log(`   - 作�? ${comment.author_name}`);
    console.log(`   - 内容: ${comment.content.substring(0, 50)}...`);
    console.log(`   - ID: ${comment.platform_comment_id.substring(0, 40)}...\n`);

    // 2. 获取账户信息
    console.log('📋 步骤 2: 获取账户信息');
    const account = db.prepare(`SELECT id, account_name FROM accounts LIMIT 1`).get();

    if (!account) {
      console.log('�?数据库中没有账户数据');
      return;
    }

    console.log(`�?账户: ${account.id} (${account.account_name})\n`);

    // 3. 构建回复请求
    console.log('📋 步骤 3: 构建回复请求');
    const replyRequest = {
      request_id: `test-reply-${Date.now()}`,
      account_id: account.id,
      target_type: 'comment',
      target_id: comment.platform_comment_id,
      reply_content: '👍 很棒的内容！我喜欢你的视频！'
    };

    console.log(`�?回复请求已构建：`);
    console.log(`   - Request ID: ${replyRequest.request_id}`);
    console.log(`   - 目标: ${replyRequest.target_type}`);
    console.log(`   - 内容: ${replyRequest.reply_content}\n`);

    // 4. 发送回复请求到 Master
    console.log('📋 步骤 4: 发送回复请求到 Master');
    console.log(`   🔗 POST ${API_URL}/v1/replies\n`);

    const response = await axios.post(`${API_URL}/v1/replies`, replyRequest);

    console.log('�?回复请求已发送\n');
    console.log('📊 响应�?);
    console.log(JSON.stringify(response.data, null, 2));

    // 5. 等待 Worker 处理
    console.log('\n📋 步骤 5: 等待 Worker 处理回复...');
    console.log(`   �?预计耗时: 10-20 秒`);
    console.log(`   🔍 查看 Worker 日志检查是否创建了 Tab3：\n`);

    console.log('📝 预期日志输出�?);
    console.log(`   �?[douyin-platform] 为评论回复任务获取临时标签页`);
    console.log(`   �?[browser-manager] 创建临时页面 (Tab 3+)`);
    console.log(`   �?[douyin-platform] 浏览器标签页状�? Tab1 �?Tab2 �?Tab3 ✅`);
    console.log(`   �?[douyin-platform] Comment reply task completed - closing temporary page`);
    console.log(`   �?[browser-manager] 临时页面已关闭\n`);

    console.log('🌐 浏览器标签页预期状态：');
    console.log(`   ├─ Tab 1 (Spider1): 继续运行 ✅`);
    console.log(`   ├─ Tab 2 (Spider2): 继续运行 ✅`);
    console.log(`   └─ Tab 3 (Temporary): 回复完成后已关闭 ✅\n`);

    // 6. 显示监控说明
    console.log('💡 如何验证�?);
    console.log('   1. 查看 Worker 日志找到这条回复请求');
    console.log('   2. 确认是否创建了第三个临时标签�?);
    console.log('   3. 检查是否正确关闭了临时标签�?);
    console.log('   4. 验证 Spider1 �?Spider2 继续正常运行\n');

    console.log('�?回复请求已成功发送！请查�?Worker 日志检查效果�?);

  } catch (error) {
    console.error('�?错误:', error.message);
    if (error.response?.data) {
      console.error('响应:', error.response.data);
    }
  } finally {
    if (db) db.close();
  }
}

// 运行
sendReplyComment();
