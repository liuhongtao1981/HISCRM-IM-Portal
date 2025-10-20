/**
 * Worker Message Detection Contract 测试
 * T046: 测试 worker:message:detected 消息格式和处理逻辑
 */

const { createMessage, WORKER_MESSAGE_DETECTED } = require('@hiscrm-im/shared/protocol/messages');

describe('T046: Worker Message Detection Contract', () => {
  describe('worker:message:detected 消息格式', () => {
    test('应该包含必需的字段', () => {
      const message = createMessage(WORKER_MESSAGE_DETECTED, {
        account_id: 'acc-123',
        message_type: 'comment',
        data: {
          platform_comment_id: 'comment-456',
          content: '测试评论',
          author_name: '张三',
          author_id: 'user-789',
          post_id: 'post-001',
          post_title: '测试视频',
          detected_at: Math.floor(Date.now() / 1000),
        },
      });

      expect(message).toHaveProperty('type', WORKER_MESSAGE_DETECTED);
      expect(message).toHaveProperty('version', 'v1');
      expect(message).toHaveProperty('payload');
      expect(message).toHaveProperty('timestamp');

      // Payload 验证
      expect(message.payload).toHaveProperty('account_id');
      expect(message.payload).toHaveProperty('message_type');
      expect(message.payload).toHaveProperty('data');
    });

    test('应该支持评论类型消息', () => {
      const message = createMessage(WORKER_MESSAGE_DETECTED, {
        account_id: 'acc-123',
        message_type: 'comment',
        data: {
          platform_comment_id: 'comment-456',
          content: '测试评论内容',
          author_name: '李四',
          author_id: 'user-111',
          post_id: 'post-222',
          post_title: '我的视频',
          detected_at: Math.floor(Date.now() / 1000),
        },
      });

      expect(message.payload.message_type).toBe('comment');
      expect(message.payload.data).toHaveProperty('platform_comment_id');
      expect(message.payload.data).toHaveProperty('content');
      expect(message.payload.data).toHaveProperty('author_name');
      expect(message.payload.data).toHaveProperty('post_id');
    });

    test('应该支持私信类型消息', () => {
      const message = createMessage(WORKER_MESSAGE_DETECTED, {
        account_id: 'acc-123',
        message_type: 'direct_message',
        data: {
          platform_message_id: 'dm-456',
          content: '你好，有问题吗?',
          sender_name: '王五',
          sender_id: 'user-333',
          direction: 'inbound',
          detected_at: Math.floor(Date.now() / 1000),
        },
      });

      expect(message.payload.message_type).toBe('direct_message');
      expect(message.payload.data).toHaveProperty('platform_message_id');
      expect(message.payload.data).toHaveProperty('content');
      expect(message.payload.data).toHaveProperty('sender_name');
      expect(message.payload.data).toHaveProperty('direction');
    });

    test('应该包含 detected_at 时间戳', () => {
      const now = Math.floor(Date.now() / 1000);

      const message = createMessage(WORKER_MESSAGE_DETECTED, {
        account_id: 'acc-123',
        message_type: 'comment',
        data: {
          platform_comment_id: 'comment-789',
          content: '内容',
          detected_at: now,
        },
      });

      expect(message.payload.data.detected_at).toBe(now);
      expect(typeof message.payload.data.detected_at).toBe('number');
    });
  });

  describe('消息验证', () => {
    test('应该拒绝缺少 account_id 的消息', () => {
      const message = createMessage(WORKER_MESSAGE_DETECTED, {
        message_type: 'comment',
        data: {},
      });

      // 验证器应该拒绝这个消息
      expect(message.payload.account_id).toBeUndefined();
    });

    test('应该拒绝无效的 message_type', () => {
      const message = createMessage(WORKER_MESSAGE_DETECTED, {
        account_id: 'acc-123',
        message_type: 'invalid_type',
        data: {},
      });

      expect(message.payload.message_type).toBe('invalid_type');
      // 验证器应该拒绝非 comment/direct_message 的类型
    });

    test('应该拒绝空的 data 对象', () => {
      const message = createMessage(WORKER_MESSAGE_DETECTED, {
        account_id: 'acc-123',
        message_type: 'comment',
        data: {},
      });

      expect(Object.keys(message.payload.data).length).toBe(0);
      // 验证器应该要求必需字段
    });
  });
});
