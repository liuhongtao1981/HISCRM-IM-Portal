/**
 * 抖音平台实时监控配置
 * 
 * 功能: 定义抖音特定的 Store、选择器、数据处理逻辑
 * 架构: 平台层配置,由通用框架 (base-realtime-hook.js) 使用
 * 
 * @date 2025-11-08
 */

/**
 * 获取抖音实时监控配置
 * @returns {Object} Hook 配置对象
 */
function getDouyinRealtimeConfig() {
  
  // ============================================================================
  // 数据处理器: 私信处理
  // ============================================================================
  
  function handleMessage(msg) {
    console.log('📩 [Douyin] 捕获私信:', {
      serverId: msg.serverId,
      type: msg.type,
      text: msg.text ? msg.text.substring(0, 50) : '(无文本)',
      timestamp: msg.timestamp
    });

    // 发送到 Node.js
    if (typeof window.__sendRealtimeData === 'function') {
      try {
        window.__sendRealtimeData({
          type: 'message',
          data: msg,
          timestamp: Date.now()
        });
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
            path: 'msgListToPush',
            handler: 'message',
            enabled: true
          }
        ]
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
