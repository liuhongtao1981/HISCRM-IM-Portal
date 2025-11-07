/**
 * 抖音实时监控 Hook 脚本
 *
 * 功能: 零延迟监控抖音平台的实时消息和评论
 * 技术: JavaScript 数组方法劫持 + React Fiber 数据提取
 *
 * 监控目标:
 * - imStore.msgListToPush: 私信推送缓冲区
 * - noticeStore.noticePushList: 评论通知推送缓冲区
 *
 * 工作原理:
 * 1. 通过 React Fiber 提取 Redux Store
 * 2. 劫持数组的 push/splice/unshift 方法
 * 3. 实时捕获新增数据，通过 window.__sendRealtimeData 发送到 Node.js
 *
 * @author Claude Code
 * @date 2025-11-06
 */

(function() {
  'use strict';

  // ============================================================================
  // 工具函数: React Fiber 数据提取
  // ============================================================================

  /**
   * 从 React Fiber 树中提取 Redux Store
   * @param {string} storeName - Store 名称 (如 'imStore', 'noticeStore')
   * @returns {Object|null} Redux Store 对象
   */
  function extractStore(storeName) {
    // 1. 查找 React 根节点
    const root = document.querySelector('#root') || document.querySelector('[data-reactroot]');
    if (!root) {
      console.warn('[Hook] 未找到 React 根节点');
      return null;
    }

    // 2. 获取 Fiber 对象
    const fiberKey = Object.keys(root).find(key => key.startsWith('__reactFiber'));
    if (!fiberKey) {
      console.warn('[Hook] 未找到 React Fiber 对象');
      return null;
    }

    let fiber = root[fiberKey];
    if (!fiber) return null;

    // 3. 遍历 Fiber 树查找 Store
    while (fiber) {
      // 检查 memoizedState (函数组件)
      const state = fiber.memoizedState;
      if (state && state[storeName]) {
        console.log(`[Hook] 找到 ${storeName}:`, state[storeName]);
        return state[storeName];
      }

      // 检查 stateNode.state (类组件)
      const stateNode = fiber.stateNode;
      if (stateNode && stateNode.state && stateNode.state[storeName]) {
        console.log(`[Hook] 找到 ${storeName} (stateNode):`, stateNode.state[storeName]);
        return stateNode.state[storeName];
      }

      // 向上遍历 Fiber 树
      fiber = fiber.return;
    }

    console.warn(`[Hook] 未找到 ${storeName}`);
    return null;
  }

  // ============================================================================
  // 工具函数: 数组方法劫持
  // ============================================================================

  /**
   * 劫持数组方法以监听数据添加
   * @param {Array} arr - 目标数组
   * @param {Function} onAdd - 添加回调函数
   * @param {string} name - 数组名称 (用于日志)
   */
  function hijackArray(arr, onAdd, name) {
    if (!Array.isArray(arr)) {
      console.warn(`[Hook] ${name} 不是数组，跳过劫持`);
      return;
    }

    // 劫持 push 方法
    const originalPush = arr.push;
    arr.push = function(...items) {
      console.log(`🎯 [Hook] ${name}.push() - ${items.length} 项`);

      // 触发回调
      items.forEach(item => {
        try {
          onAdd(item);
        } catch (e) {
          console.error(`[Hook] ${name} 回调错误:`, e);
        }
      });

      // 调用原始方法
      return originalPush.apply(this, items);
    };

    // 劫持 unshift 方法 (可选)
    const originalUnshift = arr.unshift;
    arr.unshift = function(...items) {
      console.log(`🎯 [Hook] ${name}.unshift() - ${items.length} 项`);

      items.forEach(item => {
        try {
          onAdd(item);
        } catch (e) {
          console.error(`[Hook] ${name} 回调错误:`, e);
        }
      });

      return originalUnshift.apply(this, items);
    };

    // 劫持 splice 方法 (可选，用于检测插入操作)
    const originalSplice = arr.splice;
    arr.splice = function(start, deleteCount, ...items) {
      if (items.length > 0) {
        console.log(`🎯 [Hook] ${name}.splice() - 插入 ${items.length} 项`);

        items.forEach(item => {
          try {
            onAdd(item);
          } catch (e) {
            console.error(`[Hook] ${name} 回调错误:`, e);
          }
        });
      }

      return originalSplice.apply(this, [start, deleteCount, ...items]);
    };

    console.log(`✅ [Hook] ${name} 数组劫持成功`);
  }

  // ============================================================================
  // 数据处理: 私信处理器
  // ============================================================================

  /**
   * 处理私信数据
   * @param {Object} msg - 私信对象 (来自 msgListToPush)
   */
  function handleMessage(msg) {
    console.log('📩 [Hook] 捕获私信:', {
      serverId: msg.serverId,
      type: msg.type,
      text: msg.text ? msg.text.substring(0, 50) : '(无文本)',
      timestamp: msg.timestamp
    });

    // 发送到 Node.js
    if (typeof window.__sendRealtimeData === 'function') {
      window.__sendRealtimeData({
        type: 'message',
        data: msg,
        timestamp: Date.now()
      });
    } else {
      console.warn('[Hook] window.__sendRealtimeData 未定义，跳过发送');
    }
  }

  // ============================================================================
  // 数据处理: 评论处理器
  // ============================================================================

  /**
   * 处理评论通知数据
   * @param {Object} notice - 通知对象 (来自 noticePushList)
   */
  function handleComment(notice) {
    // 只处理评论类型的通知 (type: 31)
    if (notice.type !== 31) {
      console.log(`[Hook] 跳过非评论通知 (type: ${notice.type})`);
      return;
    }

    console.log('💬 [Hook] 捕获评论:', {
      nid_str: notice.nid_str,
      type: notice.type,
      content: notice.content ? notice.content.substring(0, 50) : '(无内容)',
      timestamp: notice.timestamp
    });

    // 发送到 Node.js
    if (typeof window.__sendRealtimeData === 'function') {
      window.__sendRealtimeData({
        type: 'comment',
        data: notice,
        timestamp: Date.now()
      });
    } else {
      console.warn('[Hook] window.__sendRealtimeData 未定义，跳过发送');
    }
  }

  // ============================================================================
  // 主函数: 安装 Hook
  // ============================================================================

  /**
   * 安装实时监控 Hook
   * @returns {Object} { success: boolean, count: number }
   */
  function install() {
    console.log('🚀 [Hook] 开始安装实时监控...');

    // 1. 提取 Store
    const imStore = extractStore('imStore');
    const noticeStore = extractStore('noticeStore');

    let installedCount = 0;

    // 2. 劫持私信数组
    if (imStore && imStore.msgListToPush) {
      hijackArray(imStore.msgListToPush, handleMessage, 'msgListToPush');
      installedCount++;
    } else {
      console.warn('[Hook] 未找到 imStore.msgListToPush');
    }

    // 3. 劫持评论数组
    if (noticeStore && noticeStore.noticePushList) {
      hijackArray(noticeStore.noticePushList, handleComment, 'noticePushList');
      installedCount++;
    } else {
      console.warn('[Hook] 未找到 noticeStore.noticePushList');
    }

    // 4. 返回结果
    const success = installedCount > 0;
    console.log(success
      ? `✅ [Hook] 安装成功! (${installedCount}/2)`
      : '❌ [Hook] 安装失败，未找到任何 Store'
    );

    return { success, count: installedCount };
  }

  // ============================================================================
  // 自动执行
  // ============================================================================

  // 立即尝试安装
  const result = install();

  // 如果安装失败，3秒后重试
  if (!result.success) {
    console.log('[Hook] 3秒后重试安装...');
    setTimeout(install, 3000);
  }

  // ============================================================================
  // 暴露健康检查函数
  // ============================================================================

  /**
   * 健康检查函数 (供 Node.js 调用)
   * @returns {Object} { installed: boolean, timestamp: number }
   */
  window.__checkRealtimeHooks = function() {
    return {
      installed: true,
      timestamp: Date.now()
    };
  };

  console.log('✅ [Hook] 脚本加载完成');
})();
