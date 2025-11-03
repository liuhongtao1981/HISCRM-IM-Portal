/**
 * 测试数据持久化功能
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const DataStore = require('../packages/master/src/data/data-store');
const { PersistenceManager } = require('../packages/master/src/persistence');

// 使用临时数据库进行测试
const testDbPath = path.join(__dirname, 'test-persistence.db');

// 清理旧的测试数据库
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

console.log('\n🧪 Testing Persistence Functionality');
console.log('='.repeat(80));
console.log(`Test Database: ${testDbPath}\n`);

async function runTests() {
  let db;
  let dataStore;
  let manager;

  try {
    // 1. 初始化数据库
    console.log('📝 Step 1: Initialize database schema...');
    db = new Database(testDbPath);

    // 加载 cache schema
    const schemaPath = path.join(__dirname, '..', 'packages', 'master', 'src', 'database', 'cache-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
    console.log('✅ Database schema initialized\n');

    // 2. 创建 DataStore 和 PersistenceManager
    console.log('📝 Step 2: Create DataStore and PersistenceManager...');
    dataStore = new DataStore();
    manager = new PersistenceManager(db, dataStore, {
      loadOnStartup: false,  // 第一次不加载
      persistOnExit: false,  // 测试中手动控制
      autoCleanup: false,    // 测试中不启动自动清理
    });
    console.log('✅ DataStore and PersistenceManager created\n');

    // 3. 添加测试数据到 DataStore
    console.log('📝 Step 3: Add test data to DataStore...');

    const testData = {
      platform: 'douyin',
      data: {
        comments: [
          {
            id: 'comment_1',
            contentId: 'content_1',
            authorId: 'user_1',
            authorName: '测试用户1',
            content: '这是一条测试评论',
            createdAt: Date.now(),
            isNew: true,
            status: 'active',
          },
          {
            id: 'comment_2',
            contentId: 'content_1',
            authorId: 'user_2',
            authorName: '测试用户2',
            content: '这是第二条测试评论',
            createdAt: Date.now(),
            isNew: true,
            status: 'active',
          },
        ],
        contents: [
          {
            id: 'content_1',
            type: 'video',
            title: '测试视频',
            publishTime: Date.now(),
            viewCount: 1000,
            likeCount: 100,
            commentCount: 2,
          },
        ],
        conversations: [
          {
            id: 'conv_1',
            conversationId: 'conv_1',
            userId: 'user_1',
            userName: '测试用户1',
            lastMessageTime: Date.now(),
            unreadCount: 5,
            status: 'active',
          },
        ],
        messages: [
          {
            id: 'msg_1',
            conversationId: 'conv_1',
            senderId: 'user_1',
            senderName: '测试用户1',
            content: '你好,这是一条测试私信',
            createdAt: Date.now(),
            messageType: 'text',
            isNew: true,
          },
        ],
        notifications: [
          {
            id: 'notif_1',
            type: 'new_comment',
            title: '新评论通知',
            content: '测试用户1评论了你的视频',
            createdAt: Date.now(),
            isRead: false,
          },
        ],
      },
    };

    dataStore.updateAccountData('test_account_1', testData);

    const stats1 = dataStore.getStats();
    console.log('✅ Test data added to DataStore:', {
      accounts: stats1.totalAccounts,
      comments: stats1.totalComments,
      contents: stats1.totalContents,
      conversations: stats1.totalConversations,
      messages: stats1.totalMessages,
    });
    console.log(`   Dirty accounts: ${dataStore.getDirtyAccountsCount()}\n`);

    // 4. 持久化到数据库
    console.log('📝 Step 4: Persist data to database...');
    const persistResult = await manager.persistToDatabase();
    console.log('✅ Data persisted:', {
      success: persistResult.success,
      accounts: persistResult.accounts,
      persisted: persistResult.persisted,
      duration: `${persistResult.duration}ms`,
    });
    console.log(`   Dirty accounts after persist: ${dataStore.getDirtyAccountsCount()}\n`);

    // 5. 验证数据库中的数据
    console.log('📝 Step 5: Verify data in database...');
    const dbComments = db.prepare('SELECT COUNT(*) as count FROM cache_comments').get();
    const dbContents = db.prepare('SELECT COUNT(*) as count FROM cache_contents').get();
    const dbConversations = db.prepare('SELECT COUNT(*) as count FROM cache_conversations').get();
    const dbMessages = db.prepare('SELECT COUNT(*) as count FROM cache_messages').get();
    const dbNotifications = db.prepare('SELECT COUNT(*) as count FROM cache_notifications').get();
    const dbMetadata = db.prepare('SELECT COUNT(*) as count FROM cache_metadata').get();

    console.log('✅ Database contains:', {
      metadata: dbMetadata.count,
      comments: dbComments.count,
      contents: dbContents.count,
      conversations: dbConversations.count,
      messages: dbMessages.count,
      notifications: dbNotifications.count,
    });

    // 验证数据一致性
    if (dbComments.count !== 2 || dbContents.count !== 1 ||
        dbConversations.count !== 1 || dbMessages.count !== 1 ||
        dbNotifications.count !== 1 || dbMetadata.count !== 1) {
      throw new Error('Database data count mismatch!');
    }
    console.log('✅ Data consistency verified\n');

    // 6. 清空内存数据
    console.log('📝 Step 6: Clear memory data...');
    dataStore.clearAll();
    const stats2 = dataStore.getStats();
    console.log('✅ Memory cleared:', {
      accounts: stats2.totalAccounts,
      comments: stats2.totalComments,
      contents: stats2.totalContents,
    });
    console.log('');

    // 7. 从数据库加载数据
    console.log('📝 Step 7: Load data from database...');
    const loadResult = await manager.loadFromDatabase();
    console.log('✅ Data loaded:', loadResult);

    const stats3 = dataStore.getStats();
    console.log('   DataStore stats after load:', {
      accounts: stats3.totalAccounts,
      comments: stats3.totalComments,
      contents: stats3.totalContents,
      conversations: stats3.totalConversations,
      messages: stats3.totalMessages,
    });

    // 验证加载后的数据一致性
    if (stats3.totalComments !== 2 || stats3.totalContents !== 1 ||
        stats3.totalConversations !== 1 || stats3.totalMessages !== 1) {
      throw new Error('Loaded data count mismatch!');
    }
    console.log('✅ Loaded data consistency verified\n');

    // 8. 测试增量持久化
    console.log('📝 Step 8: Test incremental persist...');
    console.log(`   Dirty accounts before update: ${dataStore.getDirtyAccountsCount()}`);

    // 添加新数据
    const newData = {
      platform: 'douyin',
      data: {
        comments: [
          {
            id: 'comment_3',
            contentId: 'content_1',
            authorId: 'user_3',
            authorName: '测试用户3',
            content: '增量持久化测试',
            createdAt: Date.now(),
            isNew: true,
            status: 'active',
          },
        ],
        contents: [],
        conversations: [],
        messages: [],
        notifications: [],
      },
    };

    dataStore.updateAccountData('test_account_1', newData);
    console.log(`   Dirty accounts after update: ${dataStore.getDirtyAccountsCount()}`);

    const incrementalPersist = await manager.persistToDatabase();
    console.log('✅ Incremental persist completed:', {
      persisted: incrementalPersist.persisted,
      duration: `${incrementalPersist.duration}ms`,
    });
    console.log('');

    // 9. 测试数据过期清理
    console.log('📝 Step 9: Test data expiration cleanup...');

    // 添加过期数据
    const oldData = {
      platform: 'douyin',
      data: {
        comments: [
          {
            id: 'comment_old',
            contentId: 'content_1',
            authorId: 'user_old',
            authorName: '过期用户',
            content: '这是过期的评论',
            createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30天前
            isNew: false,
            status: 'active',
          },
        ],
        contents: [],
        conversations: [],
        messages: [],
        notifications: [],
      },
    };

    dataStore.updateAccountData('test_account_1', oldData);

    const statsBefore = dataStore.getStats();
    console.log(`   Comments before cleanup: ${statsBefore.totalComments}`);

    // 清理30天前的评论
    const expireTime = Date.now() - 29 * 24 * 60 * 60 * 1000; // 29天
    const cleanResult = dataStore.cleanExpiredData('comments', expireTime);

    const statsAfter = dataStore.getStats();
    console.log('✅ Cleanup completed:', {
      deleted: cleanResult,
      remaining: statsAfter.totalComments,
    });
    console.log('');

    // 10. 获取统计信息
    console.log('📝 Step 10: Get statistics...');
    const finalStats = manager.getStats();
    console.log('✅ Persistence Manager Stats:');
    console.log('   Persistence:', {
      totalPersists: finalStats.persistence.totalPersists,
      totalLoads: finalStats.persistence.totalLoads,
      totalItemsPersisted: finalStats.persistence.totalItemsPersisted,
      totalItemsLoaded: finalStats.persistence.totalItemsLoaded,
    });
    console.log('   Database:', finalStats.database);
    console.log('   DataStore:', finalStats.dataStore);
    console.log('');

    console.log('='.repeat(80));
    console.log('✅ All tests passed!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    // 清理
    if (db) {
      db.close();
    }

    // 删除测试数据库
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
      console.log(`🧹 Cleaned up test database: ${testDbPath}\n`);
    }
  }
}

// 运行测试
runTests().catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
