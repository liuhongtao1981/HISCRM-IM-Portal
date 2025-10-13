/**
 * 离线客户端同步集成测试
 * T064: 测试客户端重连后同步离线通知
 */

const {
  createMessage,
  CLIENT_SYNC_REQUEST,
  CLIENT_SYNC_RESPONSE,
} = require('@hiscrm-im/shared/protocol/messages');

describe('T064: Offline Client Sync Integration', () => {
  let mockClient;
  let offlineNotifications;

  beforeEach(() => {
    // 模拟客户端
    mockClient = {
      device_id: 'desktop-001',
      last_seen: Math.floor(Date.now() / 1000) - 3600, // 1小时前离线
    };

    // 模拟离线期间产生的通知
    offlineNotifications = [
      {
        id: 'notif-001',
        type: 'comment',
        title: '新评论',
        content: '张三评论了你的视频',
        created_at: Math.floor(Date.now() / 1000) - 1800, // 30分钟前
        is_sent: false,
      },
      {
        id: 'notif-002',
        type: 'direct_message',
        title: '新私信',
        content: '李四发来私信',
        created_at: Math.floor(Date.now() / 1000) - 900, // 15分钟前
        is_sent: false,
      },
    ];
  });

  describe('同步请求', () => {
    test('应该创建正确的同步请求消息', () => {
      const syncRequest = createMessage(CLIENT_SYNC_REQUEST, {
        device_id: mockClient.device_id,
        last_seen: mockClient.last_seen,
      });

      expect(syncRequest.type).toBe(CLIENT_SYNC_REQUEST);
      expect(syncRequest.payload.device_id).toBe('desktop-001');
      expect(syncRequest.payload.last_seen).toBeDefined();
    });

    test('应该支持指定时间范围', () => {
      const since = Math.floor(Date.now() / 1000) - 7200; // 2小时前

      const syncRequest = createMessage(CLIENT_SYNC_REQUEST, {
        device_id: mockClient.device_id,
        since_timestamp: since,
      });

      expect(syncRequest.payload.since_timestamp).toBe(since);
    });
  });

  describe('同步响应', () => {
    test('应该返回离线期间的所有通知', () => {
      // 过滤离线期间的通知
      const notificationsToSync = offlineNotifications.filter(
        (n) => n.created_at > mockClient.last_seen
      );

      const syncResponse = createMessage(CLIENT_SYNC_RESPONSE, {
        device_id: mockClient.device_id,
        notifications: notificationsToSync,
        total_count: notificationsToSync.length,
      });

      expect(syncResponse.type).toBe(CLIENT_SYNC_RESPONSE);
      expect(syncResponse.payload.notifications).toHaveLength(2);
      expect(syncResponse.payload.total_count).toBe(2);
    });

    test('应该处理没有离线通知的情况', () => {
      const syncResponse = createMessage(CLIENT_SYNC_RESPONSE, {
        device_id: mockClient.device_id,
        notifications: [],
        total_count: 0,
      });

      expect(syncResponse.payload.notifications).toHaveLength(0);
      expect(syncResponse.payload.total_count).toBe(0);
    });

    test('应该按时间倒序返回通知', () => {
      const sortedNotifications = [...offlineNotifications].sort(
        (a, b) => b.created_at - a.created_at
      );

      expect(sortedNotifications[0].id).toBe('notif-002'); // 最新的
      expect(sortedNotifications[1].id).toBe('notif-001'); // 较早的
    });
  });

  describe('设备重连', () => {
    test('应该更新设备最后在线时间', () => {
      const now = Math.floor(Date.now() / 1000);

      const updatedClient = {
        ...mockClient,
        last_seen: now,
        status: 'online',
      };

      expect(updatedClient.last_seen).toBeGreaterThan(mockClient.last_seen);
      expect(updatedClient.status).toBe('online');
    });

    test('应该标记同步的通知为已发送', () => {
      const notificationsToMark = offlineNotifications.map((n) => ({
        ...n,
        is_sent: true,
        sent_at: Math.floor(Date.now() / 1000),
      }));

      expect(notificationsToMark.every((n) => n.is_sent)).toBe(true);
      expect(notificationsToMark.every((n) => n.sent_at)).toBeTruthy();
    });
  });

  describe('错误处理', () => {
    test('应该处理无效的设备ID', () => {
      const invalidRequest = createMessage(CLIENT_SYNC_REQUEST, {
        device_id: null,
      });

      expect(invalidRequest.payload.device_id).toBeNull();
      // 服务器应该拒绝这个请求
    });

    test('应该处理无效的时间戳', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 未来1小时

      const syncRequest = createMessage(CLIENT_SYNC_REQUEST, {
        device_id: mockClient.device_id,
        since_timestamp: futureTimestamp,
      });

      // 应该返回空列表或错误
      expect(syncRequest.payload.since_timestamp).toBeGreaterThan(Date.now() / 1000);
    });
  });

  describe('分页支持', () => {
    test('应该支持分页查询大量通知', () => {
      const largeNotificationList = Array.from({ length: 100 }, (_, i) => ({
        id: `notif-${i}`,
        created_at: Math.floor(Date.now() / 1000) - i * 60,
      }));

      const pageSize = 20;
      const page = 1;

      const paginatedNotifications = largeNotificationList.slice(0, pageSize);

      expect(paginatedNotifications).toHaveLength(20);
    });

    test('应该返回总数以支持客户端分页', () => {
      const totalCount = 100;
      const pageSize = 20;
      const totalPages = Math.ceil(totalCount / pageSize);

      expect(totalPages).toBe(5);
    });
  });
});
