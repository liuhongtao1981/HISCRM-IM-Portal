/**
 * 消息历史分页集成测试
 * T079: 测试大量消息的分页查询性能和正确性
 */

const { initDatabase } = require('@hiscrm-im/master/src/database/init');
const { Comment } = require('@hiscrm-im/shared/models/Comment');
const { DirectMessage } = require('@hiscrm-im/shared/models/DirectMessage');
const { Account } = require('@hiscrm-im/shared/models/Account');
const CommentsDAO = require('@hiscrm-im/master/src/database/comments-dao');
const DirectMessagesDAO = require('@hiscrm-im/master/src/database/messages-dao');
const AccountsDAO = require('@hiscrm-im/master/src/database/accounts-dao');

describe('T079: History Pagination Integration', () => {
  let db;
  let commentsDAO;
  let messagesDAO;
  let accountsDAO;

  beforeAll(() => {
    db = initDatabase(':memory:');
    commentsDAO = new CommentsDAO(db);
    messagesDAO = new DirectMessagesDAO(db);
    accountsDAO = new AccountsDAO(db);
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
    const testAccount = new Account({
      id: 'acc-001',
      platform: 'douyin',
      account_name: 'Test Account',
      account_id: 'test-001',
      credentials: { username: 'test', password: 'test123' },
    });
    accountsDAO.create(testAccount);
  });

  describe('大量数据分页', () => {
    test('应该正确分页查询100条评论', () => {
      // 创建100条评论
      for (let i = 0; i < 100; i++) {
        const comment = new Comment({
          account_id: 'acc-001',
          content: `评论${i}`,
          author_name: '测试用户',
          detected_at: Math.floor(Date.now() / 1000) - i * 60, // 时间递减
        });
        commentsDAO.create(comment);
      }

      // 查询第一页
      const page1 = commentsDAO.findAll({
        account_id: 'acc-001',
        limit: 20,
        offset: 0,
      });

      expect(page1).toHaveLength(20);
      expect(page1[0].content).toBe('评论0'); // 最新的

      // 查询第二页
      const page2 = commentsDAO.findAll({
        account_id: 'acc-001',
        limit: 20,
        offset: 20,
      });

      expect(page2).toHaveLength(20);
      expect(page2[0].content).toBe('评论20');

      // 确保两页数据不重复
      const page1Ids = page1.map((c) => c.id);
      const page2Ids = page2.map((c) => c.id);
      const intersection = page1Ids.filter((id) => page2Ids.includes(id));
      expect(intersection).toHaveLength(0);
    });

    test('应该正确处理最后一页的部分数据', () => {
      // 创建25条评论
      for (let i = 0; i < 25; i++) {
        const comment = new Comment({
          account_id: 'acc-001',
          content: `评论${i}`,
          author_name: '测试用户',
        });
        commentsDAO.create(comment);
      }

      // 每页20条，查询第二页应该只有5条
      const page2 = commentsDAO.findAll({
        account_id: 'acc-001',
        limit: 20,
        offset: 20,
      });

      expect(page2).toHaveLength(5);
    });

    test('应该正确统计总数用于计算总页数', () => {
      // 创建53条评论
      for (let i = 0; i < 53; i++) {
        const comment = new Comment({
          account_id: 'acc-001',
          content: `评论${i}`,
          author_name: '测试用户',
        });
        commentsDAO.create(comment);
      }

      // 统计总数
      const total = db
        .prepare('SELECT COUNT(*) as count FROM comments WHERE account_id = ?')
        .get('acc-001').count;

      expect(total).toBe(53);

      // 计算总页数（每页20条）
      const pageSize = 20;
      const totalPages = Math.ceil(total / pageSize);
      expect(totalPages).toBe(3);
    });
  });

  describe('混合消息类型分页', () => {
    test('应该正确分页混合的评论和私信', () => {
      const now = Math.floor(Date.now() / 1000);

      // 创建50条评论
      for (let i = 0; i < 50; i++) {
        const comment = new Comment({
          account_id: 'acc-001',
          content: `评论${i}`,
          author_name: '测试用户',
          detected_at: now - i * 60,
        });
        commentsDAO.create(comment);
      }

      // 创建30条私信
      for (let i = 0; i < 30; i++) {
        const dm = new DirectMessage({
          account_id: 'acc-001',
          content: `私信${i}`,
          sender_name: '测试用户',
          direction: 'inbound',
          detected_at: now - (i + 25) * 60, // 交错时间
        });
        messagesDAO.create(dm);
      }

      // 需要合并查询两种类型的消息
      const comments = commentsDAO.findAll({
        account_id: 'acc-001',
        limit: 100,
      });

      const directMessages = messagesDAO.findAll({
        account_id: 'acc-001',
        limit: 100,
      });

      // 合并并排序
      const allMessages = [
        ...comments.map((c) => ({ ...c, type: 'comment' })),
        ...directMessages.map((dm) => ({ ...dm, type: 'direct_message' })),
      ].sort((a, b) => b.detected_at - a.detected_at);

      expect(allMessages).toHaveLength(80);

      // 模拟分页
      const pageSize = 20;
      const page1 = allMessages.slice(0, pageSize);
      const page2 = allMessages.slice(pageSize, pageSize * 2);

      expect(page1).toHaveLength(20);
      expect(page2).toHaveLength(20);

      // 验证时间顺序
      for (let i = 1; i < page1.length; i++) {
        expect(page1[i - 1].detected_at).toBeGreaterThanOrEqual(page1[i].detected_at);
      }
    });
  });

  describe('时间范围分页', () => {
    test('应该正确分页特定时间范围内的消息', () => {
      const now = Math.floor(Date.now() / 1000);
      const today = now - (now % 86400);
      const yesterday = today - 86400;
      const twoDaysAgo = today - 172800;

      // 创建不同日期的消息
      for (let i = 0; i < 20; i++) {
        commentsDAO.create(
          new Comment({
            account_id: 'acc-001',
            content: `今天评论${i}`,
            author_name: '测试',
            detected_at: today + i * 60,
          })
        );
      }

      for (let i = 0; i < 30; i++) {
        commentsDAO.create(
          new Comment({
            account_id: 'acc-001',
            content: `昨天评论${i}`,
            author_name: '测试',
            detected_at: yesterday + i * 60,
          })
        );
      }

      for (let i = 0; i < 10; i++) {
        commentsDAO.create(
          new Comment({
            account_id: 'acc-001',
            content: `前天评论${i}`,
            author_name: '测试',
            detected_at: twoDaysAgo + i * 60,
          })
        );
      }

      // 查询昨天到今天的消息
      const recentComments = db
        .prepare(
          `
        SELECT * FROM comments
        WHERE account_id = ? AND detected_at >= ?
        ORDER BY detected_at DESC
        LIMIT ? OFFSET ?
      `
        )
        .all('acc-001', yesterday, 25, 0);

      expect(recentComments.length).toBe(25);

      // 验证没有前天的数据
      const hasOldData = recentComments.some((c) => c.detected_at < yesterday);
      expect(hasOldData).toBe(false);
    });

    test('应该支持按日期分组的分页', () => {
      const now = Math.floor(Date.now() / 1000);
      const today = now - (now % 86400);

      // 创建7天的数据，每天10条
      for (let day = 0; day < 7; day++) {
        const dayStart = today - day * 86400;
        for (let i = 0; i < 10; i++) {
          commentsDAO.create(
            new Comment({
              account_id: 'acc-001',
              content: `Day${day}-Comment${i}`,
              author_name: '测试',
              detected_at: dayStart + i * 60,
            })
          );
        }
      }

      // 按天统计
      const dailyStats = db
        .prepare(
          `
        SELECT
          DATE(detected_at, 'unixepoch') as date,
          COUNT(*) as count
        FROM comments
        WHERE account_id = ?
        GROUP BY DATE(detected_at, 'unixepoch')
        ORDER BY date DESC
      `
        )
        .all('acc-001');

      expect(dailyStats).toHaveLength(7);
      dailyStats.forEach((stat) => {
        expect(stat.count).toBe(10);
      });
    });
  });

  describe('性能验证', () => {
    test('应该在合理时间内查询1000条消息', () => {
      // 创建1000条评论
      const startCreate = Date.now();
      for (let i = 0; i < 1000; i++) {
        const comment = new Comment({
          account_id: 'acc-001',
          content: `评论${i}`,
          author_name: '测试用户',
        });
        commentsDAO.create(comment);
      }
      const createTime = Date.now() - startCreate;
      console.log(`创建1000条记录耗时: ${createTime}ms`);

      // 分页查询
      const startQuery = Date.now();
      const page = commentsDAO.findAll({
        account_id: 'acc-001',
        limit: 50,
        offset: 0,
      });
      const queryTime = Date.now() - startQuery;

      console.log(`查询50条记录耗时: ${queryTime}ms`);

      expect(page).toHaveLength(50);
      expect(queryTime).toBeLessThan(100); // 应该在100ms内完成
    });

    test('应该支持游标分页（基于时间戳）', () => {
      // 创建100条消息，每条间隔1秒
      const now = Math.floor(Date.now() / 1000);
      const messages = [];
      for (let i = 0; i < 100; i++) {
        const comment = new Comment({
          account_id: 'acc-001',
          content: `评论${i}`,
          author_name: '测试',
          detected_at: now - i * 60, // 时间递减
        });
        commentsDAO.create(comment);
        messages.push(comment);
      }

      // 获取第一批（前20条，最新的）
      const batch1 = commentsDAO.findAll({
        account_id: 'acc-001',
        limit: 20,
      });

      expect(batch1).toHaveLength(20);

      // 使用最后一条的时间戳作为游标，获取下一批
      const lastTimestamp = batch1[batch1.length - 1].detected_at;
      const batch2 = db
        .prepare(
          `
        SELECT * FROM comments
        WHERE account_id = ? AND detected_at < ?
        ORDER BY detected_at DESC
        LIMIT ?
      `
        )
        .all('acc-001', lastTimestamp, 20);

      expect(batch2.length).toBe(20);

      // 确保没有重复
      const batch1Ids = batch1.map((c) => c.id);
      const batch2Ids = batch2.map((c) => c.id);
      const intersection = batch1Ids.filter((id) => batch2Ids.includes(id));
      expect(intersection).toHaveLength(0);
    });
  });
});
