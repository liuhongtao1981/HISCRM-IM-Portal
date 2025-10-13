/**
 * Messages API Contract 测试
 * T077: 测试 GET /api/v1/messages 端点
 */

const request = require('supertest');
const express = require('express');
const { initDatabase } = require('../../src/database/init');
const createMessagesRouter = require('../../src/api/routes/messages');
const { Comment } = require('@hiscrm-im/shared/models/Comment');
const { DirectMessage } = require('@hiscrm-im/shared/models/DirectMessage');
const { Account } = require('@hiscrm-im/shared/models/Account');
const CommentsDAO = require('../../src/database/comments-dao');
const DirectMessagesDAO = require('../../src/database/messages-dao');
const AccountsDAO = require('../../src/database/accounts-dao');

describe('T077: Messages API Contract', () => {
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
    app.use('/api/v1/messages', createMessagesRouter(db));
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

  describe('GET /api/v1/messages', () => {
    test('应该返回空列表当没有消息时', async () => {
      const response = await request(app).get('/api/v1/messages').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toEqual([]);
      expect(response.body.data.total).toBe(0);
      expect(response.body.data.page).toBe(1);
    });

    test('应该返回所有消息（评论和私信）', async () => {
      // 创建测试数据
      const comment = new Comment({
        account_id: 'acc-001',
        content: '测试评论',
        author_name: '张三',
      });
      commentsDAO.create(comment);

      const dm = new DirectMessage({
        account_id: 'acc-001',
        content: '测试私信',
        sender_name: '李四',
        direction: 'inbound',
      });
      messagesDAO.create(dm);

      const response = await request(app).get('/api/v1/messages').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
    });

    test('应该支持按账户ID筛选', async () => {
      // 创建多个账户的消息
      const comment1 = new Comment({
        account_id: 'acc-001',
        content: '账户1评论',
        author_name: '张三',
      });
      commentsDAO.create(comment1);

      const comment2 = new Comment({
        account_id: 'acc-002',
        content: '账户2评论',
        author_name: '李四',
      });
      commentsDAO.create(comment2);

      const response = await request(app)
        .get('/api/v1/messages')
        .query({ account_id: 'acc-001' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toHaveLength(1);
      expect(response.body.data.messages[0].account_id).toBe('acc-001');
    });

    test('应该支持按消息类型筛选', async () => {
      // 创建评论和私信
      const comment = new Comment({
        account_id: 'acc-001',
        content: '测试评论',
        author_name: '张三',
      });
      commentsDAO.create(comment);

      const dm = new DirectMessage({
        account_id: 'acc-001',
        content: '测试私信',
        sender_name: '李四',
        direction: 'inbound',
      });
      messagesDAO.create(dm);

      // 只查询评论
      const response = await request(app)
        .get('/api/v1/messages')
        .query({ type: 'comment' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toHaveLength(1);
      expect(response.body.data.messages[0].type).toBe('comment');
    });

    test('应该支持按时间范围筛选', async () => {
      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - 86400;

      // 创建旧消息
      const oldComment = new Comment({
        account_id: 'acc-001',
        content: '旧评论',
        author_name: '张三',
        detected_at: oneDayAgo,
      });
      commentsDAO.create(oldComment);

      // 创建新消息
      const newComment = new Comment({
        account_id: 'acc-001',
        content: '新评论',
        author_name: '李四',
        detected_at: now,
      });
      commentsDAO.create(newComment);

      // 只查询最近的消息
      const response = await request(app)
        .get('/api/v1/messages')
        .query({ start_time: now - 3600 }) // 1小时内
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toHaveLength(1);
      expect(response.body.data.messages[0].content).toBe('新评论');
    });

    test('应该支持分页', async () => {
      // 创建多条消息
      for (let i = 0; i < 25; i++) {
        const comment = new Comment({
          account_id: 'acc-001',
          content: `评论${i}`,
          author_name: '测试',
        });
        commentsDAO.create(comment);
      }

      // 获取第一页
      const page1 = await request(app)
        .get('/api/v1/messages')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(page1.body.data.messages).toHaveLength(10);
      expect(page1.body.data.total).toBe(25);
      expect(page1.body.data.page).toBe(1);
      expect(page1.body.data.total_pages).toBe(3);

      // 获取第二页
      const page2 = await request(app)
        .get('/api/v1/messages')
        .query({ page: 2, limit: 10 })
        .expect(200);

      expect(page2.body.data.messages).toHaveLength(10);
      expect(page2.body.data.page).toBe(2);

      // 确保两页内容不同
      expect(page1.body.data.messages[0].id).not.toBe(page2.body.data.messages[0].id);
    });

    test('应该按时间倒序返回消息', async () => {
      const now = Math.floor(Date.now() / 1000);

      // 创建多条消息
      for (let i = 0; i < 3; i++) {
        const comment = new Comment({
          account_id: 'acc-001',
          content: `评论${i}`,
          author_name: '测试',
          detected_at: now - (3 - i) * 60, // 时间递增
        });
        commentsDAO.create(comment);
      }

      const response = await request(app).get('/api/v1/messages').expect(200);

      const messages = response.body.data.messages;
      expect(messages).toHaveLength(3);
      // 最新的在前
      expect(messages[0].content).toBe('评论2');
      expect(messages[2].content).toBe('评论0');
    });

    test('应该支持按已读状态筛选', async () => {
      // 创建已读和未读消息
      const unreadComment = new Comment({
        account_id: 'acc-001',
        content: '未读评论',
        author_name: '张三',
        is_read: false,
      });
      commentsDAO.create(unreadComment);

      const readComment = new Comment({
        account_id: 'acc-001',
        content: '已读评论',
        author_name: '李四',
        is_read: true,
      });
      commentsDAO.create(readComment);

      // 只查询未读
      const response = await request(app)
        .get('/api/v1/messages')
        .query({ is_read: false })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.messages).toHaveLength(1);
      expect(response.body.data.messages[0].is_read).toBe(false);
    });
  });

  describe('POST /api/v1/messages/:id/read', () => {
    test('应该成功标记消息为已读', async () => {
      // 创建未读消息
      const comment = new Comment({
        account_id: 'acc-001',
        content: '测试评论',
        author_name: '张三',
        is_read: false,
      });
      commentsDAO.create(comment);

      const response = await request(app)
        .post(`/api/v1/messages/${comment.id}/read`)
        .send({ type: 'comment' })
        .expect(200);

      expect(response.body.success).toBe(true);

      // 验证已标记为已读
      const updated = commentsDAO.findById(comment.id);
      expect(updated.is_read).toBe(true);
    });

    test('应该返回404当消息不存在', async () => {
      const response = await request(app)
        .post('/api/v1/messages/non-existent-id/read')
        .send({ type: 'comment' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('应该支持标记私信为已读', async () => {
      const dm = new DirectMessage({
        account_id: 'acc-001',
        content: '测试私信',
        sender_name: '李四',
        direction: 'inbound',
        is_read: false,
      });
      messagesDAO.create(dm);

      const response = await request(app)
        .post(`/api/v1/messages/${dm.id}/read`)
        .send({ type: 'direct_message' })
        .expect(200);

      expect(response.body.success).toBe(true);

      // 验证已标记为已读
      const updated = messagesDAO.findById(dm.id);
      expect(updated.is_read).toBe(true);
    });
  });
});
