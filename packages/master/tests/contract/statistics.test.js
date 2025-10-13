/**
 * Statistics API Contract 测试
 * T078: 测试 GET /api/v1/statistics 端点
 */

const request = require('supertest');
const express = require('express');
const { initDatabase } = require('../../src/database/init');
const createStatisticsRouter = require('../../src/api/routes/statistics');
const { Comment } = require('@hiscrm-im/shared/models/Comment');
const { DirectMessage } = require('@hiscrm-im/shared/models/DirectMessage');
const { Account } = require('@hiscrm-im/shared/models/Account');
const CommentsDAO = require('../../src/database/comments-dao');
const DirectMessagesDAO = require('../../src/database/messages-dao');
const AccountsDAO = require('../../src/database/accounts-dao');

describe('T078: Statistics API Contract', () => {
  let app;
  let db;
  let commentsDAO;
  let messagesDAO;
  let accountsDAO;

  beforeAll(() => {
    // 使用内存数据库
    db = initDatabase(':memory:');
    commentsDAO = new CommentsDAO(db);
    messagesDAO = new DirectMessagesDAO(db);
    accountsDAO = new AccountsDAO(db);

    // 创建 Express 应用
    app = express();
    app.use(express.json());
    app.use('/api/v1/statistics', createStatisticsRouter(db));
  });

  afterAll(() => {
    if (db) db.close();
  });

  beforeEach(() => {
    // 清空测试数据
    db.prepare('DELETE FROM comments').run();
    db.prepare('DELETE FROM direct_messages').run();
    db.prepare('DELETE FROM accounts').run();

    // 创建测试账户
    const testAccount1 = new Account({
      id: 'acc-001',
      platform: 'douyin',
      account_name: 'Test Account 1',
      account_id: 'test-001',
      credentials: { username: 'test1', password: 'test123' },
    });
    accountsDAO.create(testAccount1);

    const testAccount2 = new Account({
      id: 'acc-002',
      platform: 'douyin',
      account_name: 'Test Account 2',
      account_id: 'test-002',
      credentials: { username: 'test2', password: 'test123' },
    });
    accountsDAO.create(testAccount2);
  });

  describe('GET /api/v1/statistics', () => {
    test('应该返回零统计当没有数据时', async () => {
      const response = await request(app).get('/api/v1/statistics').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total_comments).toBe(0);
      expect(response.body.data.total_direct_messages).toBe(0);
      expect(response.body.data.total_messages).toBe(0);
      expect(response.body.data.accounts).toEqual([]);
    });

    test('应该返回总体统计信息', async () => {
      // 创建测试数据
      for (let i = 0; i < 3; i++) {
        const comment = new Comment({
          account_id: 'acc-001',
          content: `评论${i}`,
          author_name: '测试',
        });
        commentsDAO.create(comment);
      }

      for (let i = 0; i < 2; i++) {
        const dm = new DirectMessage({
          account_id: 'acc-001',
          content: `私信${i}`,
          sender_name: '测试',
          direction: 'inbound',
        });
        messagesDAO.create(dm);
      }

      const response = await request(app).get('/api/v1/statistics').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total_comments).toBe(3);
      expect(response.body.data.total_direct_messages).toBe(2);
      expect(response.body.data.total_messages).toBe(5);
    });

    test('应该按账户分组统计', async () => {
      // 账户1的消息
      const comment1 = new Comment({
        account_id: 'acc-001',
        content: '账户1评论',
        author_name: '测试',
      });
      commentsDAO.create(comment1);

      const dm1 = new DirectMessage({
        account_id: 'acc-001',
        content: '账户1私信',
        sender_name: '测试',
        direction: 'inbound',
      });
      messagesDAO.create(dm1);

      // 账户2的消息
      const comment2 = new Comment({
        account_id: 'acc-002',
        content: '账户2评论',
        author_name: '测试',
      });
      commentsDAO.create(comment2);

      const response = await request(app).get('/api/v1/statistics').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accounts).toHaveLength(2);

      const acc001Stats = response.body.data.accounts.find((a) => a.account_id === 'acc-001');
      expect(acc001Stats.comment_count).toBe(1);
      expect(acc001Stats.direct_message_count).toBe(1);

      const acc002Stats = response.body.data.accounts.find((a) => a.account_id === 'acc-002');
      expect(acc002Stats.comment_count).toBe(1);
      expect(acc002Stats.direct_message_count).toBe(0);
    });

    test('应该支持按时间范围统计', async () => {
      const now = Math.floor(Date.now() / 1000);
      const twoDaysAgo = now - 172800; // 2天前
      const oneDayAgo = now - 86400; // 1天前

      // 创建不同时间的消息
      const oldComment = new Comment({
        account_id: 'acc-001',
        content: '旧评论',
        author_name: '测试',
        detected_at: twoDaysAgo,
      });
      commentsDAO.create(oldComment);

      const recentComment = new Comment({
        account_id: 'acc-001',
        content: '最近评论',
        author_name: '测试',
        detected_at: oneDayAgo,
      });
      commentsDAO.create(recentComment);

      // 统计最近1天的数据
      const response = await request(app)
        .get('/api/v1/statistics')
        .query({ start_time: oneDayAgo - 3600 }) // 1天内
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total_comments).toBe(1);
    });

    test('应该返回每日统计趋势', async () => {
      const now = Math.floor(Date.now() / 1000);
      const today = now - (now % 86400);
      const yesterday = today - 86400;

      // 今天的消息
      const todayComment = new Comment({
        account_id: 'acc-001',
        content: '今天的评论',
        author_name: '测试',
        detected_at: today + 3600,
      });
      commentsDAO.create(todayComment);

      // 昨天的消息
      const yesterdayComment = new Comment({
        account_id: 'acc-001',
        content: '昨天的评论',
        author_name: '测试',
        detected_at: yesterday + 3600,
      });
      commentsDAO.create(yesterdayComment);

      const response = await request(app)
        .get('/api/v1/statistics')
        .query({ group_by: 'day', days: 7 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.daily_stats).toBeDefined();
      expect(Array.isArray(response.body.data.daily_stats)).toBe(true);
    });

    test('应该支持按账户筛选统计', async () => {
      // 创建多个账户的消息
      const comment1 = new Comment({
        account_id: 'acc-001',
        content: '账户1评论',
        author_name: '测试',
      });
      commentsDAO.create(comment1);

      const comment2 = new Comment({
        account_id: 'acc-002',
        content: '账户2评论',
        author_name: '测试',
      });
      commentsDAO.create(comment2);

      // 只统计账户1
      const response = await request(app)
        .get('/api/v1/statistics')
        .query({ account_id: 'acc-001' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total_comments).toBe(1);
      expect(response.body.data.accounts).toHaveLength(1);
      expect(response.body.data.accounts[0].account_id).toBe('acc-001');
    });

    test('应该计算未读消息数量', async () => {
      // 创建已读和未读消息
      const unreadComment = new Comment({
        account_id: 'acc-001',
        content: '未读评论',
        author_name: '测试',
        is_read: false,
      });
      commentsDAO.create(unreadComment);

      const readComment = new Comment({
        account_id: 'acc-001',
        content: '已读评论',
        author_name: '测试',
        is_read: true,
      });
      commentsDAO.create(readComment);

      const response = await request(app).get('/api/v1/statistics').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.unread_count).toBe(1);
    });

    test('应该返回活跃时段统计', async () => {
      const now = Math.floor(Date.now() / 1000);

      // 创建不同时间段的消息
      for (let hour = 0; hour < 24; hour += 3) {
        const timestamp = now - (now % 86400) + hour * 3600;
        const comment = new Comment({
          account_id: 'acc-001',
          content: `${hour}时评论`,
          author_name: '测试',
          detected_at: timestamp,
        });
        commentsDAO.create(comment);
      }

      const response = await request(app)
        .get('/api/v1/statistics')
        .query({ include_hourly: true })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.hourly_stats).toBeDefined();
    });
  });

  describe('GET /api/v1/statistics/summary', () => {
    test('应该返回简要统计信息', async () => {
      // 创建测试数据
      const comment = new Comment({
        account_id: 'acc-001',
        content: '测试评论',
        author_name: '测试',
      });
      commentsDAO.create(comment);

      const response = await request(app).get('/api/v1/statistics/summary').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total_messages');
      expect(response.body.data).toHaveProperty('unread_count');
      expect(response.body.data).toHaveProperty('today_count');
    });
  });
});
