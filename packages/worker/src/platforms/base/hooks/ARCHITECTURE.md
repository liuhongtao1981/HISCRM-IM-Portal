# 实时监控 Hook 架构重构总结

## 🎯 重构目标

将原本包含抖音特定代码的 Hook 脚本重构为**通用框架 + 平台配置**的架构,实现代码复用和平台解耦。

## 📊 重构前 vs 重构后

### 重构前 (单体架构)

```
react-fiber-array-hook.js (764 行)
├── React Fiber 提取逻辑
├── Mobx 监听逻辑
├── 数组劫持逻辑
├── 抖音特定选择器: '[data-e2e="im-entry"]'
├── 抖音特定 Store: imStore, noticeStore
├── 抖音特定数据处理: handleMessage, handleComment
└── 自动初始化逻辑

❌ 问题:
- 平台特定代码和通用逻辑混在一起
- 无法直接复用到其他平台
- 维护困难,修改框架会影响平台逻辑
```

### 重构后 (分层架构)

```
┌─────────────────────────────────────────────────┐
│  base-realtime-hook.js (通用框架层)              │
│  - React Fiber Store 提取 (平台无关)            │
│  - Mobx observe API 监听 (通用方法)             │
│  - 数组劫持降级方案                              │
│  - 深度路径获取工具                              │
│  - 健康检查和诊断 API                            │
│  - 配置驱动的初始化引擎                          │
└─────────────────────────────────────────────────┘
                        ↓
                  接收配置对象
                        ↓
┌─────────────────────────────────────────────────┐
│  douyin-realtime-config.js (平台配置层)         │
│  - 抖音 Store 定义: imStore, noticeStore        │
│  - 抖音 DOM 选择器: '[data-e2e="im-entry"]'     │
│  - 抖音数据处理器: handleMessage, handleComment │
│  - 平台特定选项配置                              │
│  - 自动初始化和重试逻辑                          │
└─────────────────────────────────────────────────┘

✅ 优势:
- 框架层完全平台无关,可复用
- 平台逻辑独立,不影响框架
- 新平台只需编写配置文件
- 职责清晰,易于维护和测试
```

## 📁 文件结构

### 新增文件

```
packages/worker/src/platforms/
├── base/
│   └── hooks/
│       ├── base-realtime-hook.js       ✨ 新增 - 通用框架
│       └── README.md                   ✨ 新增 - 使用文档
└── douyin/
    └── hooks/
        └── douyin-realtime-config.js   ✨ 新增 - 抖音配置
```

### 删除文件

```
packages/worker/src/platforms/base/hooks/
├── react-fiber-array-hook.js          ❌ 已删除 - 旧版本 (v3.1)
├── react-fiber-array-hook-v2.js       ❌ 已删除 - 未使用
└── imstore-polling-monitor.js         ❌ 已删除 - 轮询方案
```

### 修改文件

```
packages/worker/src/platforms/douyin/
└── realtime-monitor.js                 🔧 已更新 - 注入逻辑
    - 修改: installHooks() 方法
    - 改为先注入通用框架,再注入平台配置
```

## 🔑 核心设计

### 1. 通用框架 API

```javascript
// packages/worker/src/platforms/base/hooks/base-realtime-hook.js

window.__initRealtimeHook(config) -> {
  success: boolean,
  installedCount: number,
  stores: Object,
  disposers: Array
}

// 配置结构
config = {
  stores: [
    {
      name: 'storeName',
      selectors: ['selector1', 'selector2'],
      arrays: [
        {
          path: 'path.to.array',
          handler: 'handlerName',
          enabled: true
        }
      ]
    }
  ],
  handlers: {
    handlerName: (data) => { ... }
  },
  options: {
    debug: true,
    retryInterval: 3000,
    maxRetries: 3
  }
}
```

### 2. 平台配置实现

```javascript
// packages/worker/src/platforms/douyin/hooks/douyin-realtime-config.js

function getDouyinRealtimeConfig() {
  return {
    stores: [
      {
        name: 'imStore',
        selectors: ['[data-e2e="im-entry"]'],
        arrays: [{ path: 'msgListToPush', handler: 'message', enabled: true }]
      }
    ],
    handlers: {
      message: (msg) => {
        // 抖音特定的私信处理逻辑
        window.__sendRealtimeData({ type: 'message', data: msg });
      }
    },
    options: { debug: true }
  };
}

// 自动初始化
(function() {
  const config = getDouyinRealtimeConfig();
  window.__initRealtimeHook(config);
})();
```

### 3. 注入流程

```javascript
// packages/worker/src/platforms/douyin/realtime-monitor.js

async installHooks() {
  // 步骤 1: 注入通用框架 (提供 __initRealtimeHook API)
  const baseHookPath = path.join(__dirname, '..', 'base', 'hooks', 'base-realtime-hook.js');
  await this.page.addScriptTag({ path: baseHookPath });
  
  await this.page.waitForTimeout(500);
  
  // 步骤 2: 注入平台配置 (调用 __initRealtimeHook)
  const configPath = path.join(__dirname, 'hooks', 'douyin-realtime-config.js');
  await this.page.addScriptTag({ path: configPath });
  
  // 配置脚本会自动调用框架初始化
}
```

## 🚀 扩展新平台

### 示例: 快手平台

只需创建配置文件:

```javascript
// packages/worker/src/platforms/kuaishou/hooks/kuaishou-realtime-config.js

function getKuaishouRealtimeConfig() {
  
  function handleMessage(msg) {
    // 快手特定的消息处理
    window.__sendRealtimeData({ type: 'message', data: msg });
  }

  return {
    stores: [
      {
        name: 'chatStore',              // 快手的 Store 名称
        selectors: ['.chat-button'],    // 快手的选择器
        arrays: [
          {
            path: 'messageQueue',       // 快手的数组路径
            handler: 'message',
            enabled: true
          }
        ]
      }
    ],
    handlers: {
      message: handleMessage
    },
    options: {
      debug: true,
      retryInterval: 2000
    }
  };
}

// 自动初始化
(function() {
  const config = getKuaishouRealtimeConfig();
  window.__initRealtimeHook(config);
})();
```

然后在 `kuaishou/realtime-monitor.js` 中注入即可,无需修改通用框架!

## 📈 技术亮点

### 1. 配置驱动

通过配置对象控制所有行为,框架本身无需修改

### 2. 深度路径支持

```javascript
{
  path: 'noticeListObj.noticeList'  // 支持 a.b.c 深度访问
}
```

框架自动使用 `getByPath()` 工具函数获取嵌套属性

### 3. 条件启用

```javascript
{
  path: 'someArray',
  handler: 'someHandler',
  enabled: false  // 可以临时禁用,无需删除配置
}
```

### 4. 多种查找策略

框架自动尝试 3 种查找 Store 的方式:
1. 从配置的选择器入口查找
2. 从 React 根节点查找
3. 遍历页面元素查找

### 5. Mobx + 降级方案

- 优先使用 Mobx `observe_` API (零侵入)
- 失败时自动降级为 `push` 方法劫持

### 6. 完整诊断工具

```javascript
window.__diagnoseStores(['imStore'])  // 诊断 Store 位置
window.__checkRealtimeHooks()         // 健康检查
window.__reinitDouyinHook()           // 手动重新初始化
```

## ✅ 验证结果

所有文件语法检查通过:

```bash
✓ base-realtime-hook.js        - 无语法错误
✓ douyin-realtime-config.js    - 无语法错误  
✓ realtime-monitor.js          - 无语法错误
```

## 📝 迁移检查清单

- [x] 创建通用框架 `base-realtime-hook.js`
- [x] 创建平台配置 `douyin-realtime-config.js`
- [x] 更新注入逻辑 `realtime-monitor.js`
- [x] 删除旧版本文件 (3个)
- [x] 语法检查通过
- [x] 编写使用文档 `README.md`
- [x] 编写架构说明 (本文档)

## 🎉 总结

通过这次重构:

1. **代码复用性**: 通用框架可用于任何 React + Mobx 平台
2. **职责分离**: 框架只管"怎么做",配置决定"做什么"
3. **易于扩展**: 新平台无需修改框架,只需编写配置
4. **维护性**: 框架和平台逻辑独立,互不影响
5. **可测试性**: 每层可独立测试

这是一个典型的**策略模式 + 依赖注入**的架构实践! 🚀
