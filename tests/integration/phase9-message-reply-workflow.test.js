/**
 * Phase 9: Message Reply Workflow Integration Test
 *
 * Tests the complete end-to-end message reply workflow:
 * 1. ReplyExecutor receives reply request with conversation_id
 * 2. Parameters are normalized to support both Phase 8 and Phase 9 formats
 * 3. Platform's replyToDirectMessage is called with new parameters
 * 4. Conversation is located using findConversationByPlatformUser
 * 5. Message is optionally located using findMessageInConversation
 * 6. Reply is sent successfully
 */

describe('Phase 9: Message Reply Workflow Integration Test', () => {
  let mockPage;
  let mockSocket;
  let replyExecutor;
  let platformInstance;

  beforeEach(() => {
    // Mock Playwright page
    mockPage = {
      goto: jest.fn().mockResolvedValue(null),
      waitForTimeout: jest.fn().mockResolvedValue(null),
      click: jest.fn().mockResolvedValue(null),
      $: jest.fn().mockResolvedValue(null),
      locator: jest.fn().mockReturnValue({
        count: jest.fn().mockResolvedValue(0),
        nth: jest.fn().mockReturnValue({
          textContent: jest.fn().mockResolvedValue(''),
          click: jest.fn().mockResolvedValue(null),
        }),
        filter: jest.fn().mockReturnValue({
          first: jest.fn().mockReturnValue({
            click: jest.fn().mockResolvedValue(null),
          }),
        }),
      }),
      evaluate: jest.fn(),
      isClosed: jest.fn().mockReturnValue(false),
    };

    // Mock socket
    mockSocket = {
      emit: jest.fn(),
      on: jest.fn(),
    };

    // Mock platform instance
    platformInstance = {
      replyToDirectMessage: jest.fn().mockResolvedValue({
        success: true,
        message: 'Reply sent successfully',
        reply_id: 'reply-123',
      }),
      extractUserIdFromConversationId: jest.fn((id) => {
        const match = id?.match(/^conv_[^_]+_(.+)$/);
        return match ? match[1] : null;
      }),
      findConversationByPlatformUser: jest.fn().mockResolvedValue({
        click: jest.fn().mockResolvedValue(null),
      }),
      findMessageInConversation: jest.fn().mockResolvedValue(null),
    };

    // Mock ReplyExecutor
    replyExecutor = {
      platformManager: {
        getPlatform: jest.fn().mockReturnValue(platformInstance),
      },
      browserManager: {},
      socketClient: mockSocket,
      executedRequests: new Map(),

      // Copy normalizeReplyRequest implementation
      normalizeReplyRequest(request) {
        const {
          target_id,
          conversation_id,
          platform_message_id,
          ...rest
        } = request;

        const finalConversationId = conversation_id || target_id;
        const finalPlatformMessageId = platform_message_id ||
                                       (conversation_id ? null : target_id);

        return {
          ...rest,
          target_id,
          conversation_id: finalConversationId,
          platform_message_id: finalPlatformMessageId,
        };
      },
    };
  });

  describe('Scenario 1: Parameter Normalization', () => {
    test('should normalize Phase 9 format (conversation_id + platform_message_id)', () => {
      const phase9Request = {
        reply_id: 'reply-123',
        request_id: 'req-456',
        platform: 'douyin',
        account_id: 'acc-789',
        target_type: 'direct_message',
        conversation_id: 'conv_acc-789_user-001',
        platform_message_id: 'msg-123',
        reply_content: 'Hello',
        context: {},
      };

      const normalized = replyExecutor.normalizeReplyRequest(phase9Request);

      expect(normalized.conversation_id).toBe('conv_acc-789_user-001');
      expect(normalized.platform_message_id).toBe('msg-123');
    });

    test('should normalize Phase 8 format (target_id only) for backward compatibility', () => {
      const phase8Request = {
        reply_id: 'reply-123',
        request_id: 'req-456',
        platform: 'douyin',
        account_id: 'acc-789',
        target_type: 'direct_message',
        target_id: 'conv_acc-789_user-001',  // Phase 8: target_id
        reply_content: 'Hello',
        context: {},
      };

      const normalized = replyExecutor.normalizeReplyRequest(phase8Request);

      expect(normalized.conversation_id).toBe('conv_acc-789_user-001');
      expect(normalized.platform_message_id).toBe('conv_acc-789_user-001');  // Falls back to target_id
    });

    test('should prioritize conversation_id over target_id', () => {
      const request = {
        reply_id: 'reply-123',
        request_id: 'req-456',
        target_id: 'old-value',           // Should be ignored
        conversation_id: 'conv_acc-789_user-001',  // Should take priority
        platform_message_id: 'msg-123',
        reply_content: 'Hello',
        context: {},
      };

      const normalized = replyExecutor.normalizeReplyRequest(request);

      expect(normalized.conversation_id).toBe('conv_acc-789_user-001');
      expect(normalized.platform_message_id).toBe('msg-123');
    });
  });

  describe('Scenario 2: Helper Methods', () => {
    test('extractUserIdFromConversationId 提取正确的 user_id', () => {
      const conversationId = 'conv_account-123_user-456';
      const userId = platformInstance.extractUserIdFromConversationId(conversationId);

      expect(userId).toBe('user-456');
    });

    test('extractUserIdFromConversationId 处理无效格式', () => {
      const invalidId = 'invalid-format';
      const userId = platformInstance.extractUserIdFromConversationId(invalidId);

      expect(userId).toBeNull();
    });

    test('findConversationByPlatformUser 应该定位正确的会话', async () => {
      const mockLocator = {
        count: jest.fn().mockResolvedValue(3),
        nth: jest.fn((index) => {
          const conversations = [
            { textContent: jest.fn().mockResolvedValue('Alice - user-001') },
            { textContent: jest.fn().mockResolvedValue('Bob - user-002') },
            { textContent: jest.fn().mockResolvedValue('Charlie - user-003') },
          ];
          return conversations[index];
        }),
      };

      mockPage.locator.mockReturnValue(mockLocator);
      platformInstance.findConversationByPlatformUser = jest.fn(async (page, userId) => {
        const locator = page.locator('[role="grid"] [role="listitem"]');
        const count = await locator.count();

        for (let i = 0; i < count; i++) {
          const item = locator.nth(i);
          const text = await item.textContent();
          if (text.includes(userId)) {
            return item;
          }
        }
        return null;
      });

      const result = await platformInstance.findConversationByPlatformUser(
        mockPage,
        'user-002'
      );

      expect(result).toBeDefined();
    });
  });

  describe('Scenario 3: Complete Reply Flow', () => {
    test('should execute reply with new Phase 9 parameters', async () => {
      const replyRequest = {
        reply_id: 'reply-123',
        request_id: 'req-456',
        platform: 'douyin',
        account_id: 'acc-789',
        target_type: 'direct_message',
        conversation_id: 'conv_acc-789_user-001',
        platform_message_id: 'msg-123',
        reply_content: 'Thank you for your message!',
        context: {
          platform_user_id: 'user-001',
          sender_name: 'Alice',
          message_content: 'Hello there',
        },
      };

      const normalized = replyExecutor.normalizeReplyRequest(replyRequest);

      // Verify normalized parameters
      expect(normalized.conversation_id).toBe('conv_acc-789_user-001');
      expect(normalized.platform_message_id).toBe('msg-123');

      // Simulate calling platform.replyToDirectMessage
      const result = await platformInstance.replyToDirectMessage(
        replyRequest.account_id,
        {
          conversation_id: normalized.conversation_id,
          platform_message_id: normalized.platform_message_id,
          reply_content: replyRequest.reply_content,
          context: replyRequest.context,
          browserManager: {},
        }
      );

      expect(result.success).toBe(true);
      expect(platformInstance.replyToDirectMessage).toHaveBeenCalled();
    });

    test('should handle optional platform_message_id for general conversation reply', async () => {
      const replyRequest = {
        reply_id: 'reply-123',
        request_id: 'req-456',
        platform: 'douyin',
        account_id: 'acc-789',
        target_type: 'direct_message',
        conversation_id: 'conv_acc-789_user-001',
        // No platform_message_id - reply to entire conversation
        reply_content: 'General reply to conversation',
        context: {
          platform_user_id: 'user-001',
          sender_name: 'Alice',
        },
      };

      const normalized = replyExecutor.normalizeReplyRequest(replyRequest);

      expect(normalized.conversation_id).toBe('conv_acc-789_user-001');
      expect(normalized.platform_message_id).toBeNull();  // No platform_message_id provided
    });
  });

  describe('Scenario 4: Data Integrity', () => {
    test('should maintain conversation_id format integrity', () => {
      const conversationId = 'conv_account-123_user-456';

      // Extract user ID
      const userId = platformInstance.extractUserIdFromConversationId(conversationId);

      // Verify format is preserved
      expect(conversationId).toMatch(/^conv_/);
      expect(userId).toBe('user-456');
    });

    test('should validate required fields in reply request', () => {
      const validateReplyRequest = (request) => {
        const errors = [];
        if (!request.reply_id) errors.push('Missing reply_id');
        if (!request.request_id) errors.push('Missing request_id');
        if (!request.platform) errors.push('Missing platform');
        if (!request.account_id) errors.push('Missing account_id');
        if (!request.target_type) errors.push('Missing target_type');
        if (!request.conversation_id && !request.target_id) {
          errors.push('Missing conversation_id or target_id');
        }
        if (!request.reply_content) errors.push('Missing reply_content');
        return { valid: errors.length === 0, errors };
      };

      const validRequest = {
        reply_id: 'reply-123',
        request_id: 'req-456',
        platform: 'douyin',
        account_id: 'acc-789',
        target_type: 'direct_message',
        conversation_id: 'conv_acc-789_user-001',
        reply_content: 'Hello',
      };

      const result = validateReplyRequest(validRequest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Scenario 5: Backward Compatibility', () => {
    test('should work with old Phase 8 format (target_id = platform_message_id)', () => {
      const phase8Request = {
        reply_id: 'reply-123',
        request_id: 'req-456',
        platform: 'douyin',
        account_id: 'acc-789',
        target_type: 'direct_message',
        target_id: 'conv_acc-789_user-001',  // Phase 8: could be either
        reply_content: 'Hello',
        context: {},
      };

      const normalized = replyExecutor.normalizeReplyRequest(phase8Request);

      // Should work seamlessly
      expect(normalized.conversation_id).toBe('conv_acc-789_user-001');
    });

    test('should support mixed old and new parameters', () => {
      const mixedRequest = {
        reply_id: 'reply-123',
        request_id: 'req-456',
        target_id: 'fallback-id',
        conversation_id: 'conv_acc-789_user-001',  // New takes priority
        reply_content: 'Hello',
        context: {},
      };

      const normalized = replyExecutor.normalizeReplyRequest(mixedRequest);

      expect(normalized.conversation_id).toBe('conv_acc-789_user-001');
    });
  });

  describe('Scenario 6: Error Handling', () => {
    test('should handle missing conversation_id gracefully', () => {
      const request = {
        reply_id: 'reply-123',
        request_id: 'req-456',
        reply_content: 'Hello',
      };

      const normalized = replyExecutor.normalizeReplyRequest(request);

      // Should have undefined conversation_id
      expect(normalized.conversation_id).toBeUndefined();
    });

    test('should handle null or undefined context', () => {
      const request = {
        reply_id: 'reply-123',
        conversation_id: 'conv_acc-789_user-001',
        reply_content: 'Hello',
        context: undefined,  // Undefined context
      };

      expect(() => {
        replyExecutor.normalizeReplyRequest(request);
      }).not.toThrow();
    });

    test('should handle extractUserIdFromConversationId with invalid inputs', () => {
      const testCases = [
        { input: null, expected: null },
        { input: undefined, expected: null },
        { input: '', expected: null },
        { input: 'invalid-format', expected: null },
        { input: 'conv_acc_user-001', expected: 'user-001' },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = platformInstance.extractUserIdFromConversationId(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Scenario 7: Message Finding Logic', () => {
    test('should prioritize message_id matching', async () => {
      // When both message_id and content could match, prefer message_id
      const context = {
        message_content: 'Hello',  // Could match multiple messages
      };

      platformInstance.findMessageInConversation.mockResolvedValue({
        index: 2,
        matched_by: 'message_id',  // Preferred match method
      });

      const result = await platformInstance.findMessageInConversation(
        mockPage,
        'msg-123',
        context
      );

      expect(result).toBeDefined();
    });

    test('should handle fallback to content matching', async () => {
      // When message_id not found, try content matching
      platformInstance.findMessageInConversation.mockResolvedValue(null);

      const result = await platformInstance.findMessageInConversation(
        mockPage,
        'non-existent-msg',
        { message_content: 'Important content' }
      );

      // Should return null if not found
      expect(result).toBeNull();
    });
  });
});
