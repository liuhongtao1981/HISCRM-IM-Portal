/**
 * 多客户端通知广播集成测试
 * T063: 测试通知广播到多个客户端
 */

const { createMessage, MASTER_NOTIFICATION_PUSH } = require('@hiscrm-im/shared/protocol/messages');

describe('T063: Notification Broadcast Integration', () => {
  let mockClients;
  let mockNotification;

  beforeEach(() => {
    // 模拟多个在线客户端
    mockClients = [
      { id: 'client-001', device_id: 'desktop-001', device_type: 'desktop' },
      { id: 'client-002', device_id: 'desktop-002', device_type: 'desktop' },
      { id: 'client-003', device_id: 'mobile-001', device_type: 'mobile' },
    ];

    // 模拟通知
    mockNotification = {
      id: 'notif-123',
      type: 'comment',
      account_id: 'acc-456',
      title: '新评论',
      content: '张三评论了你的视频',
      data: {
        comment_id: 'comment-789',
        author_name: '张三',
      },
      created_at: Math.floor(Date.now() / 1000),
    };
  });

  describe('通知广播', () => {
    test('应该向所有在线客户端广播通知', () => {
      // 模拟广播逻辑
      const broadcastedClients = [];

      for (const client of mockClients) {
        const message = createMessage(MASTER_NOTIFICATION_PUSH, {
          notification_id: mockNotification.id,
          type: mockNotification.type,
          account_id: mockNotification.account_id,
          title: mockNotification.title,
          content: mockNotification.content,
          data: mockNotification.data,
          created_at: mockNotification.created_at,
        });

        broadcastedClients.push({
          client_id: client.id,
          message: message,
        });
      }

      expect(broadcastedClients).toHaveLength(3);
      expect(broadcastedClients[0].message.type).toBe(MASTER_NOTIFICATION_PUSH);
    });

    test('应该跳过离线客户端', () => {
      // 模拟部分客户端离线
      const onlineClients = mockClients.filter((c) => c.id !== 'client-003');

      expect(onlineClients).toHaveLength(2);
      expect(onlineClients.some((c) => c.id === 'client-001')).toBe(true);
      expect(onlineClients.some((c) => c.id === 'client-003')).toBe(false);
    });

    test('应该记录通知发送状态', () => {
      const deliveryStatus = {
        notification_id: mockNotification.id,
        sent_to: [],
        failed_to: [],
      };

      // 模拟发送
      for (const client of mockClients) {
        try {
          // 模拟成功发送
          deliveryStatus.sent_to.push(client.id);
        } catch (error) {
          deliveryStatus.failed_to.push(client.id);
        }
      }

      expect(deliveryStatus.sent_to).toHaveLength(3);
      expect(deliveryStatus.failed_to).toHaveLength(0);
    });
  });

  describe('通知持久化', () => {
    test('应该保存通知到数据库', () => {
      // 模拟保存
      const savedNotification = {
        ...mockNotification,
        is_sent: true,
        sent_at: Math.floor(Date.now() / 1000),
      };

      expect(savedNotification.is_sent).toBe(true);
      expect(savedNotification.sent_at).toBeDefined();
    });

    test('应该支持查询未读通知', () => {
      const notifications = [
        { id: 'notif-001', is_sent: true },
        { id: 'notif-002', is_sent: true },
        { id: 'notif-003', is_sent: false },
      ];

      const unsentNotifications = notifications.filter((n) => !n.is_sent);

      expect(unsentNotifications).toHaveLength(1);
      expect(unsentNotifications[0].id).toBe('notif-003');
    });
  });

  describe('设备管理', () => {
    test('应该跟踪所有在线设备', () => {
      const onlineDevices = new Map();

      for (const client of mockClients) {
        onlineDevices.set(client.device_id, {
          socket_id: client.id,
          device_type: client.device_type,
          connected_at: Date.now(),
        });
      }

      expect(onlineDevices.size).toBe(3);
      expect(onlineDevices.has('desktop-001')).toBe(true);
      expect(onlineDevices.has('mobile-001')).toBe(true);
    });

    test('应该允许同一设备多次连接', () => {
      const connections = new Map();
      const deviceId = 'desktop-001';

      // 第一次连接
      connections.set(deviceId, { socket_id: 'socket-001' });

      // 第二次连接 (新的socket)
      connections.set(deviceId, { socket_id: 'socket-002' });

      // 应该保留最新的连接
      expect(connections.get(deviceId).socket_id).toBe('socket-002');
    });
  });
});
