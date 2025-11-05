/**
 * 监控 Master 服务器的 WebSocket 通信日志
 * 用于诊断未读数跳动问题
 */

const io = require('socket.io-client');

async function main() {
  console.log('连接到 Master 服务器 (localhost:3000)...\n');

  // 连接到 Master 的根命名空间（IM WebSocket）
  const socket = io('http://localhost:3000', {
    transports: ['websocket'],
    reconnection: true
  });

  socket.on('connect', () => {
    console.log('✅ 已连接到 Master 服务器\n');
    console.log('监听 IM 客户端事件...\n');
    console.log('=' .repeat(80));
  });

  socket.on('disconnect', () => {
    console.log('\n❌ 与 Master 服务器断开连接\n');
  });

  // 监听所有事件
  const originalOnevent = socket.onevent;
  socket.onevent = function(packet) {
    const args = packet.data || [];
    const eventName = args[0];
    const eventData = args[1];

    // 过滤我们关心的事件
    const relevantEvents = [
      'monitor:topics',
      'monitor:request_topics',
      'monitor:messages',
      'monitor:mark_conversation_as_read',
      'monitor:conversation_read',
      'monitor:channels'
    ];

    if (relevantEvents.some(ev => eventName.includes(ev))) {
      console.log(`\n[${new Date().toLocaleTimeString()}] 事件: ${eventName}`);

      if (eventName === 'monitor:topics' && eventData?.topics) {
        console.log('  账户:', eventData.channelId);
        console.log('  主题数量:', eventData.topics.length);

        // 统计未读数
        const unreadTopics = eventData.topics.filter(t => t.unreadCount > 0);
        if (unreadTopics.length > 0) {
          console.log('  有未读的主题:');
          unreadTopics.forEach(t => {
            console.log(`    - ${t.isPrivate ? '[私信]' : '[评论]'} ${t.title}: ${t.unreadCount} 条未读`);
          });
        }
      }

      if (eventName === 'monitor:mark_conversation_as_read') {
        console.log('  标记会话已读:');
        console.log('    账户:', eventData.channelId);
        console.log('    会话:', eventData.conversationId);
      }

      if (eventName === 'monitor:conversation_read') {
        console.log('  会话已读广播:');
        console.log('    账户:', eventData.channelId);
        console.log('    会话:', eventData.conversationId);
        console.log('    标记数量:', eventData.count);
      }
    }

    originalOnevent.call(this, packet);
  };

  // 模拟客户端注册
  socket.emit('monitor:register', {
    clientId: 'debug-monitor-' + Date.now()
  });

  // 保持运行
  console.log('\n按 Ctrl+C 停止监控...\n');
  await new Promise(() => {});
}

main().catch(console.error);
