/**
 * 通用实时监控 Hook 框架
 * 
 * 功能: 提供通用的 React Fiber Store 提取和 Mobx 监听能力
 * 架构: 纯框架层,不包含平台特定逻辑
 * 
 * 使用方式:
 * ```javascript
 * window.__initRealtimeHook({
 *   stores: [
 *     {
 *       name: 'imStore',
 *       selectors: ['[data-e2e="im-entry"]'],
 *       arrays: [
 *         {
 *           path: 'msgListToPush',
 *           handler: 'message',
 *           enabled: true
 *         }
 *       ]
 *     }
 *   ],
 *   handlers: {
 *     message: (data) => { ... }
 *   },
 *   options: {
 *     retryInterval: 3000,
 *     maxRetries: 3,
 *     debug: true
 *   }
 * });
 * ```
 * 
 * @version 4.0 - 通用框架版本
 * @date 2025-11-08
 */

(function() {
  'use strict';

  console.log('🚀 [BaseHook] 通用实时监控框架加载...');

  // ============================================================================
  // 核心工具: React Fiber Store 提取
  // ============================================================================

  /**
   * 从 React Fiber 树中提取 Store
   * @param {string} storeName - Store 名称
   * @param {Array<string>} selectors - DOM 选择器列表 (用于查找入口元素)
   * @param {Object} options - 配置选项
   * @returns {Object|null} Store 对象
   */
  function extractStore(storeName, selectors = [], options = {}) {
    const { debug = false, maxDepth = 50 } = options;

    if (debug) {
      console.log(`[BaseHook] ========== 开始查找 ${storeName} ==========`);
    }

    // 方法1: 从特定的入口元素开始查找
    if (selectors.length > 0) {
      if (debug) console.log(`[BaseHook] 方法1: 从入口元素查找 (${selectors.length} 个选择器)...`);
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          if (debug) console.log(`[BaseHook] 找到入口元素: ${selector}`);
          const store = searchFiberForStore(element, storeName, 30, debug);
          if (store) {
            if (debug) console.log(`✅ [BaseHook] 方法1成功: 从入口元素找到 ${storeName}`);
            return store;
          }
        }
      }
    }

    // 方法2: 从根节点开始查找
    if (debug) console.log('[BaseHook] 方法2: 从根节点查找...');
    const root = document.querySelector('#root') || document.querySelector('[data-reactroot]');
    if (root) {
      const store = searchFiberForStore(root, storeName, maxDepth, debug);
      if (store) {
        if (debug) console.log(`✅ [BaseHook] 方法2成功: 从根节点找到 ${storeName}`);
        return store;
      }
    }

    // 方法3: 遍历页面元素查找（最后的备用方案）
    if (debug) console.log('[BaseHook] 方法3: 遍历页面元素查找...');
    const elements = document.querySelectorAll('*');
    const maxElements = Math.min(elements.length, 500);
    
    for (let i = 0; i < maxElements; i++) {
      const store = searchFiberForStore(elements[i], storeName, 20, debug);
      if (store) {
        if (debug) console.log(`✅ [BaseHook] 方法3成功: 从元素${i}找到 ${storeName}`);
        return store;
      }
    }

    if (debug) console.warn(`❌ [BaseHook] 所有方法都失败，未找到 ${storeName}`);
    return null;
  }

  /**
   * 从指定元素的 Fiber 树中搜索 Store
   * @param {HTMLElement} element - DOM元素
   * @param {string} storeName - Store名称
   * @param {number} maxDepth - 最大搜索深度
   * @param {boolean} debug - 是否输出调试信息
   * @returns {Object|null}
   */
  function searchFiberForStore(element, storeName, maxDepth, debug = false) {
    if (!element) return null;

    const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber'));
    if (!fiberKey) return null;

    let fiber = element[fiberKey];
    if (!fiber) return null;

    let depth = 0;

    while (fiber && depth < maxDepth) {
      // 检查所有可能的位置
      const locations = [
        { name: 'memoizedProps', obj: fiber.memoizedProps },
        { name: 'memoizedState', obj: fiber.memoizedState },
        { name: 'stateNode.props', obj: fiber.stateNode?.props },
        { name: 'stateNode.state', obj: fiber.stateNode?.state }
      ];

      for (const loc of locations) {
        if (loc.obj && loc.obj[storeName]) {
          if (debug) console.log(`✅ [BaseHook] 在 ${loc.name} 找到 ${storeName} (depth: ${depth})`);
          return loc.obj[storeName];
        }
      }

      fiber = fiber.return;
      depth++;
    }

    return null;
  }

  // ============================================================================
  // 核心工具: Mobx 数组监听
  // ============================================================================

  /**
   * 使用 Mobx observe API 监听数组变化
   * @param {Array} arr - 目标数组 (Mobx Observable Array)
   * @param {Function} onAdd - 添加回调函数
   * @param {string} name - 数组名称 (用于日志)
   * @param {Object} options - 配置选项
   * @returns {Object|null} { success: boolean, disposer: Function|null }
   */
  function observeArray(arr, onAdd, name, options = {}) {
    const { debug = false } = options;

    if (debug) console.log(`🔧 [BaseHook] 监听数组: ${name}`);
    
    if (!Array.isArray(arr)) {
      if (debug) console.warn(`[BaseHook] ${name} 不是数组，跳过监听`);
      return { success: false, disposer: null };
    }

    // 1. 检查数组是否已经被监听过
    if (arr.__hijackSignature) {
      if (debug) console.warn(`⚠️ [BaseHook] ${name} 已经被监听过，跳过`);
      return { success: false, disposer: null };
    }

    // 2. 为数组添加唯一签名
    const signature = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    arr.__hijackSignature = signature;

    // 3. 尝试使用 Mobx observe API
    try {
      const allSymbols = Object.getOwnPropertySymbols(arr);
      const mobxSymbol = allSymbols.find(s => s.toString().includes('mobx'));
      
      if (mobxSymbol) {
        const mobxObj = arr[mobxSymbol];
        
        if (mobxObj && typeof mobxObj.observe_ === 'function') {
          if (debug) console.log(`✅ [BaseHook] 找到 Mobx observe_ 方法`);
          
          // 使用 Mobx 内部 observe_ API 监听变化
          const disposer = mobxObj.observe_(change => {
            if (debug) console.log(`🎯 [BaseHook] ${name} Mobx 变化事件:`, change.type);
            
            // splice 事件: { type: 'splice', index, removedCount, added, addedCount }
            if (change.type === 'splice' && change.added && change.added.length > 0) {
              if (debug) console.log(`📦 [BaseHook] 新增了 ${change.added.length} 个元素`);
              
              // 克隆新增的数据
              const clonedItems = change.added.map(item => {
                try {
                  return JSON.parse(JSON.stringify(item));
                } catch (e) {
                  if (debug) console.error(`❌ [BaseHook] 数据克隆失败:`, e);
                  return null;
                }
              }).filter(item => item !== null);

              // 异步调用回调
              setTimeout(() => {
                clonedItems.forEach(item => {
                  try {
                    onAdd(item);
                  } catch (e) {
                    console.error(`❌ [BaseHook] ${name} 回调错误:`, e);
                  }
                });
              }, 0);
            }
          });
          
          if (debug) console.log(`✅ [BaseHook] ${name} Mobx observe 监听已启动`);
          return { success: true, disposer };
        }
      }
      
    } catch (error) {
      if (debug) console.warn(`⚠️ [BaseHook] Mobx observe_ 失败:`, error);
    }

    // 4. 降级方案: 劫持 push 方法
    if (debug) console.log(`🔧 [BaseHook] 使用 push 劫持降级方案...`);
    
    try {
      const originalPush = arr.push;
      
      arr.push = function(...items) {
        const result = originalPush.apply(this, items);
        
        if (items.length > 0) {
          setTimeout(() => {
            items.forEach(item => {
              try {
                const cloned = JSON.parse(JSON.stringify(item));
                onAdd(cloned);
              } catch (e) {
                console.error(`❌ [BaseHook] ${name} 回调错误:`, e);
              }
            });
          }, 0);
        }
        
        return result;
      };
      
      if (debug) console.log(`✅ [BaseHook] ${name} push 方法劫持成功`);
      return { success: true, disposer: null };
    } catch (error) {
      console.error(`❌ [BaseHook] ${name} push 方法劫持失败:`, error);
      return { success: false, disposer: null };
    }
  }

  // ============================================================================
  // 核心工具: 深度路径获取
  // ============================================================================

  /**
   * 从对象中获取深度路径的值
   * @param {Object} obj - 目标对象
   * @param {string} path - 路径字符串 (例如: 'a.b.c')
   * @returns {*} 路径对应的值
   */
  function getByPath(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // ============================================================================
  // 主函数: 初始化 Hook
  // ============================================================================

  /**
   * 初始化实时监控 Hook
   * @param {Object} config - 配置对象
   * @param {Array} config.stores - Store 配置列表
   * @param {Object} config.handlers - 数据处理器映射
   * @param {Object} config.options - 全局配置选项
   * @returns {Object} { success: boolean, installedCount: number, stores: Object }
   */
  window.__initRealtimeHook = function(config) {
    console.log('🚀 [BaseHook] ========== 开始初始化实时监控 ==========');
    console.log('[BaseHook] 配置:', config);

    const {
      stores: storeConfigs = [],
      handlers = {},
      options = {}
    } = config;

    const {
      debug = false,
      retryInterval = 3000,
      maxRetries = 3
    } = options;

    if (debug) {
      console.log('[BaseHook] 当前 URL:', window.location.href);
      console.log('[BaseHook] 当前时间:', new Date().toLocaleString());
    }

    const result = {
      success: false,
      installedCount: 0,
      stores: {},
      disposers: []
    };

    // 遍历每个 Store 配置
    for (const storeConfig of storeConfigs) {
      const {
        name: storeName,
        selectors = [],
        arrays = []
      } = storeConfig;

      if (debug) console.log(`[BaseHook] 处理 Store: ${storeName}`);

      // 1. 提取 Store
      const store = extractStore(storeName, selectors, { debug, maxDepth: options.maxDepth || 50 });
      
      if (!store) {
        if (debug) console.warn(`❌ [BaseHook] 未找到 Store: ${storeName}`);
        continue;
      }

      if (debug) console.log(`✅ [BaseHook] 找到 Store: ${storeName}`);
      result.stores[storeName] = store;

      // 2. 监听数组
      for (const arrayConfig of arrays) {
        const {
          path: arrayPath,
          handler: handlerName,
          enabled = true
        } = arrayConfig;

        if (!enabled) {
          if (debug) console.log(`⏭️ [BaseHook] 跳过禁用的数组: ${storeName}.${arrayPath}`);
          continue;
        }

        // 获取数组对象
        const arr = getByPath(store, arrayPath);
        if (!arr) {
          if (debug) console.warn(`❌ [BaseHook] 未找到数组: ${storeName}.${arrayPath}`);
          continue;
        }

        // 获取处理器
        const handler = handlers[handlerName];
        if (typeof handler !== 'function') {
          console.error(`❌ [BaseHook] 未找到处理器: ${handlerName}`);
          continue;
        }

        // 监听数组
        const observeResult = observeArray(
          arr,
          handler,
          `${storeName}.${arrayPath}`,
          { debug }
        );

        if (observeResult.success) {
          result.installedCount++;
          if (observeResult.disposer) {
            result.disposers.push(observeResult.disposer);
          }
          if (debug) console.log(`✅ [BaseHook] 成功监听: ${storeName}.${arrayPath}`);
        }
      }
    }

    // 3. 返回结果
    result.success = result.installedCount > 0;
    
    console.log(result.success
      ? `✅ [BaseHook] ========== 初始化成功! (${result.installedCount} 个监听) ==========`
      : '❌ [BaseHook] ========== 初始化失败，未找到任何 Store =========='
    );

    return result;
  };

  // ============================================================================
  // 健康检查和诊断工具
  // ============================================================================

  /**
   * 健康检查函数 (供 Node.js 调用)
   */
  window.__checkRealtimeHooks = function() {
    return {
      installed: true,
      timestamp: Date.now(),
      version: '4.0'
    };
  };

  /**
   * Store 诊断工具
   * @param {Array<string>} storeNames - 要诊断的 Store 名称列表
   * @returns {Object} 诊断结果
   */
  window.__diagnoseStores = function(storeNames = []) {
    console.log('🔍 [BaseHook] ========== Store 诊断工具 ==========');
    
    const results = {
      reactRoot: null,
      fiberKeys: [],
      storesFound: []
    };

    // 1. 查找 React 根节点
    const root = document.querySelector('#root') || document.querySelector('[data-reactroot]');
    results.reactRoot = !!root;
    console.log('1. React 根节点:', results.reactRoot ? '✅ 找到' : '❌ 未找到');

    if (!root) return results;

    // 2. 查找 Fiber keys
    results.fiberKeys = Object.keys(root).filter(k => k.startsWith('__react'));
    console.log('2. Fiber Keys:', results.fiberKeys);

    // 3. 遍历元素查找 Store
    const elements = document.querySelectorAll('*');
    const maxCheck = Math.min(elements.length, 1000);
    console.log(`3. 检查前 ${maxCheck} 个元素...`);

    for (let i = 0; i < maxCheck; i++) {
      const el = elements[i];
      const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) continue;

      const fiber = el[fiberKey];
      if (!fiber) continue;

      const checkLocations = [
        { name: 'memoizedProps', obj: fiber.memoizedProps },
        { name: 'memoizedState', obj: fiber.memoizedState },
        { name: 'stateNode.props', obj: fiber.stateNode?.props },
        { name: 'stateNode.state', obj: fiber.stateNode?.state }
      ];

      for (const loc of checkLocations) {
        if (loc.obj) {
          for (const storeName of storeNames) {
            if (loc.obj[storeName]) {
              results.storesFound.push({ 
                element: i, 
                location: loc.name, 
                store: storeName
              });
              console.log(`✅ 元素${i} - ${loc.name} - 找到 ${storeName}`);
            }
          }
        }
      }
    }

    console.log('4. 诊断结果总结:', results);
    return results;
  };

  console.log('✅ [BaseHook] 通用框架加载完成');
  console.log('💡 [BaseHook] 使用 window.__initRealtimeHook(config) 初始化');
})();
