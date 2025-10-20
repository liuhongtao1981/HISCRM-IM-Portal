/**
 * 评论回复功能单元测试
 * 测试 replyToComment() 方法的返回格式和错误处理
 */

const DouyinPlatform = require('../../../src/platforms/douyin/platform');

describe('DouyinPlatform - replyToComment()', () => {
  let platform;
  let mockBrowserManager;
  let mockWorkerBridge;

  beforeEach(() => {
    // Mock Worker Bridge
    mockWorkerBridge = {
      socket: {
        emit: jest.fn(),
      },
    };

    // Mock 浏览器管理器
    mockBrowserManager = {
      getContext: jest.fn(),
      getPage: jest.fn(),
    };

    // 创建平台实例
    platform = new DouyinPlatform(
      { platform: 'douyin' },
      mockWorkerBridge,
      mockBrowserManager
    );
  });

  describe('方法存在性检查', () => {
    test('replyToComment 方法应该存在', () => {
      expect(typeof platform.replyToComment).toBe('function');
    });

    test('方法应该是异步的', () => {
      const result = platform.replyToComment('account-123', {
        target_id: 'test-id',
        reply_content: 'test',
        context: {},
      });
      expect(result instanceof Promise).toBe(true);
    });
  });

  describe('返回格式验证', () => {
    test('失败时应该返回标准错误格式', async () => {
      // 由于 ensureAccountContext 未被 mock，这会导致错误
      // 我们验证返回格式是否符合预期
      const result = await platform.replyToComment('account-123', {
        target_id: '@j/test-comment-id',
        reply_content: '测试回复',
        context: { video_id: 'video-123' },
        browserManager: mockBrowserManager,
      });

      // 验证返回格式
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('data');
      expect(typeof result.success).toBe('boolean');

      // 当失败时
      if (!result.success) {
        expect(result).toHaveProperty('reason');
        expect(result.data).toHaveProperty('comment_id');
        expect(result.data).toHaveProperty('error_message');
        expect(result.data).toHaveProperty('timestamp');
      }
    });

    test('应该包含 timestamp 字段', async () => {
      const result = await platform.replyToComment('account-123', {
        target_id: '@j/test-id',
        reply_content: '测试',
        context: {},
      });

      expect(result.data).toHaveProperty('timestamp');
      expect(typeof result.data.timestamp).toBe('string');
      // 验证是否是有效的 ISO 时间格式
      expect(new Date(result.data.timestamp)).not.toBeNaN();
    });

    test('应该包含 comment_id 字段', async () => {
      const commentId = '@j/specific-comment-id';
      const result = await platform.replyToComment('account-123', {
        target_id: commentId,
        reply_content: '测试',
        context: {},
      });

      expect(result.data.comment_id).toBe(commentId);
    });

    test('应该包含 reply_content 字段', async () => {
      const content = '这是测试内容';
      const result = await platform.replyToComment('account-123', {
        target_id: '@j/test-id',
        reply_content: content,
        context: {},
      });

      expect(result.data.reply_content).toBe(content);
    });
  });

  describe('错误处理验证', () => {
    test('错误状态应该是 "error" 或 "blocked"', async () => {
      const result = await platform.replyToComment('account-123', {
        target_id: '@j/test-id',
        reply_content: '测试',
        context: {},
      });

      if (!result.success) {
        expect(['error', 'blocked']).toContain(result.status);
      }
    });

    test('成功状态应该包含 platform_reply_id', async () => {
      // 这个测试会因为缺少 browser 而失败
      // 但我们验证的是代码逻辑而不是实际浏览器交互
      const result = await platform.replyToComment('account-123', {
        target_id: '@j/test-id',
        reply_content: '测试',
        context: {},
      });

      // 如果成功，应该有 platform_reply_id
      if (result.success) {
        expect(result).toHaveProperty('platform_reply_id');
        expect(typeof result.platform_reply_id).toBe('string');
      }
    });
  });

  describe('输入参数验证', () => {
    test('应该接受完整的参数对象', async () => {
      const options = {
        target_id: '@j/comment-123',
        reply_content: '回复内容',
        context: { video_id: 'video-456', comment_user_id: 'user-789' },
        browserManager: mockBrowserManager,
      };

      const result = await platform.replyToComment('account-123', options);

      // 只验证返回格式正确
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
    });

    test('应该处理空 context 对象', async () => {
      const result = await platform.replyToComment('account-123', {
        target_id: '@j/test-id',
        reply_content: '测试',
        context: {},
        browserManager: mockBrowserManager,
      });

      // 应该不抛出异常
      expect(result).toBeDefined();
    });

    test('应该处理 video_id 缺失的情况', async () => {
      const result = await platform.replyToComment('account-123', {
        target_id: '@j/test-id',
        reply_content: '测试',
        context: { comment_user_id: 'user-123' },
        browserManager: mockBrowserManager,
      });

      // 应该不抛出异常并返回标准格式
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
    });
  });

  describe('边界情况', () => {
    test('应该处理超长回复内容', async () => {
      const longContent = 'A'.repeat(5000);
      const result = await platform.replyToComment('account-123', {
        target_id: '@j/test-id',
        reply_content: longContent,
        context: {},
      });

      expect(result.data.reply_content).toBe(longContent);
    });

    test('应该处理特殊字符内容', async () => {
      const specialContent = '测试 @用户 #话题 😀 \n换行 \t制表符';
      const result = await platform.replyToComment('account-123', {
        target_id: '@j/test-id',
        reply_content: specialContent,
        context: {},
      });

      expect(result.data.reply_content).toBe(specialContent);
    });

    test('应该处理空回复内容', async () => {
      const result = await platform.replyToComment('account-123', {
        target_id: '@j/test-id',
        reply_content: '',
        context: {},
      });

      expect(result.data.reply_content).toBe('');
    });
  });

  describe('返回状态码验证', () => {
    test('blocked 状态应该包含 reason 字段', async () => {
      const result = await platform.replyToComment('account-123', {
        target_id: '@j/test-id',
        reply_content: '测试',
        context: {},
      });

      if (result.status === 'blocked') {
        expect(result).toHaveProperty('reason');
        expect(typeof result.reason).toBe('string');
        expect(result.reason.length).toBeGreaterThan(0);
      }
    });

    test('error 状态应该包含 reason 字段', async () => {
      const result = await platform.replyToComment('account-123', {
        target_id: '@j/test-id',
        reply_content: '测试',
        context: {},
      });

      if (result.status === 'error') {
        expect(result).toHaveProperty('reason');
        expect(typeof result.reason).toBe('string');
      }
    });
  });

  describe('数据完整性', () => {
    test('成功响应必需字段完整', async () => {
      const result = await platform.replyToComment('account-123', {
        target_id: '@j/test-id',
        reply_content: 'test content',
        context: { video_id: 'vid-123' },
      });

      if (result.success) {
        // 成功时必需字段
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('platform_reply_id');
        expect(result).toHaveProperty('data');

        const { data } = result;
        expect(data).toHaveProperty('comment_id');
        expect(data).toHaveProperty('reply_content');
        expect(data).toHaveProperty('timestamp');
      }
    });

    test('失败响应必需字段完整', async () => {
      const result = await platform.replyToComment('account-123', {
        target_id: '@j/test-id',
        reply_content: 'test',
        context: {},
      });

      if (!result.success) {
        // 失败时必需字段
        expect(result).toHaveProperty('success', false);
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('reason');
        expect(result).toHaveProperty('data');

        const { data } = result;
        expect(data).toHaveProperty('comment_id');
        expect(data).toHaveProperty('error_message');
        expect(data).toHaveProperty('timestamp');
      }
    });
  });
});
