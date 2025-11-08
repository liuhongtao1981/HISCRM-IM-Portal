/**
 * 从数据库加载数据�?Master DataStore
 * 用于测试 IM 客户端显示功�? */

const Database = require('better-sqlite3');
const path = require('path');
const io = require('socket.io-client');

async function loadDataToDataStore() {
  console.log('========================================');
  console.log('从数据库加载数据�?Master DataStore');
  console.log('========================================\n');

  // 1. 读取数据库数�?  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath, { readonly: true });

  console.log('1. 读取数据库数�?..');

  // 读取账户信息
  const account = db.prepare(`SELECT * FROM accounts WHERE platform = 'douyin' LIMIT 1`).get();
  console.log(`   找到账户: ${account.account_id}\n`);

  // 读取作品（Master 数据库中没有作品表，使用空数组）
  const contents = [];
  console.log(`   找到 ${contents.length} 个作品`);

  // 读取评论
  const comments = db.prepare(`SELECT * FROM comments WHERE account_id = ?`).all(account.id);
  console.log(`   找到 ${comments.length} 条评论`);

  // 读取会话
  const conversations = db.prepare(`SELECT * FROM conversations WHERE account_id = ?`).all(account.id);
  console.log(`   找到 ${conversations.length} 个会话`);

  // 读取私信
  const messages = db.prepare(`SELECT * FROM direct_messages WHERE account_id = ?`).all(account.id);
  console.log(`   找到 ${messages.length} 条私信\n`);

  db.close();

  // 2. 构�?DataStore 数据格式
  console.log('2. 构�?DataStore 数据格式...');
  const dataStoreData = {
    accountId: account.id,
    platform: account.platform,
    accountName: account.account_name,
    lastUpdate: Date.now(),
    data: {
      contents: contents.map(c => ({
        work_id: c.work_id,
        title: c.title,
        description: c.description,
        publish_time: c.publish_time,
        last_crawl_time: c.last_crawl_time
      })),
      comments: comments.map(c => ({
        id: c.comment_id,  // DataStore 需�?.id 字段
        comment_id: c.comment_id,
        work_id: c.work_id,
        platform_comment_id: c.platform_comment_id,
        author_name: c.author_name,
        author_id: c.author_id,
        content: c.content,
        create_time: c.create_time,
        detected_at: c.detected_at,
        is_new: c.is_new ? 1 : 0,
        parent_comment_id: c.parent_comment_id
      })),
      conversations: conversations.map(conv => ({
        id: conv.conversation_id,  // DataStore 需�?.id 字段
        conversation_id: conv.conversation_id,
        participant: JSON.parse(conv.participant_info || '{}'),
        create_time: conv.create_time,
        update_time: conv.update_time,
        unread_count: conv.unread_count || 0
      })),
      messages: messages.map(m => ({
        id: m.msg_id,  // DataStore 需�?.id 字段
        msg_id: m.msg_id,
        conversation_id: m.conversation_id,
        sender: JSON.parse(m.sender_info || '{}'),
        content: m.content,
        msg_type: m.msg_type,
        create_time: m.create_time,
        detected_at: m.detected_at
      }))
    }
  };

  console.log('   �?数据格式化完成\n');

  // 3. 连接�?Master 并模�?Worker 推送数�?  console.log('3. 连接�?Master 并推送数�?..');

  const socket = io('http://localhost:3000/worker', {
    reconnection: false
  });

  socket.on('connect', () => {
    console.log('   �?已连接到 Master\n');

    // 发送数据同步消�?    console.log('4. 发�?WORKER_DATA_SYNC 消息...');
    socket.emit('worker:data_sync', {
      workerId: 'test-data-loader',
      accountId: account.id,
      snapshot: dataStoreData
    });

    console.log('   �?数据已发送\n');

    // 等待确认
    setTimeout(() => {
      console.log('========================================');
      console.log('数据加载完成');
      console.log('现在可以�?CRM PC IM 中查看数�?);
      console.log('========================================');
      socket.disconnect();
      process.exit(0);
    }, 2000);
  });

  socket.on('connect_error', (error) => {
    console.error('�?连接错误:', error.message);
    process.exit(1);
  });
}

// 运行脚本
loadDataToDataStore().catch((error) => {
  console.error('�?加载失败:', error);
  process.exit(1);
});
