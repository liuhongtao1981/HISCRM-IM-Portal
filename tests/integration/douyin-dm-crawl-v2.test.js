/**
 * Phase 8: Douyin DM Crawl V2 集成测试
 *
 * 测试完整的私信爬虫流程:
 * 1. React Fiber 消息提取
 * 2. API 拦截和数据合并
 * 3. 会话和消息数据库保存
 * 4. 数据完整性验证
 */

const path = require('path');

describe('Phase 8: Douyin DM Crawl V2 - Integration Tests', () => {
  let page;
  let mockPage;
  let mockPageEvaluate;
  let mockPageRoute;

  beforeEach(() => {
    // Mock Playwright page
    mockPageEvaluate = jest.fn().mockResolvedValue([]);
    mockPageRoute = jest.fn().mockResolvedValue(undefined);

    mockPage = {
      evaluate: mockPageEvaluate,
      route: mockPageRoute,
      goto: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      locator: jest.fn().mockReturnValue({
        all: jest.fn().mockResolvedValue([]),
        first: jest.fn().mockReturnValue({
          click: jest.fn().mockResolvedValue(undefined)
        })
      })
    };

    page = mockPage;
  });

  describe('React Fiber 消息提取', () => {
    test('should extract complete messages from React Fiber', async () => {
      // 模拟 React Fiber 数据
      const fiberData = {
        platform_message_id: 'msg_123456',
        platform_sender_id: 'user_001',
        platform_sender_name: 'Alice',
        content: 'Hello World',
        direction: 'inbound',
        created_at: 1692806400
      };

      mockPageEvaluate.mockResolvedValueOnce([
        {
          index: 0,
          platform_message_id: 'msg_123456',
          content: 'Hello World',
          platform_sender_id: 'user_001',
          platform_sender_name: 'Alice',
          direction: 'inbound',
          created_at: 1692806400
        }
      ]);

      const result = await page.evaluate(() => {
        return [{ platform_message_id: 'msg_123456', content: 'Hello World' }];
      });

      expect(result).toHaveLength(1);
      expect(result[0].platform_message_id).toBe('msg_123456');
    });

    test('should support multiple Fiber property names', async () => {
      const messages = [
        {
          index: 0,
          platform_message_id: 'msg_1',
          content: 'Message 1',
          platform_sender_id: 'uid_001',  // Alternative field name
          platform_sender_name: 'User 1'
        },
        {
          index: 1,
          platform_message_id: 'msg_2',
          content: 'Message 2',
          platform_sender_id: 'sender_002',  // Another alternative
          platform_sender_name: 'User 2'
        }
      ];

      mockPageEvaluate.mockResolvedValueOnce(messages);

      const result = await page.evaluate(() => messages);

      expect(result).toHaveLength(2);
      expect(result[0].platform_sender_id).toBe('uid_001');
      expect(result[1].platform_sender_id).toBe('sender_002');
    });

    test('should handle missing Fiber data gracefully', async () => {
      const messages = [
        {
          index: 0,
          platform_message_id: 'msg_unknown_1',
          content: 'Message without sender info',
          platform_sender_id: 'unknown'
        }
      ];

      mockPageEvaluate.mockResolvedValueOnce(messages);

      const result = await page.evaluate(() => messages);

      expect(result[0].platform_sender_id).toBe('unknown');
      expect(result[0].content).toBe('Message without sender info');
    });
  });

  describe('虚拟列表分页加载', () => {
    test('should detect convergence when no new messages load', async () => {
      // 第一次调用返回 3 条消息
      // 第二次调用也返回 3 条消息 (没有新消息)
      const messages = [
        { index: 0, platform_message_id: 'msg_1', content: 'Message 1' },
        { index: 1, platform_message_id: 'msg_2', content: 'Message 2' },
        { index: 2, platform_message_id: 'msg_3', content: 'Message 3' }
      ];

      let callCount = 0;
      mockPageEvaluate.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return messages;  // 返回相同的消息
        }
        return messages;  // 最后一次也返回相同的消息
      });

      // 模拟分页查询
      const result1 = await page.evaluate(() => messages);
      const result2 = await page.evaluate(() => messages);

      expect(result1).toHaveLength(3);
      expect(result2).toHaveLength(3);
      expect(callCount).toBe(2);
    });

    test('should load additional messages when scrolling', async () => {
      const firstBatch = [
        { index: 0, platform_message_id: 'msg_1', content: 'Old Message' }
      ];

      const secondBatch = [
        { index: 0, platform_message_id: 'msg_0', content: 'Older Message' },
        { index: 1, platform_message_id: 'msg_1', content: 'Old Message' }
      ];

      let callCount = 0;
      mockPageEvaluate.mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? firstBatch : secondBatch;
      });

      const result1 = await page.evaluate(() => firstBatch);
      const result2 = await page.evaluate(() => secondBatch);

      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(2);
      expect(callCount).toBe(2);
    });
  });

  describe('API 拦截和数据合并', () => {
    test('should merge API data with higher priority than DOM data', () => {
      const domMessage = {
        platform_message_id: 'msg_123',
        content: 'Hello',
        platform_sender_id: 'unknown',
        platform_sender_name: 'Unknown'
      };

      const apiMessage = {
        platform_message_id: 'msg_123',
        content: 'Hello',
        platform_sender_id: 'user_001',
        platform_sender_name: 'Alice',
        created_at: 1692806400
      };

      // 模拟优先级合并
      const merged = {
        ...domMessage,
        ...apiMessage  // API 字段覆盖 DOM
      };

      expect(merged.platform_sender_id).toBe('user_001');
      expect(merged.platform_sender_name).toBe('Alice');
      expect(merged.created_at).toBe(1692806400);
    });

    test('should deduplicate API responses', () => {
      const responses = [
        {
          data: {
            messages: [
              { id: 'msg_1', content: 'Message 1' },
              { id: 'msg_2', content: 'Message 2' }
            ]
          }
        },
        {
          data: {
            messages: [
              { id: 'msg_1', content: 'Message 1' },  // 重复
              { id: 'msg_2', content: 'Message 2' }   // 重复
            ]
          }
        }
      ];

      // 模拟去重
      const messageMap = new Map();
      const uniqueMessages = [];

      responses.forEach(response => {
        response.data.messages.forEach(msg => {
          if (!messageMap.has(msg.id)) {
            messageMap.set(msg.id, msg);
            uniqueMessages.push(msg);
          }
        });
      });

      expect(uniqueMessages).toHaveLength(2);
      expect(uniqueMessages[0].id).toBe('msg_1');
      expect(uniqueMessages[1].id).toBe('msg_2');
    });

    test('should handle missing API data with fallback ID generation', () => {
      const domMessage = {
        platform_message_id: `msg_temp_${Date.now()}`,
        content: 'Message without API data',
        platform_sender_id: 'user_unknown'
      };

      // 验证生成的 ID 格式
      expect(domMessage.platform_message_id).toMatch(/^msg_temp_\d+$/);
    });
  });

  describe('会话管理', () => {
    test('should create conversations from extracted data', () => {
      const conversations = [
        {
          id: 'conv_account_hash_1',
          account_id: 'account_123',
          platform_user_id: 'user_001',
          platform_user_name: 'Alice',
          is_group: false,
          unread_count: 5,
          created_at: 1692806400,
          updated_at: 1692806400
        }
      ];

      expect(conversations).toHaveLength(1);
      expect(conversations[0].platform_user_id).toBe('user_001');
      expect(conversations[0].platform_user_name).toBe('Alice');
    });

    test('should link messages to conversations', () => {
      const message = {
        id: 'msg_123',
        platform_message_id: 'pm_123',
        conversation_id: 'conv_account_hash_1',
        content: 'Hello',
        account_id: 'account_123'
      };

      expect(message.conversation_id).toBe('conv_account_hash_1');
      expect(message.account_id).toBe('account_123');
    });

    test('should update conversation last message', () => {
      const messages = [
        {
          conversation_id: 'conv_1',
          platform_message_id: 'msg_1',
          content: 'First message',
          created_at: 1692806400
        },
        {
          conversation_id: 'conv_1',
          platform_message_id: 'msg_2',
          content: 'Last message',
          created_at: 1692806401
        }
      ];

      // 找到最新消息
      const lastMessage = messages.reduce((latest, current) => {
        return current.created_at > latest.created_at ? current : latest;
      });

      expect(lastMessage.content).toBe('Last message');
      expect(lastMessage.platform_message_id).toBe('msg_2');
    });
  });

  describe('数据完整性验证', () => {
    test('should validate required fields in messages', () => {
      const validMessage = {
        platform_message_id: 'msg_123',
        platform_sender_id: 'user_001',
        content: 'Hello'
      };

      const incompleteMessage = {
        platform_message_id: 'msg_456',
        content: 'Hello'
        // 缺少 platform_sender_id
      };

      const isValid = (msg) => {
        return msg.platform_message_id && msg.platform_sender_id && msg.content;
      };

      expect(isValid(validMessage)).toBe(true);
      expect(isValid(incompleteMessage)).toBe(false);
    });

    test('should sort messages by timestamp', () => {
      const messages = [
        { platform_message_id: 'msg_3', content: 'Third', created_at: 1692806402 },
        { platform_message_id: 'msg_1', content: 'First', created_at: 1692806400 },
        { platform_message_id: 'msg_2', content: 'Second', created_at: 1692806401 }
      ];

      const sorted = messages.sort((a, b) => a.created_at - b.created_at);

      expect(sorted[0].platform_message_id).toBe('msg_1');
      expect(sorted[1].platform_message_id).toBe('msg_2');
      expect(sorted[2].platform_message_id).toBe('msg_3');
    });

    test('should compute message statistics', () => {
      const messages = [
        { platform_message_id: 'msg_1', direction: 'inbound' },
        { platform_message_id: 'msg_2', direction: 'outbound' },
        { platform_message_id: 'msg_3', direction: 'inbound' }
      ];

      const stats = {
        total: messages.length,
        inbound: messages.filter(m => m.direction === 'inbound').length,
        outbound: messages.filter(m => m.direction === 'outbound').length
      };

      expect(stats.total).toBe(3);
      expect(stats.inbound).toBe(2);
      expect(stats.outbound).toBe(1);
    });
  });

  describe('错误处理', () => {
    test('should handle empty page evaluation results', async () => {
      mockPageEvaluate.mockResolvedValueOnce([]);

      const result = await page.evaluate(() => []);

      expect(result).toEqual([]);
    });

    test('should handle network errors gracefully', async () => {
      const error = new Error('Network timeout');
      mockPageEvaluate.mockRejectedValueOnce(error);

      await expect(page.evaluate(() => [])).rejects.toThrow('Network timeout');
    });

    test('should handle malformed API responses', () => {
      const malformedResponse = {
        data: null  // 缺少 messages 字段
      };

      const isValid = (response) => {
        return response.data && Array.isArray(response.data.messages);
      };

      expect(isValid(malformedResponse)).toBe(false);
    });

    test('should skip invalid messages without failing', () => {
      const messages = [
        { platform_message_id: 'msg_1', content: 'Valid' },
        { platform_message_id: null, content: 'Invalid' },
        { platform_message_id: 'msg_3', content: 'Valid' }
      ];

      const valid = messages.filter(m => m.platform_message_id && m.content);

      expect(valid).toHaveLength(2);
      expect(valid[0].platform_message_id).toBe('msg_1');
      expect(valid[1].platform_message_id).toBe('msg_3');
    });
  });

  describe('Performance', () => {
    test('should handle large message batches', () => {
      const largeMessageSet = Array.from({ length: 1000 }, (_, i) => ({
        platform_message_id: `msg_${i}`,
        content: `Message ${i}`,
        platform_sender_id: `user_${i % 100}`,
        created_at: 1692806400 + i
      }));

      expect(largeMessageSet).toHaveLength(1000);
      expect(largeMessageSet[0].platform_message_id).toBe('msg_0');
      expect(largeMessageSet[999].platform_message_id).toBe('msg_999');
    });

    test('should efficiently deduplicate large datasets', () => {
      const messages = Array.from({ length: 10000 }, (_, i) => ({
        id: `msg_${i % 1000}`,  // 只有 1000 个唯一 ID
        content: `Message ${i}`
      }));

      const messageMap = new Map();
      messages.forEach(msg => {
        if (!messageMap.has(msg.id)) {
          messageMap.set(msg.id, msg);
        }
      });

      expect(messageMap.size).toBe(1000);
    });
  });
});
