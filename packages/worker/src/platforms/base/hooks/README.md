# 实时监控 Hook 通用框架使用指南

## 📋 概述

实时监控系统现已重构为**通用框架 + 平台配置**的架构模式,实现了平台无关的核心逻辑与平台特定配置的分离。

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                   Node.js 层                             │
│  realtime-monitor.js (注入通用框架 + 平台配置)           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  浏览器注入层                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │  base-realtime-hook.js (通用框架)                 │  │
│  │  - React Fiber Store 提取                        │  │
│  │  - Mobx observe API 监听                         │  │
│  │  - 数组劫持降级方案                               │  │
│  │  - 健康检查和诊断工具                             │  │
│  └──────────────────────────────────────────────────┘  │
│                          ↓                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │  douyin-realtime-config.js (平台配置)            │  │
│  │  - Store 定义 (imStore, noticeStore)            │  │
│  │  - DOM 选择器                                    │  │
│  │  - 数据处理器 (handleMessage, handleComment)    │  │
│  │  - 自动初始化逻辑                                 │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 📂 文件结构

```
packages/worker/src/platforms/
├── base/
│   └── hooks/
│       └── base-realtime-hook.js      # 通用框架 (平台无关)
└── douyin/
    ├── hooks/
    │   └── douyin-realtime-config.js  # 抖音平台配置
    └── realtime-monitor.js            # 注入入口
```

## 🔧 通用框架 API

### `window.__initRealtimeHook(config)`

初始化实时监控 Hook

**参数结构:**

```javascript
{
  stores: [
    {
      name: 'storeName',           // Store 名称
      selectors: ['selector1'],    // DOM 选择器 (查找入口元素)
      arrays: [
        {
          path: 'path.to.array',   // 数组路径 (支持深度路径)
          handler: 'handlerName',  // 处理器名称
          enabled: true            // 是否启用
        }
      ]
    }
  ],
  handlers: {
    handlerName: (data) => { ... }  // 数据处理函数
  },
  options: {
    debug: true,                   // 调试模式
    retryInterval: 3000,           // 重试间隔 (ms)
    maxRetries: 3,                 // 最大重试次数
    maxDepth: 50                   // Fiber 树搜索深度
  }
}
```

**返回值:**

```javascript
{
  success: boolean,          // 是否成功
  installedCount: number,    // 已安装的监听数量
  stores: Object,            // 找到的 Store 对象
  disposers: Array           // Mobx disposer 列表
}
```

### `window.__checkRealtimeHooks()`

健康检查

**返回值:**

```javascript
{
  installed: true,
  timestamp: 1699401600000,
  version: '4.0'
}
```

### `window.__diagnoseStores(storeNames)`

Store 诊断工具

**参数:**
- `storeNames`: `Array<string>` - Store 名称列表

**返回值:**

```javascript
{
  reactRoot: boolean,        // 是否找到 React 根节点
  fiberKeys: Array,          // Fiber keys
  storesFound: Array         // 找到的 Store 位置
}
```

## 🎯 为新平台添加支持

### 步骤 1: 创建平台配置文件

在 `packages/worker/src/platforms/YOUR_PLATFORM/hooks/` 下创建配置文件:

```javascript
// your-platform-realtime-config.js

function getYourPlatformRealtimeConfig() {
  
  // 1. 定义数据处理器
  function handleMessage(msg) {
    // 处理私信逻辑
    if (typeof window.__sendRealtimeData === 'function') {
      window.__sendRealtimeData({
        type: 'message',
        data: msg,
        timestamp: Date.now()
      });
    }
  }

  function handleComment(comment) {
    // 处理评论逻辑
    if (typeof window.__sendRealtimeData === 'function') {
      window.__sendRealtimeData({
        type: 'comment',
        data: comment,
        timestamp: Date.now()
      });
    }
  }

  // 2. 返回配置
  return {
    stores: [
      {
        name: 'messageStore',           // 你的平台的 Store 名称
        selectors: [
          '[data-message-entry]',       // 入口元素选择器
          '.message-container'
        ],
        arrays: [
          {
            path: 'messages',           // 消息数组路径
            handler: 'message',
            enabled: true
          }
        ]
      },
      {
        name: 'commentStore',
        selectors: ['.comment-section'],
        arrays: [
          {
            path: 'comments.list',
            handler: 'comment',
            enabled: true
          }
        ]
      }
    ],

    handlers: {
      message: handleMessage,
      comment: handleComment
    },

    options: {
      debug: true,
      retryInterval: 3000,
      maxRetries: 3
    }
  };
}

// 3. 自动初始化逻辑
(function() {
  'use strict';

  function initialize() {
    if (typeof window.__initRealtimeHook !== 'function') {
      console.error('通用框架未加载');
      return { success: false };
    }

    const config = getYourPlatformRealtimeConfig();
    return window.__initRealtimeHook(config);
  }

  function initializeWithRetry(currentRetry = 0, maxRetries = 3) {
    const result = initialize();

    if (!result.success && currentRetry < maxRetries) {
      setTimeout(() => {
        initializeWithRetry(currentRetry + 1, maxRetries);
      }, 3000);
    }

    return result;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(() => initializeWithRetry(), 1000);
    });
  } else {
    setTimeout(() => initializeWithRetry(), 1000);
  }

  // 暴露手动初始化函数
  window.__reinitYourPlatformHook = function() {
    return initialize();
  };
})();
```

### 步骤 2: 更新 realtime-monitor.js

在你的平台的 `realtime-monitor.js` 中注入脚本:

```javascript
async installHooks() {
  try {
    // 1. 等待页面加载
    await this.page.waitForSelector('#root', { timeout: 10000 });
    await this.page.waitForTimeout(2000);

    // 2. 注入通用框架
    const baseHookPath = path.join(
      __dirname, '..', 'base', 'hooks', 'base-realtime-hook.js'
    );
    await this.page.addScriptTag({ path: baseHookPath });
    console.log('通用框架已注入');

    await this.page.waitForTimeout(500);

    // 3. 注入平台配置
    const configPath = path.join(
      __dirname, 'hooks', 'your-platform-realtime-config.js'
    );
    await this.page.addScriptTag({ path: configPath });
    console.log('平台配置已注入');

    await this.page.waitForTimeout(1000);

    // 4. 验证安装
    const installed = await this.page.evaluate(() => {
      return typeof window.__checkRealtimeHooks === 'function';
    });

    if (installed) {
      this.hooksInstalled = true;
      logger.info('实时监控安装成功');
    } else {
      logger.warn('实时监控验证失败');
    }
  } catch (error) {
    logger.error('安装失败:', error);
    throw error;
  }
}
```

### 步骤 3: 测试

1. **启动 Worker**
2. **打开浏览器控制台**,查看日志:
   ```
   🚀 [BaseHook] 通用框架加载...
   ✅ [BaseHook] 通用框架加载完成
   🚀 [YourPlatform] 配置脚本加载...
   ✅ [BaseHook] ========== 初始化成功! (2 个监听) ==========
   ```
3. **手动测试**:
   ```javascript
   // 重新初始化
   window.__reinitYourPlatformHook()

   // 诊断 Store
   window.__diagnoseStores(['messageStore', 'commentStore'])

   // 检查健康状态
   window.__checkRealtimeHooks()
   ```

## 🐛 调试技巧

### 1. 启用调试模式

在配置中设置 `options.debug = true`

### 2. 手动诊断 Store

```javascript
// 查找所有可能的 Store
window.__diagnoseStores(['imStore', 'messageStore', 'commentStore'])
```

### 3. 检查 React Fiber

```javascript
// 查看根节点的 Fiber keys
const root = document.querySelector('#root');
Object.keys(root).filter(k => k.startsWith('__react'))
```

### 4. 验证 Mobx

```javascript
// 检查数组是否是 Mobx Observable
const store = window.__diagnoseStores(['imStore']).stores.imStore;
const arr = store.msgListToPush;
Object.getOwnPropertySymbols(arr).map(s => s.toString())
// 应该看到: Symbol(mobx administration)
```

## 📝 配置示例

### 抖音平台 (已实现)

```javascript
{
  stores: [
    {
      name: 'imStore',
      selectors: [
        '[data-e2e="im-entry"]',
        '[class*="im-entry"]'
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
      name: 'noticeStore',
      selectors: [],
      arrays: [
        {
          path: 'noticeListObj.noticeList',
          handler: 'comment',
          enabled: false  // 通过 API 拦截
        }
      ]
    }
  ],
  handlers: {
    message: handleMessage,
    comment: handleComment
  },
  options: {
    debug: true,
    retryInterval: 3000,
    maxRetries: 3
  }
}
```

## ✅ 优势

1. **通用性**: 框架层完全平台无关,可复用于任何基于 React + Mobx 的平台
2. **解耦**: 平台特定逻辑完全在配置层,不污染框架代码
3. **可维护**: 新平台只需编写配置文件,无需修改框架
4. **灵活**: 支持多 Store、多数组、深度路径、条件启用
5. **可靠**: 包含 Mobx observe + push 劫持双重降级方案
6. **可调试**: 提供完整的诊断工具和日志系统

## 🔄 迁移说明

旧的 `react-fiber-array-hook.js` 已被拆分为:
- ✅ `base-realtime-hook.js` - 通用框架
- ✅ `douyin-realtime-config.js` - 抖音配置

已删除的文件:
- ❌ `react-fiber-array-hook.js` (v3.1)
- ❌ `react-fiber-array-hook-v2.js`
- ❌ `imstore-polling-monitor.js`

## 📞 支持

遇到问题?

1. 查看浏览器控制台日志
2. 运行 `window.__diagnoseStores()` 诊断
3. 检查 Store 是否正确加载
4. 确认选择器是否匹配页面元素
