# IM拖拽删除账号功能实现

## 功能描述

在IM客户端的监控页面中，用户可以通过拖拽账号到回收站图标来删除账号，提供了更直观和友好的删除交互体验。

## 交互流程

1. 用户在左侧账号列表中按住并拖动账号
2. 拖动时，左侧列表下方（添加账号按钮上方）显示回收站图标
3. 拖动账号到回收站图标上方时，回收站高亮显示（背景变红色）
4. 松开鼠标后，弹出确认对话框
5. 用户确认删除后，调用WebSocket API删除账号
6. 账号列表自动更新

## 实现细节

### 1. Master服务器端（WebSocket消息处理）

**文件**：[packages/master/src/communication/im-websocket-server.js](packages/master/src/communication/im-websocket-server.js)

#### 添加删除账号消息监听器（第112-115行）

```javascript
// 删除账号
socket.on('monitor:delete_account', (data) => {
    this.handleDeleteAccount(socket, data);
});
```

#### 实现删除账号处理器（第2022-2100行）

```javascript
/**
 * 处理删除账号请求
 */
async handleDeleteAccount(socket, data) {
    try {
        logger.info('[IM WS] Received delete account request:', data);

        if (!this.accountDAO) {
            socket.emit('monitor:delete_account_result', {
                success: false,
                error: '账号删除功能未启用（缺少 AccountDAO）'
            });
            return;
        }

        const { accountId } = data;

        // 验证必填字段
        if (!accountId) {
            socket.emit('monitor:delete_account_result', {
                success: false,
                error: '缺少必填字段：accountId'
            });
            return;
        }

        // 检查账号是否存在
        const account = this.accountDAO.findById(accountId);
        if (!account) {
            socket.emit('monitor:delete_account_result', {
                success: false,
                error: '账号不存在'
            });
            return;
        }

        // ✅ 在删除前触发任务撤销逻辑（和 web-admin HTTP API 一样）
        if (this.accountAssigner) {
            this.accountAssigner.revokeDeletedAccount(accountId);
            logger.info(`[IM WS] Revoked tasks for account ${accountId}`);
        }

        // 删除账号
        const deleted = this.accountDAO.delete(accountId);

        if (!deleted) {
            socket.emit('monitor:delete_account_result', {
                success: false,
                error: '删除账号失败'
            });
            return;
        }

        logger.info('[IM WS] Account deleted successfully:', accountId);

        // 从 DataStore 中删除账号（清理内存缓存）
        if (this.dataStore && this.dataStore.accounts) {
            this.dataStore.accounts.delete(accountId);
            logger.info(`[IM WS] Removed account from DataStore: ${accountId}`);
        }

        // 通知客户端删除成功
        socket.emit('monitor:delete_account_result', {
            success: true,
            accountId: accountId
        });

        // 广播更新账户列表到所有监控客户端
        const channels = this.getChannelsFromDataStore();
        this.broadcastToMonitors('monitor:channels', { channels });

    } catch (error) {
        logger.error('[IM WS] Failed to delete account:', error);
        socket.emit('monitor:delete_account_result', {
            success: false,
            error: error.message || '删除账号失败'
        });
    }
}
```

**关键特性**：
- ✅ 调用 `accountAssigner.revokeDeletedAccount()` 撤销Worker任务
- ✅ 从数据库和DataStore中删除账号
- ✅ 广播更新账户列表到所有客户端
- ✅ 与web-admin的HTTP API保持一致的删除逻辑

### 2. IM客户端（React组件）

**文件**：[packages/crm-pc-im/src/pages/MonitorPage.tsx](packages/crm-pc-im/src/pages/MonitorPage.tsx)

#### 添加拖拽相关状态（第79-82行）

```typescript
// 拖拽删除相关状态
const [isDragging, setIsDragging] = useState(false) // 是否正在拖拽
const [draggingChannelId, setDraggingChannelId] = useState<string | null>(null) // 正在拖拽的账号ID
const [isOverTrash, setIsOverTrash] = useState(false) // 是否拖拽到回收站上方
```

#### 实现拖拽事件处理器（第1029-1077行）

```typescript
// 拖拽开始
const handleDragStart = (e: React.DragEvent, channelId: string) => {
  console.log('[拖拽] 开始拖拽账号:', channelId)
  setIsDragging(true)
  setDraggingChannelId(channelId)
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', channelId)
}

// 拖拽结束
const handleDragEnd = (e: React.DragEvent) => {
  console.log('[拖拽] 结束拖拽')
  setIsDragging(false)
  setDraggingChannelId(null)
  setIsOverTrash(false)
}

// 删除账号（通过WebSocket）
const handleDeleteAccount = (channelId: string) => {
  const channel = channels.find(ch => ch.id === channelId)
  if (!channel) return

  Modal.confirm({
    title: '确认删除账号',
    content: `确定要删除账号 "${channel.name}" 吗？删除后将无法恢复。`,
    okText: '确定删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      // 监听删除账号响应
      const handleDeleteAccountResult = (response: any) => {
        if (response.success) {
          antdMessage.success('账号删除成功')
          // 如果删除的是当前选中的账号，清除选择
          if (selectedChannelId === channelId) {
            dispatch(selectChannel(''))
          }
          // 账户列表会自动更新（Master会广播）
        } else {
          antdMessage.error(response.error || '账号删除失败')
        }
        websocketService.off('monitor:delete_account_result')
      }

      websocketService.on('monitor:delete_account_result', handleDeleteAccountResult)
      websocketService.emit('monitor:delete_account', { accountId: channelId })
    }
  })
}
```

#### 给账号列表项添加拖拽属性（第1142-1149行）

```typescript
<div
  key={channel.id}
  className={`wechat-account-item ${isSelected ? 'selected' : ''} ${channel.isFlashing ? 'flashing' : ''} ${!isLoggedIn ? 'not-logged-in' : ''} ${draggingChannelId === channel.id ? 'dragging' : ''}`}
  onClick={() => handleChannelClick(channel)}
  draggable={true}
  onDragStart={(e) => handleDragStart(e, channel.id)}
  onDragEnd={handleDragEnd}
>
```

#### 创建回收站组件（第1208-1250行）

```typescript
{/* 拖拽删除区域（回收站） */}
{isDragging && (
  <div
    style={{
      padding: '16px',
      backgroundColor: isOverTrash ? '#ff4d4f' : '#fff1f0',
      borderTop: '2px dashed #ff4d4f',
      borderBottom: '2px dashed #ff4d4f',
      textAlign: 'center',
      transition: 'all 0.3s ease',
      cursor: 'pointer'
    }}
    onDragOver={(e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setIsOverTrash(true)
    }}
    onDragLeave={() => {
      setIsOverTrash(false)
    }}
    onDrop={(e) => {
      e.preventDefault()
      const channelId = e.dataTransfer.getData('text/plain')
      setIsOverTrash(false)
      if (channelId) {
        handleDeleteAccount(channelId)
      }
    }}
  >
    <DeleteOutlined style={{
      fontSize: 32,
      color: isOverTrash ? '#fff' : '#ff4d4f',
      marginBottom: 8
    }} />
    <div style={{
      fontSize: 14,
      color: isOverTrash ? '#fff' : '#ff4d4f',
      fontWeight: 500
    }}>
      {isOverTrash ? '松开删除' : '拖到这里删除账号'}
    </div>
  </div>
)}
```

**UI特性**：
- ✅ 只在拖拽时显示回收站
- ✅ 拖到回收站上方时背景变红色高亮
- ✅ 显示友好的提示文字
- ✅ 平滑的过渡动画

### 3. CSS样式

**文件**：[packages/crm-pc-im/src/pages/MonitorPage.css](packages/crm-pc-im/src/pages/MonitorPage.css)

#### 添加拖拽状态样式（第96-110行）

```css
/* 拖拽状态 */
.wechat-account-item.dragging {
  opacity: 0.5;
  cursor: move;
  background-color: #e6f7ff;
  border: 2px dashed #1890ff;
}

.wechat-account-item[draggable="true"] {
  cursor: move;
}

.wechat-account-item[draggable="true"]:active {
  cursor: grabbing;
}
```

**样式特性**：
- ✅ 拖拽时账号项半透明显示
- ✅ 鼠标指针显示为move/grabbing
- ✅ 拖拽项有虚线边框视觉反馈

## 修改文件清单

| 文件 | 修改内容 | 行号 |
|------|---------|------|
| [im-websocket-server.js](packages/master/src/communication/im-websocket-server.js) | 添加 `monitor:delete_account` 消息监听器 | 112-115 |
| [im-websocket-server.js](packages/master/src/communication/im-websocket-server.js) | 实现 `handleDeleteAccount` 方法 | 2022-2100 |
| [MonitorPage.tsx](packages/crm-pc-im/src/pages/MonitorPage.tsx) | 添加拖拽相关状态 | 79-82 |
| [MonitorPage.tsx](packages/crm-pc-im/src/pages/MonitorPage.tsx) | 实现拖拽事件处理器 | 1029-1077 |
| [MonitorPage.tsx](packages/crm-pc-im/src/pages/MonitorPage.tsx) | 给账号列表项添加拖拽属性 | 1142-1149 |
| [MonitorPage.tsx](packages/crm-pc-im/src/pages/MonitorPage.tsx) | 创建回收站组件 | 1208-1250 |
| [MonitorPage.css](packages/crm-pc-im/src/pages/MonitorPage.css) | 添加拖拽样式 | 96-110 |

## 工作流程

```
用户拖拽账号                    IM客户端                        Master服务器
    |                              |                                 |
    |-- 开始拖拽 ------------------>|                                 |
    |                              |                                 |
    |                         显示回收站组件                          |
    |                         (isDragging = true)                    |
    |                              |                                 |
    |-- 拖到回收站上方 ------------>|                                 |
    |                              |                                 |
    |                         回收站高亮显示                          |
    |                         (isOverTrash = true)                   |
    |                              |                                 |
    |-- 松开鼠标 ------------------>|                                 |
    |                              |                                 |
    |                         弹出确认对话框                          |
    |                              |                                 |
    |-- 确认删除 ------------------>|                                 |
    |                              |                                 |
    |                              |-- monitor:delete_account ------>|
    |                              |                                 |
    |                              |                          验证账号存在     |
    |                              |                          撤销Worker任务  |
    |                              |                          从数据库删除    |
    |                              |                          从DataStore删除 |
    |                              |                                 |
    |                              |<-- monitor:delete_account_result --|
    |                              |    (success: true)              |
    |                              |                                 |
    |<-- 显示成功消息 --------------|                                 |
    |                              |                                 |
    |                              |<-- monitor:channels ------------|
    |                              |    (广播更新账户列表)            |
    |                              |                                 |
    |<-- 账户列表自动更新 ----------|                                 |
```

## 验证测试

### 测试步骤

1. **启动Master服务器**：
   ```bash
   cd packages/master
   npm start
   ```

   验证日志中包含：
   ```
   [im-websocket] IM WebSocket Server initialized
   ```

2. **启动IM客户端**

3. **测试拖拽删除**：
   - 在左侧账号列表中按住并拖动任一账号
   - 观察是否在底部显示回收站图标
   - 拖动账号到回收站上方
   - 观察回收站是否高亮显示（背景变红）
   - 松开鼠标
   - 观察是否弹出确认对话框

4. **测试删除功能**：
   - 点击对话框中的"确定删除"按钮
   - 观察是否显示"账号删除成功"消息
   - 观察账号是否从列表中消失
   - 查看Master日志，确认删除成功

5. **验证取消操作**：
   - 再次拖拽账号到回收站
   - 点击对话框中的"取消"按钮
   - 观察账号是否仍然保留在列表中

### 预期结果

✅ 拖拽时回收站出现在底部
✅ 拖到回收站上方时高亮显示
✅ 松开鼠标后弹出确认对话框
✅ 确认后账号成功删除
✅ 账户列表自动更新
✅ 取消操作不删除账号

### Master日志示例

```
[IM WS] Received delete account request: { accountId: 'acc-xxxxx' }
[IM WS] Revoked tasks for account acc-xxxxx
[IM WS] Account deleted successfully: acc-xxxxx
[IM WS] Removed account from DataStore: acc-xxxxx
```

## 技术亮点

1. **一致性**：删除逻辑与web-admin的HTTP API完全一致
   - 撤销Worker任务
   - 数据库删除
   - DataStore清理
   - 广播更新

2. **用户体验**：
   - 直观的拖拽交互
   - 实时的视觉反馈
   - 明确的确认对话框
   - 友好的提示消息

3. **状态管理**：
   - 使用React hooks管理拖拽状态
   - 自动清理拖拽状态
   - 处理边界情况

4. **样式优化**：
   - 平滑的CSS过渡动画
   - 清晰的视觉层次
   - 响应式的鼠标指针

## 对比总结

| 特性 | 修改前 | 修改后 |
|------|-------|--------|
| 删除方式 | 无删除功能 | 拖拽到回收站删除 |
| 视觉反馈 | 无 | 回收站图标 + 高亮 |
| 确认机制 | 无 | 确认对话框 |
| 撤销Worker任务 | 无 | ✅ |
| 内存清理 | 无 | ✅ |
| 广播更新 | 无 | ✅ |
| 用户体验 | - | 直观友好 |

## 相关文档

- [IM创建账号自动分配Worker功能实现](./IM创建账号自动分配Worker功能实现.md)
- [IM添加账号功能修复报告](./IM添加账号功能修复报告-AccountDAO方法名.md)
- [账户分配器实现](../packages/master/src/worker_manager/account-assigner.js)
- [web-admin账户API](../packages/master/src/api/routes/accounts.js)

## 总结

通过实现拖拽删除功能，IM客户端现在拥有了完整的账号管理能力：

✅ **创建账号**：添加账号按钮 → 表单填写 → 自动分配Worker
✅ **删除账号**：拖拽到回收站 → 确认对话框 → 撤销任务并删除
✅ **视觉反馈**：拖拽状态 → 回收站高亮 → 成功提示
✅ **状态同步**：所有客户端实时更新账户列表

这为用户提供了直观、高效、安全的账号管理体验。
