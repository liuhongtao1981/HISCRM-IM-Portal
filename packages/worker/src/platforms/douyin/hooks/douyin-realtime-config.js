/**
 * 抖音平台实时监控配置
 * 
 * 📋 功能: 定义抖音特定的 Store、选择器、数据处理逻辑
 * 🏗️ 架构: 平台层配置,由通用框架 (base-realtime-hook.js) 使用
 * 
 * 🔄 双重捕获机制:
 *   1️⃣ Mobx observe (msgListToPush) - 实时性高 (<100ms)
 *      - 主要捕获接收的新消息
 *      - 某些场景也会捕获发送的消息
 * 
 *   2️⃣ 轮询 (lastMessage) - 延迟1秒可接受
 *      - Hook 成功后立即启动
 *      - 捕获所有方向的消息 (incoming + outgoing)
 *      - 作为补充机制,确保不漏消息
 * 
 * 🎯 消息类型过滤:
 *   - 只处理私信类型 (type === 7 文本私信, type === 1 其他私信格式)
 *   - 跳过通知、系统消息等其他类型
 * 
 * ✅ 去重逻辑:
 *   - 使用 msg.serverId 作为唯一标识 (platform_message_id)
 *   - 与爬虫逻辑统一,Master/Worker 自动过滤重复
 * 
 * @date 2025-11-08
 */

/**
 * 获取抖音实时监控配置
 * @returns {Object} Hook 配置对象
 */
function getDouyinRealtimeConfig() {
  
  // 记录已处理的消息 serverId (用于去重)
  const processedMessageIds = new Set();
  let conversationCheckInterval = null;
  let pollingStarted = false;
  
  // ============================================================================
  // 数据处理器: 私信处理
  // ============================================================================
  
  /**
   * 启动会话列表轮询
   * 定期检查所有会话的 lastMessage 是否有新消息
   */
  function startConversationPolling(imStore) {
    if (conversationCheckInterval) {
      console.log('[Douyin] 会话轮询已在运行');
      return;
    }
    
    // ========== 🔥 关键修复: 启动前先记录所有现有消息,避免重复推送历史 ==========
    console.log('📝 [Douyin] 初始化已处理消息列表...');
    if (imStore && imStore.converSationListOrigin) {
      imStore.converSationListOrigin.forEach((conversation) => {
        const lastMsg = conversation.lastMessage || conversation._lastMessage;
        if (lastMsg && lastMsg.serverId) {
          processedMessageIds.add(lastMsg.serverId);
        }
      });
      console.log(`✅ [Douyin] 已记录 ${processedMessageIds.size} 条现有消息,轮询将只捕获新消息`);
    }
    // ========== 修复结束 ==========
    
    console.log('🔄 [Douyin] 启动会话列表轮询 (每1秒检查一次)');
    
    conversationCheckInterval = setInterval(() => {
      if (!imStore || !imStore.converSationListOrigin) {
        return;
      }
      
      const conversations = imStore.converSationListOrigin;
      
      conversations.forEach(conversation => {
        const lastMsg = conversation.lastMessage || conversation._lastMessage;
        if (!lastMsg || !lastMsg.serverId) {
          return;
        }
        
        // 去重: 跳过已处理的消息
        if (processedMessageIds.has(lastMsg.serverId)) {
          return;
        }
        
        // 标记为已处理
        processedMessageIds.add(lastMsg.serverId);
        
        // 🔥 传入 conversation 对象,以便正确判断消息方向
        handleMessage(lastMsg, imStore, false, conversation);
      });
      
      // 定期清理 processedMessageIds (防止内存泄漏)
      if (processedMessageIds.size > 1000) {
        const idsArray = Array.from(processedMessageIds);
        processedMessageIds.clear();
        // 保留最近500个
        idsArray.slice(-500).forEach(id => processedMessageIds.add(id));
      }
    }, 1000); // 每秒检查一次
  }
  
  /**
   * 🔥 Hook 成功后立即发送所有历史私信
   */
  function sendHistoryMessages(imStore) {
    if (!imStore || !imStore.converSationListOrigin) {
      return;
    }
    
    console.log('📨 [Douyin] 发送历史私信...');
    let sentCount = 0;
    let skippedCount = 0;
    
    imStore.converSationListOrigin.forEach((conversation) => {
      const lastMsg = conversation.lastMessage || conversation._lastMessage;
      
      if (lastMsg && lastMsg.serverId) {
        // 记录为已处理,避免轮询重复
        processedMessageIds.add(lastMsg.serverId);
        
        // 只发送私信类型 (handleMessage 内部会再次过滤)
        if (lastMsg.type === 7 || lastMsg.type === 1) {
          // 🔥 传入 conversation 对象以便正确判断方向
          handleMessage(lastMsg, imStore, true, conversation);
          sentCount++;
        } else {
          skippedCount++;
        }
      }
    });
    
    console.log(`✅ [Douyin] 历史私信发送完成: ${sentCount} 条私信, 跳过 ${skippedCount} 条其他类型`);
  }
  
  function handleMessage(msg, imStoreOrConversation, isHistory = false, conversation = null) {
    // 🔥 参数适配: Mobx 监听调用时第二个参数是 imStore, 轮询调用时第四个参数是 conversation
    let imStore = null;
    let actualConversation = conversation;
    
    // 判断第二个参数是 imStore 还是 conversation
    if (imStoreOrConversation) {
      // 如果有 converSationListOrigin,说明是 imStore
      if (imStoreOrConversation.converSationListOrigin) {
        imStore = imStoreOrConversation;
      } 
      // 否则可能是 conversation 对象
      else if (imStoreOrConversation.id || imStoreOrConversation.lastMessage) {
        actualConversation = imStoreOrConversation;
        // conversation 传入了,但没有 imStore,尝试从全局获取
        imStore = window.__douyinImStore;
      }
    }
    
    // 暴露到全局供调试使用
    if (imStore) {
      window.__douyinImStore = imStore;
    }
    window.__lastDouyinMessage = msg;
    
    // 🔥 只处理私信类型 (type === 7 文本私信, type === 1 可能是其他私信格式)
    // 跳过通知、系统消息等其他类型
    if (msg.type !== 7 && msg.type !== 1) {
      // 不输出日志避免刷屏
      return;
    }
    
    // 解析content字段(JSON字符串)
    let textContent = '';
    try {
      if (msg.content) {
        const contentObj = JSON.parse(msg.content);
        textContent = contentObj.text || '';
      }
    } catch (error) {
      console.warn('⚠️ [Douyin] 解析content失败:', error);
    }
    
    console.log('📩 [Douyin] 捕获私信:', {
      serverId: msg.serverId,
      type: msg.type,
      conversationId: msg.conversationId,
      secSender: msg.secSender,
      text: textContent ? textContent.substring(0, 50) : '(无文本)',
      timestamp: msg.timestamp
    });

    // 从会话列表中查找完整的用户信息和会话信息
    let senderName = 'Unknown';
    let userInfo = null;
    let conversationInfo = null;
    
    try {
      if (imStore && msg.conversationId) {
        // 优先使用 conversationMap (O(1)查找),如果不存在则回退到数组查找
        let conversation = imStore.conversationMap?.[msg.conversationId];
        
        // 回退: 如果 conversationMap 不存在,使用 converSationListOrigin 数组
        if (!conversation && imStore.converSationListOrigin) {
          conversation = imStore.converSationListOrigin.find(
            conv => conv.id === msg.conversationId
          );
        }
        
        if (conversation) {
          console.log('✅ [Douyin] 找到匹配的会话:', conversation.id);
          
          // 提取会话信息(使用正确的字段名)
          conversationInfo = {
            conversationId: conversation.id,
            conversationShortId: conversation.shortId,
            lastMessageContent: conversation.coreInfo?.lastMessage?.content || '',
            lastMessageTime: conversation.coreInfo?.lastMessage?.createdTime || 0,
            unreadCount: conversation._badgeCount || 0
          };
          
          // 提取用户信息(从 userInfoFromServerMap 查找)
          const toUserId = conversation.toParticipantUserId;
          if (toUserId && imStore.userInfoFromServerMap) {
            const userInfoFromServer = imStore.userInfoFromServerMap[toUserId];
            
            if (userInfoFromServer) {
              senderName = userInfoFromServer.nickname || userInfoFromServer.unique_id || 'Unknown';
              
              userInfo = {
                userId: userInfoFromServer.uid || toUserId,
                secUid: userInfoFromServer.sec_uid || msg.secSender,
                nickname: userInfoFromServer.nickname || '',
                uniqueId: userInfoFromServer.unique_id || '',
                avatar: userInfoFromServer.avatar_thumb?.url_list?.[0] || '',
                followStatus: userInfoFromServer.follow_status || 0,
                followerStatus: userInfoFromServer.follower_status || 0
              };

              console.log('✅ [Douyin] 找到用户信息:', {
                nickname: senderName,
                userId: userInfo.userId,
                avatar: userInfo.avatar ? '有头像' : '无头像'
              });
            } else {
              console.warn('⚠️ [Douyin] userInfoFromServerMap 中无此用户:', toUserId);
            }
          } else {
            console.warn('⚠️ [Douyin] 无法获取 toParticipantUserId 或 userInfoFromServerMap');
          }
          
          console.log('✅ [Douyin] 找到会话信息:', {
            conversationId: conversationInfo.conversationId,
            unreadCount: conversationInfo.unreadCount
          });
        } else {
          console.warn('⚠️ [Douyin] 未找到对应的会话');
        }
      }
    } catch (error) {
      console.warn('⚠️ [Douyin] 查找用户/会话信息失败:', error);
    }

    // ✅ 改进方向判断逻辑
    // 核心思路: 会话中存储的用户信息是"对方",对比消息的 secSender:
    // - 如果 msg.secSender === 对方的 secUid → incoming (对方发的)
    // - 如果 msg.secSender !== 对方的 secUid → outgoing (自己发的)
    let direction = 'incoming';
    let conversationIdForMessage = msg.secSender; // 默认使用发送人 secUid
    
    // 获取对方的 secUid (从会话的 userInfo)
    const otherUserSecUid = userInfo?.secUid;
    
    // 方法1: 使用 msg.isFromMe (最直接)
    if (msg.isFromMe === true || msg.isFromMe === 1) {
      direction = 'outgoing';
    } 
    // 方法2: 对比 msg.secSender 和会话中对方的 secUid
    else if (otherUserSecUid) {
      if (msg.secSender === otherUserSecUid) {
        // 发送人是对方 → incoming
        direction = 'incoming';
      } else {
        // 发送人不是对方 → outgoing (自己发的)
        direction = 'outgoing';
      }
    }
    // 方法3: 如果没有 userInfo,回退到默认判断
    else if (!msg.isFromMe) {
      console.warn('⚠️ [Douyin] 无法获取对方 secUid,使用默认判断 (incoming)');
    }
    
    // 根据方向设置正确的 conversation_id
    if (direction === 'outgoing') {
      // 发出的消息: 使用接收人的 secUid
      if (userInfo && userInfo.secUid) {
        conversationIdForMessage = userInfo.secUid;
      } else {
        console.warn('⚠️ [Douyin] 无法获取对方 secUid,使用 msg.secSender 作为后备');
      }
    } else {
      // 收到的消息: 使用发送人的 secUid
      conversationIdForMessage = msg.secSender;
    }
    
    // ⭐ 根据方向设置正确的 sender_id 和 sender_name
    let finalSenderId = msg.sender;
    let finalSenderName = senderName;
    
    if (direction === 'outgoing') {
      // 自己发的消息: sender 应该是当前用户
      // 尝试获取当前用户的昵称
      try {
        const currentUserInfo = actualImStore?.selfInfo || actualImStore?.__internal_ctx?.option?.userInfo;
        if (currentUserInfo && currentUserInfo.nickname) {
          finalSenderName = currentUserInfo.nickname;
        } else {
          // 如果获取不到,使用默认值
          finalSenderName = '我';
        }
      } catch (e) {
        finalSenderName = '我';
      }
      // sender_id 已经是正确的 (msg.sender = 当前用户ID)
    } else {
      // 对方发的消息: 使用会话中的对方信息
      finalSenderName = senderName; // 已经从 userInfo 获取了对方昵称
      // sender_id 已经是正确的 (msg.sender = 对方用户ID)
    }
    
    console.log('📝 [Douyin] 消息方向判断:', {
      direction: direction,
      method: msg.isFromMe ? 'isFromMe' : (otherUserSecUid ? 'secUid比对' : '默认'),
      msgSecSender: msg.secSender,
      otherUserSecUid: otherUserSecUid,
      isMatch: msg.secSender === otherUserSecUid,
      finalSenderId: finalSenderId,
      finalSenderName: finalSenderName,
      conversation_id: conversationIdForMessage,
      content: textContent.substring(0, 20) + '...'
    });

    // 映射字段到解析器期望的格式
    const mappedData = {
      // 消息标识
      platform_message_id: msg.serverId,
      message_id: msg.serverId,
      
      // ⭐ 会话标识: 使用对方的 secUid
      // - incoming: 使用发送人的 secUid (msg.secSender)
      // - outgoing: 使用接收人的 secUid (从会话对象的 userInfo 获取)
      conversation_id: conversationIdForMessage,
      
      // 内容
      content: textContent,
      type: msg.type || 7, // 抖音消息类型
      
      // ⭐ 发送者信息 (根据方向设置正确的值)
      platform_sender_id: finalSenderId,
      sender_id: finalSenderId,
      platform_sender_name: finalSenderName,
      sender_name: finalSenderName,
      
      // 方向和状态
      direction: direction,
      
      // 时间戳 (秒)
      detected_at: Math.floor(Date.now() / 1000),
      created_at: msg.createdAt ? Math.floor(new Date(msg.createdAt).getTime() / 1000) : Math.floor(Date.now() / 1000),
      create_time: msg.createdAt ? Math.floor(new Date(msg.createdAt).getTime() / 1000) : Math.floor(Date.now() / 1000),
      
      // 其他字段
      sec_uid: conversationIdForMessage, // 统一使用对方的 secUid
      is_group_chat: false,
      
      // 附加完整的用户信息(用于创建/更新会话)
      user_info: userInfo,
      // 附加会话信息(用于创建/更新会话)
      conversation_info: conversationInfo,
      // 保留原始数据用于调试
      __raw: {
        serverId: msg.serverId,
        type: msg.type,
        conversationId: msg.conversationId,
        secSender: msg.secSender,
        sender: msg.sender
      }
    };

    console.log('🔄 [Douyin] 映射后的数据:', {
      platform_message_id: mappedData.platform_message_id,
      conversation_id: mappedData.conversation_id,
      sender_id: mappedData.sender_id,
      sender_name: mappedData.sender_name,
      content: mappedData.content?.substring(0, 50) || '',
      direction: mappedData.direction,
      has_user_info: !!mappedData.user_info,
      has_conversation_info: !!mappedData.conversation_info
    });

    // 发送到 Node.js
    if (typeof window.__sendRealtimeData === 'function') {
      try {
        const payload = {
          type: 'message',
          data: mappedData,
          timestamp: Date.now()
        };
        
        console.log('📤 [Douyin] 准备发送数据:', {
          message_id: payload.data.message_id,
          conversation_id: payload.data.conversation_id,
          content: payload.data.content,
          sender_name: payload.data.sender_name,
          created_at: payload.data.created_at,
          has_user_info: !!payload.data.user_info,
          has_conversation_info: !!payload.data.conversation_info
        });
        
        window.__sendRealtimeData(payload);
        console.log('✅ [Douyin] 私信数据已发送');
      } catch (error) {
        console.error('❌ [Douyin] 发送私信数据失败:', error);
      }
    } else {
      console.warn('❌ [Douyin] window.__sendRealtimeData 未定义');
    }
  }

  // ============================================================================
  // 数据处理器: 评论处理 (预留,当前禁用)
  // ============================================================================
  
  function handleComment(notice) {
    // 只处理评论类型的通知 (type: 31)
    if (notice.type !== 31) {
      return;
    }

    console.log('💬 [Douyin] 捕获评论:', {
      nid_str: notice.nid_str,
      type: notice.type,
      content: notice.content ? notice.content.substring(0, 50) : '(无内容)',
      timestamp: notice.timestamp
    });

    if (typeof window.__sendRealtimeData === 'function') {
      window.__sendRealtimeData({
        type: 'comment',
        data: notice,
        timestamp: Date.now()
      });
    }
  }

  // ============================================================================
  // 返回配置对象
  // ============================================================================
  
  return {
    // Store 配置列表
    stores: [
      {
        // 私信 Store
        name: 'imStore',
        selectors: [
          '[data-e2e="im-entry"]',
          '[class*="im-entry"]',
          '[class*="message-entry"]'
        ],
        arrays: [
          {
            // ✅ Mobx 监听 msgListToPush - 捕获实时消息 (低延迟 <100ms)
            // 主要用于接收新消息,但发送消息也会触发
            path: 'msgListToPush',
            handler: 'message',
            enabled: true
          }
        ]
        // 注: 会话轮询在 Hook 成功后立即启动,作为补充捕获机制
      },
      {
        // 评论通知 Store (当前禁用,通过 API 拦截实现)
        name: 'noticeStore',
        selectors: [],
        arrays: [
          {
            path: 'noticeListObj.noticeList',
            handler: 'comment',
            enabled: false  // ⚠️ 已禁用: 评论通过 API 拦截获取,更可靠
          }
        ]
      }
    ],

    // 数据处理器映射
    handlers: {
      message: handleMessage,
      comment: handleComment
    },

    // 全局选项
    options: {
      debug: true,
      retryInterval: 3000,
      maxRetries: 3,
      maxDepth: 50
    },
    
    // 🔥 新增: Hook 成功回调 - 立即启动轮询和发送历史消息
    onSuccess: function(result) {
      console.log('🎉 [Douyin] Hook 初始化成功,开始启动轮询和发送历史消息...');
      
      // 获取 imStore
      const imStore = result.stores?.imStore;
      if (!imStore) {
        console.warn('⚠️ [Douyin] 未找到 imStore,无法启动轮询');
        return;
      }
      
      // 1. 启动会话轮询 (用于捕获手动发送的消息)
      if (!pollingStarted) {
        pollingStarted = true;
        console.log('🚀 [Douyin] 启动会话轮询...');
        startConversationPolling(imStore);
      }
      
      // 2. 发送所有历史私信 (会话列表中的最后一条私信)
      setTimeout(() => {
        sendHistoryMessages(imStore);
      }, 1000); // 延迟1秒,确保轮询已记录ID
    }
  };
}

// ============================================================================
// 自动初始化
// ============================================================================

(function() {
  'use strict';

  console.log('🚀 [Douyin] 抖音实时监控配置脚本加载...');

  /**
   * 执行初始化
   */
  function initialize() {
    // 检查通用框架是否已加载
    if (typeof window.__initRealtimeHook !== 'function') {
      console.error('❌ [Douyin] 通用框架未加载 (__initRealtimeHook 未定义)');
      return { success: false, error: 'Base hook not loaded' };
    }

    // 获取配置
    const config = getDouyinRealtimeConfig();
    console.log('📋 [Douyin] 配置已生成:', config);

    // 初始化 Hook
    const result = window.__initRealtimeHook(config);
    console.log('📊 [Douyin] 初始化结果:', result);

    return result;
  }

  /**
   * 带重试的初始化
   */
  function initializeWithRetry(currentRetry = 0, maxRetries = 3) {
    console.log(`🔄 [Douyin] 尝试初始化 (${currentRetry + 1}/${maxRetries + 1})...`);

    const result = initialize();

    if (!result.success && currentRetry < maxRetries) {
      const delay = 3000;
      console.log(`⏳ [Douyin] ${delay}ms 后重试...`);
      setTimeout(() => {
        initializeWithRetry(currentRetry + 1, maxRetries);
      }, delay);
    } else if (result.success) {
      console.log(`✅ [Douyin] 初始化成功 (${result.installedCount} 个监听)`);
    } else {
      console.warn('⚠️ [Douyin] 多次重试后仍未成功，可能需要用户交互');
    }

    return result;
  }

  // 等待 DOM 完全加载
  if (document.readyState === 'loading') {
    console.log('[Douyin] ⏳ DOM 正在加载，等待 DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', function() {
      console.log('[Douyin] ✅ DOMContentLoaded 触发');
      setTimeout(() => initializeWithRetry(), 1000);
    });
  } else {
    console.log('[Douyin] ✅ DOM 已加载');
    // 延迟 1 秒执行,确保通用框架已初始化
    setTimeout(() => initializeWithRetry(), 1000);
  }

  // ============================================================================
  // 暴露手动初始化函数
  // ============================================================================

  /**
   * 手动重新初始化 (用于调试)
   */
  window.__reinitDouyinHook = function() {
    console.log('🔄 [Douyin] 手动重新初始化...');
    return initialize();
  };

  console.log('✅ [Douyin] 配置脚本加载完成');
  console.log('💡 [Douyin] 可用命令:');
  console.log('   - window.__reinitDouyinHook() : 重新初始化');
  console.log('   - window.__diagnoseStores(["imStore", "noticeStore"]) : 诊断 Store');
})();
