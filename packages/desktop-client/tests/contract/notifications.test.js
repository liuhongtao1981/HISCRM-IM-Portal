/**
 * Notification Contract 测试
 * T062: 测试 master:notification:push 消息格式
 */

const { createMessage, MASTER_NOTIFICATION_PUSH } = require('@hiscrm-im/shared/protocol/messages');

describe('T062: Notification Contract', () => {
  describe('master:notification:push 消息格式', () => {
    test('应该包含必需的字段', () => {
      const message = createMessage(MASTER_NOTIFICATION_PUSH, {
        notification_id: 'notif-123',
        type: 'comment',
        account_id: 'acc-456',
        title: '新评论',
        content: '有用户评论了你的视频',
        data: {
          comment_id: 'comment-789',
          author_name: '张三',
          content: '这个视频太棒了！',
        },
        created_at: Math.floor(Date.now() / 1000),
      });

      expect(message).toHaveProperty('type', MASTER_NOTIFICATION_PUSH);
      expect(message).toHaveProperty('version', 'v1');
      expect(message).toHaveProperty('payload');
      expect(message).toHaveProperty('timestamp');

      // Payload 验证
      expect(message.payload).toHaveProperty('notification_id');
      expect(message.payload).toHaveProperty('type');
      expect(message.payload).toHaveProperty('title');
      expect(message.payload).toHaveProperty('content');
      expect(message.payload).toHaveProperty('data');
    });

    test('应该支持评论通知', () => {
      const message = createMessage(MASTER_NOTIFICATION_PUSH, {
        notification_id: 'notif-001',
        type: 'comment',
        account_id: 'acc-001',
        title: '新评论',
        content: '张三: 这个视频太棒了！',
        data: {
          comment_id: 'comment-001',
          author_name: '张三',
          post_title: '我的视频',
        },
        created_at: Math.floor(Date.now() / 1000),
      });

      expect(message.payload.type).toBe('comment');
      expect(message.payload.data).toHaveProperty('comment_id');
    });

    test('应该支持私信通知', () => {
      const message = createMessage(MASTER_NOTIFICATION_PUSH, {
        notification_id: 'notif-002',
        type: 'direct_message',
        account_id: 'acc-001',
        title: '新私信',
        content: '李四: 你好，请问有合作意向吗？',
        data: {
          message_id: 'dm-001',
          sender_name: '李四',
        },
        created_at: Math.floor(Date.now() / 1000),
      });

      expect(message.payload.type).toBe('direct_message');
      expect(message.payload.data).toHaveProperty('message_id');
    });

    test('应该包含时间戳', () => {
      const now = Math.floor(Date.now() / 1000);

      const message = createMessage(MASTER_NOTIFICATION_PUSH, {
        notification_id: 'notif-003',
        type: 'comment',
        account_id: 'acc-001',
        title: '测试',
        content: '测试内容',
        data: {},
        created_at: now,
      });

      expect(message.payload.created_at).toBe(now);
      expect(typeof message.payload.created_at).toBe('number');
    });
  });

  describe('客户端接收通知', () => {
    test('应该能解析通知消息', () => {
      const message = createMessage(MASTER_NOTIFICATION_PUSH, {
        notification_id: 'notif-123',
        type: 'comment',
        account_id: 'acc-456',
        title: '新评论',
        content: '测试内容',
        data: {
          comment_id: 'comment-789',
        },
        created_at: Math.floor(Date.now() / 1000),
      });

      // 模拟客户端接收
      expect(message.type).toBe(MASTER_NOTIFICATION_PUSH);
      expect(message.payload.notification_id).toBeDefined();
      expect(message.payload.title).toBeDefined();
      expect(message.payload.content).toBeDefined();
    });
  });
});
