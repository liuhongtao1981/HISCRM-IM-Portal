/**
 * 消息管理页面 API 测试脚本
 *
 * 功能:
 * - 测试 /api/v1/comments 端点
 * - 测试 /api/v1/direct-messages 端点
 * - 验证消息排序和过滤
 * - 验证今日消息颜色区分
 *
 * 使用方式:
 * node tests/test-message-management.js
 *
 * 记录到上下文:
 * - 测试端点: /api/v1/comments, /api/v1/direct-messages
 * - 支持的查询参数: account_id, sort, order, created_at_start, created_at_end, limit
 * - 排序默认为倒序（最新优先）
 * - 今日消息由前端根据时间戳判断，显示红色背景
 */

const axios = require('axios');
const dayjs = require('dayjs');

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

async function testCommentsAPI() {
  console.log('\n========== 测试评论 API ==========\n');

  try {
    // 1. 获取全部评论
    console.log('1️⃣ 获取全部评论...');
    const allComments = await api.get('/comments', {
      params: {
        limit: 10,
      },
    });
    console.log(`✅ 成功获取 ${allComments.data.count} 条评论`);
    console.log(`示例数据:`, JSON.stringify(allComments.data.data[0], null, 2));

    // 2. 按倒序排序（最新优先）
    console.log('\n2️⃣ 按时间倒序排序...');
    const sortedComments = await api.get('/comments', {
      params: {
        sort: 'created_at',
        order: 'desc',
        limit: 5,
      },
    });
    console.log(`✅ 成功获取 ${sortedComments.data.count} 条评论`);
    console.log('最新评论时间:', dayjs.unix(sortedComments.data.data[0]?.created_at).format('YYYY-MM-DD HH:mm:ss'));

    // 3. 获取今日评论
    console.log('\n3️⃣ 获取今日评论...');
    const todayStart = dayjs().startOf('day').unix();
    const todayComments = await api.get('/comments', {
      params: {
        created_at_start: todayStart,
        sort: 'created_at',
        order: 'desc',
        limit: 100,
      },
    });
    console.log(`✅ 成功获取 ${todayComments.data.count} 条今日评论`);

    // 4. 按账号筛选
    if (allComments.data.data.length > 0) {
      const accountId = allComments.data.data[0].account_id;
      console.log(`\n4️⃣ 按账号筛选 (${accountId})...`);
      const filtered = await api.get('/comments', {
        params: {
          account_id: accountId,
          limit: 10,
        },
      });
      console.log(`✅ 该账号有 ${filtered.data.count} 条评论`);
    }

  } catch (error) {
    console.error('❌ 评论 API 测试失败:', error.response?.data || error.message);
  }
}

async function testDirectMessagesAPI() {
  console.log('\n========== 测试私信 API ==========\n');

  try {
    // 1. 获取全部私信
    console.log('1️⃣ 获取全部私信...');
    const allMessages = await api.get('/direct-messages', {
      params: {
        limit: 10,
      },
    });
    console.log(`✅ 成功获取 ${allMessages.data.count} 条私信`);
    console.log(`示例数据:`, JSON.stringify(allMessages.data.data[0], null, 2));

    // 2. 按倒序排序（最新优先）
    console.log('\n2️⃣ 按时间倒序排序...');
    const sortedMessages = await api.get('/direct-messages', {
      params: {
        sort: 'created_at',
        order: 'desc',
        limit: 5,
      },
    });
    console.log(`✅ 成功获取 ${sortedMessages.data.count} 条私信`);
    console.log('最新私信时间:', dayjs.unix(sortedMessages.data.data[0]?.created_at).format('YYYY-MM-DD HH:mm:ss'));

    // 3. 获取今日私信
    console.log('\n3️⃣ 获取今日私信...');
    const todayStart = dayjs().startOf('day').unix();
    const todayMessages = await api.get('/direct-messages', {
      params: {
        created_at_start: todayStart,
        sort: 'created_at',
        order: 'desc',
        limit: 100,
      },
    });
    console.log(`✅ 成功获取 ${todayMessages.data.count} 条今日私信`);

    // 4. 按方向筛选（入站）
    console.log('\n4️⃣ 按方向筛选 (入站)...');
    const inbound = await api.get('/direct-messages', {
      params: {
        direction: 'inbound',
        limit: 10,
      },
    });
    console.log(`✅ 入站私信: ${inbound.data.count} 条`);

    // 5. 按方向筛选（出站）
    console.log('\n5️⃣ 按方向筛选 (出站)...');
    const outbound = await api.get('/direct-messages', {
      params: {
        direction: 'outbound',
        limit: 10,
      },
    });
    console.log(`✅ 出站私信: ${outbound.data.count} 条`);

    // 6. 按账号筛选
    if (allMessages.data.data.length > 0) {
      const accountId = allMessages.data.data[0].account_id;
      console.log(`\n6️⃣ 按账号筛选 (${accountId})...`);
      const filtered = await api.get('/direct-messages', {
        params: {
          account_id: accountId,
          limit: 10,
        },
      });
      console.log(`✅ 该账号有 ${filtered.data.count} 条私信`);
    }

  } catch (error) {
    console.error('❌ 私信 API 测试失败:', error.response?.data || error.message);
  }
}

async function runTests() {
  console.log('🧪 开始测试消息管理 API\n');
  console.log(`API 基础 URL: ${API_URL}\n`);

  await testCommentsAPI();
  await testDirectMessagesAPI();

  console.log('\n✅ 测试完成！\n');
  console.log('📋 API 文档:');
  console.log('  评论: GET /api/v1/comments');
  console.log('  私信: GET /api/v1/direct-messages');
  console.log('\n🎨 前端实现要点:');
  console.log('  - 今日消息: 时间戳 >= dayjs().startOf("day").unix()');
  console.log('  - 今日消息颜色: 背景红色 (#fff2f0), 文字红色 (#ff4d4f), 加粗');
  console.log('  - 默认刷新间隔: 30秒（可配置 10/30/60秒或不自动刷新）');
  console.log('  - 时间显示格式: MM-DD HH:mm:ss，今日消息前加【今日】标签');
}

runTests().catch(console.error);
