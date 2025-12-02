# IM 端验证弹窗集成指南

**文档类型**: 🔌 集成指南 - IM 客户端验证功能实现
**适用客户端**: CRM PC IM (Electron) / CRM Mobile IM (React Native)
**创建时间**: 2025-12-02

---

## 功能概述

当抖音评论功能触发验证机制时，Master 会将验证请求转发给 IM 端，IM 端需要：
1. 显示验证提示弹窗
2. 等待用户选择（继续验证 / 取消任务）
3. 将用户选择发送回 Master
4. （可选）处理短信验证码输入

---

## Socket.IO 消息流

### 1. 接收验证请求

**事件**: `verification:request`
**来源**: Master (转发自 Worker)
**命名空间**: `/client`

**消息格式**:
```javascript
{
  "request_id": "verify_acc-xxx_1701511234567",
  "account_id": "acc-35e6ca87-d12d-4244-98fe-a11419b76253",
  "verification_type": "sms",  // or "qrcode"
  "message": "为确保是本人操作抖音账号，请输入当前手机号198******35收到的短信验证码",
  "phone_number": "198******35",
  "has_sms_button": true,
  "has_qrcode_option": true,
  "context": {
    "aweme_id": "7533083869034138931",
    "comment_level": 1,
    "reply_content": "你好呀..."
  },
  "timestamp": 1701511234567
}
```

**字段说明**:
- `request_id`: 验证请求唯一 ID（用于响应时匹配）
- `account_id`: 触发验证的账户 ID
- `verification_type`: 验证类型（`sms` = 短信验证码, `qrcode` = 扫码验证）
- `message`: 显示给用户的验证提示消息
- `phone_number`: 手机号（脱敏后，如 `198******35`）
- `has_sms_button`: 是否有"获取验证码"按钮
- `has_qrcode_option`: 是否有"扫码验证"选项
- `context`: 上下文信息（视频 ID、评论层级、回复内容等）
- `timestamp`: 请求时间戳

---

### 2. 发送验证响应

**事件**: `client:verification:response`
**目标**: Master (转发给 Worker)
**命名空间**: `/client`

**消息格式**:
```javascript
{
  "request_id": "verify_acc-xxx_1701511234567",  // 必须与请求的 request_id 一致
  "choice": "yes",  // or "no"
  "timestamp": 1701511234567
}
```

**字段说明**:
- `request_id`: 验证请求 ID（从 `verification:request` 中获取）
- `choice`: 用户选择（`"yes"` = 继续验证, `"no"` = 取消任务）
- `timestamp`: 响应时间戳

---

## 实现步骤

### 步骤 1: 监听验证请求

在 IM 客户端的 Socket.IO 初始化代码中添加监听器：

```javascript
// 假设 socket 是已连接到 Master 的 Socket.IO 客户端实例
// 连接到 /client 命名空间

import io from 'socket.io-client';

const socket = io('http://localhost:3000/client', {
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

// 监听验证请求
socket.on('verification:request', (data) => {
  console.log('📩 收到验证请求:', data);

  const {
    request_id,
    account_id,
    verification_type,
    message,
    phone_number,
    has_sms_button,
    has_qrcode_option,
    context
  } = data;

  // 显示验证弹窗
  showVerificationDialog({
    requestId: request_id,
    accountId: account_id,
    verificationType: verification_type,
    message: message,
    phoneNumber: phone_number,
    hasSMSButton: has_sms_button,
    hasQRCodeOption: has_qrcode_option,
    context: context
  });
});
```

---

### 步骤 2: 显示验证弹窗

#### 方案 A: Electron 桌面端 (使用 Ant Design Modal)

```javascript
import { Modal, Button, Typography } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

function showVerificationDialog(options) {
  const {
    requestId,
    accountId,
    verificationType,
    message,
    phoneNumber,
    hasSMSButton,
    hasQRCodeOption,
    context
  } = options;

  Modal.confirm({
    title: '⚠️ 验证提示',
    icon: <ExclamationCircleOutlined />,
    width: 500,
    content: (
      <div>
        <Paragraph>{message}</Paragraph>

        <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <Text strong>账户信息</Text>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">账户 ID: {accountId}</Text>
          </div>
          {phoneNumber && (
            <div>
              <Text type="secondary">手机号: {phoneNumber}</Text>
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, padding: 12, background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4 }}>
          <Text strong>操作说明</Text>
          <ul style={{ marginTop: 8, marginBottom: 0 }}>
            <li>选择"是"：继续验证（需要输入短信验证码）</li>
            <li>选择"否"：取消本次评论发送</li>
          </ul>
        </div>

        {context && (
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              操作：发送{context.comment_level}级评论 | 视频 ID: {context.aweme_id?.substring(0, 12)}...
            </Text>
          </div>
        )}
      </div>
    ),
    okText: '是 - 继续验证',
    cancelText: '否 - 取消任务',
    onOk: () => {
      console.log('用户选择：是');

      // 发送响应给 Master
      socket.emit('client:verification:response', {
        request_id: requestId,
        choice: 'yes',
        timestamp: Date.now()
      });

      // 如果是短信验证码，显示输入框
      if (verificationType === 'sms' && hasSMSButton) {
        showSMSCodeInputDialog(requestId, accountId);
      }
    },
    onCancel: () => {
      console.log('用户选择：否');

      // 发送响应给 Master
      socket.emit('client:verification:response', {
        request_id: requestId,
        choice: 'no',
        timestamp: Date.now()
      });
    }
  });
}
```

---

#### 方案 B: React Native 移动端 (使用 Alert)

```javascript
import { Alert } from 'react-native';

function showVerificationDialog(options) {
  const {
    requestId,
    accountId,
    verificationType,
    message,
    phoneNumber,
    hasSMSButton,
    hasQRCodeOption,
    context
  } = options;

  const formattedMessage = `${message}\n\n账户 ID: ${accountId}${phoneNumber ? `\n手机号: ${phoneNumber}` : ''}`;

  Alert.alert(
    '⚠️ 验证提示',
    formattedMessage,
    [
      {
        text: '否 - 取消任务',
        style: 'cancel',
        onPress: () => {
          console.log('用户选择：否');

          // 发送响应给 Master
          socket.emit('client:verification:response', {
            request_id: requestId,
            choice: 'no',
            timestamp: Date.now()
          });
        }
      },
      {
        text: '是 - 继续验证',
        onPress: () => {
          console.log('用户选择：是');

          // 发送响应给 Master
          socket.emit('client:verification:response', {
            request_id: requestId,
            choice: 'yes',
            timestamp: Date.now()
          });

          // 如果是短信验证码，显示输入框
          if (verificationType === 'sms' && hasSMSButton) {
            showSMSCodeInputDialog(requestId, accountId);
          }
        }
      }
    ],
    { cancelable: false }
  );
}
```

---

### 步骤 3: 短信验证码输入（TODO - 待 Worker 端实现）

**注意**: 此功能需要等待 Worker 端实现短信验证码处理逻辑后才能完整集成。

```javascript
function showSMSCodeInputDialog(requestId, accountId) {
  // TODO: 显示短信验证码输入框
  // 1. 用户输入 6 位验证码
  // 2. 发送验证码给 Master

  Modal.confirm({
    title: '📱 输入短信验证码',
    content: (
      <div>
        <Input
          placeholder="请输入 6 位验证码"
          maxLength={6}
          id="sms-code-input"
        />
      </div>
    ),
    okText: '提交',
    cancelText: '取消',
    onOk: () => {
      const code = document.getElementById('sms-code-input').value;

      if (!code || code.length !== 6) {
        message.error('请输入 6 位验证码');
        return;
      }

      // 发送验证码给 Master
      socket.emit('client:verification:sms-code', {
        request_id: requestId,
        account_id: accountId,
        sms_code: code,
        timestamp: Date.now()
      });

      message.success('验证码已提交，等待验证...');
    }
  });
}
```

---

## UI 设计参考

### 验证弹窗样式

```
┌─────────────────────────────────────────┐
│  ⚠️ 验证提示                             │
├─────────────────────────────────────────┤
│                                         │
│  为确保是本人操作抖音账号，              │
│  请输入当前手机号198******35            │
│  收到的短信验证码                        │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ 账户信息                           │ │
│  │ 账户 ID: acc-35e6ca87-xxx         │ │
│  │ 手机号: 198******35               │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ 操作说明                           │ │
│  │ • 选择"是"：继续验证（需输入验证码）│ │
│  │ • 选择"否"：取消本次评论发送       │ │
│  └───────────────────────────────────┘ │
│                                         │
│  操作：发送1级评论 | 视频 ID: 7533...   │
│                                         │
├─────────────────────────────────────────┤
│         [ 否 - 取消任务 ]  [ 是 - 继续验证 ] │
└─────────────────────────────────────────┘
```

### 短信验证码输入框样式（TODO）

```
┌─────────────────────────────────────────┐
│  📱 输入短信验证码                       │
├─────────────────────────────────────────┤
│                                         │
│  请输入发送到手机号 198******35 的       │
│  6 位短信验证码                          │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ [_] [_] [_] [_] [_] [_]           │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ⏱️ 60 秒后可重新获取                    │
│                                         │
├─────────────────────────────────────────┤
│                  [ 取消 ]  [ 提交 ]      │
└─────────────────────────────────────────┘
```

---

## 完整集成示例

### CRM PC IM (Electron + React)

**文件**: `packages/crm-pc-im/src/services/socket-client.js`

```javascript
import io from 'socket.io-client';
import { Modal, message } from 'antd';

class SocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
  }

  connect(masterUrl = 'http://localhost:3000') {
    // 连接到 Master 的 /client 命名空间
    this.socket = io(`${masterUrl}/client`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to Master');
      this.connected = true;

      // 注册客户端
      this.socket.emit('client:register', {
        device_id: localStorage.getItem('device_id') || this.generateDeviceId(),
        device_type: 'desktop',
        device_name: 'CRM PC IM'
      });
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from Master');
      this.connected = false;
    });

    // ⭐ 监听验证请求
    this.socket.on('verification:request', this.handleVerificationRequest.bind(this));

    // 监听其他事件...
  }

  handleVerificationRequest(data) {
    console.log('📩 收到验证请求:', data);

    const {
      request_id,
      account_id,
      verification_type,
      message: verificationMessage,
      phone_number,
      has_sms_button,
      has_qrcode_option,
      context
    } = data;

    Modal.confirm({
      title: '⚠️ 验证提示',
      width: 500,
      content: (
        <div>
          <p>{verificationMessage}</p>
          <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
            <strong>账户信息</strong>
            <div style={{ marginTop: 8 }}>
              <div>账户 ID: {account_id}</div>
              {phone_number && <div>手机号: {phone_number}</div>}
            </div>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4 }}>
            <strong>操作说明</strong>
            <ul style={{ marginTop: 8, marginBottom: 0 }}>
              <li>选择"是"：继续验证（需要输入短信验证码）</li>
              <li>选择"否"：取消本次评论发送</li>
            </ul>
          </div>
        </div>
      ),
      okText: '是 - 继续验证',
      cancelText: '否 - 取消任务',
      onOk: () => {
        this.sendVerificationResponse(request_id, 'yes');

        if (verification_type === 'sms' && has_sms_button) {
          // TODO: 显示短信验证码输入框
          message.info('短信验证码功能待实现');
        }
      },
      onCancel: () => {
        this.sendVerificationResponse(request_id, 'no');
      }
    });
  }

  sendVerificationResponse(requestId, choice) {
    if (!this.socket || !this.connected) {
      console.error('Socket not connected');
      return;
    }

    this.socket.emit('client:verification:response', {
      request_id: requestId,
      choice: choice,
      timestamp: Date.now()
    });

    console.log(`✅ 已发送验证响应: ${choice}`, { requestId });
  }

  generateDeviceId() {
    const deviceId = `desktop_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    localStorage.setItem('device_id', deviceId);
    return deviceId;
  }
}

export default new SocketClient();
```

**使用示例**:

```javascript
// 在应用启动时初始化 Socket 连接
import socketClient from './services/socket-client';

// App.jsx
function App() {
  useEffect(() => {
    // 连接到 Master
    socketClient.connect('http://localhost:3000');

    return () => {
      socketClient.disconnect();
    };
  }, []);

  return (
    <div className="app">
      {/* 应用内容 */}
    </div>
  );
}
```

---

## 测试步骤

### 1. 启动服务

```bash
# 启动 Master
cd packages/master
npm start

# 启动 Worker
cd packages/worker
npm start

# 启动 IM 客户端
cd packages/crm-pc-im
npm run dev
```

### 2. 触发验证

1. 在 IM 客户端中登录抖音账号
2. 连续发送多条评论，触发验证机制
3. 观察 IM 端是否弹出验证提示

### 3. 验证消息流

**预期流程**:
```
Worker 检测到验证弹窗
  ↓
发送 'worker:verification:request' → Master
  ↓
Master 转发 'verification:request' → IM 端
  ↓
IM 端显示弹窗，用户选择
  ↓
IM 端发送 'client:verification:response' → Master
  ↓
Master 转发 'worker:verification:response:{request_id}' → Worker
  ↓
Worker 收到用户选择，执行相应操作
```

### 4. 日志检查

**Worker 日志**:
```
⚠️ 检测到验证弹窗，需要人工处理
Verification request sent for account acc-xxx, type: sms
User choice received: yes
```

**Master 日志**:
```
Worker {socket_id} verification request: { requestId, accountId, verificationType, phoneNumber }
Verification request forwarded to IM client, request_id: verify_acc-xxx_xxx
Client {socket_id} verification response: { requestId, choice, timestamp }
Verification response forwarded to Worker, request_id: verify_acc-xxx_xxx, choice: yes
```

**IM 客户端控制台**:
```
📩 收到验证请求: { request_id, verification_type, message, ... }
✅ 已发送验证响应: yes { requestId }
```

---

## 错误处理

### 1. 连接断开

```javascript
socket.on('disconnect', () => {
  console.error('Socket disconnected');

  // 显示重连提示
  message.warning('连接已断开，正在重连...');
});

socket.on('reconnect', () => {
  console.log('Socket reconnected');
  message.success('连接已恢复');
});
```

### 2. 超时处理

Worker 端会在 5 分钟后自动超时，IM 端可以添加客户端超时：

```javascript
handleVerificationRequest(data) {
  const { request_id } = data;

  // 5 分钟超时
  const timeout = setTimeout(() => {
    message.error('验证请求超时，已自动取消');
  }, 5 * 60 * 1000);

  Modal.confirm({
    // ...弹窗配置
    onOk: () => {
      clearTimeout(timeout);
      this.sendVerificationResponse(request_id, 'yes');
    },
    onCancel: () => {
      clearTimeout(timeout);
      this.sendVerificationResponse(request_id, 'no');
    }
  });
}
```

---

## 待实现功能

### 1. 短信验证码处理（Worker 端）

Worker 端需要实现：
- 点击"获取验证码"按钮
- 等待 IM 端用户输入验证码
- 提交验证码到抖音
- 验证通过后重新尝试发送评论

### 2. 短信验证码输入（IM 端）

IM 端需要实现：
- 验证码输入框 UI
- 验证码格式验证（6 位数字）
- 倒计时功能（60 秒）
- 重新发送功能

### 3. 扫码验证（未来支持）

如果用户选择扫码验证：
- 显示二维码
- 等待用户扫码
- 验证通过后继续任务

---

## 相关文档

- [抖音评论验证检测功能实现.md](./抖音评论验证检测功能实现.md) - Worker 端验证检测实现
- [MCP浏览器调试-一级评论元素查找修复.md](./MCP浏览器调试-一级评论元素查找修复.md) - 评论功能修复

---

## 总结

### 已完成

1. ✅ Master 端验证请求转发（Worker → IM 端）
2. ✅ Master 端验证响应转发（IM 端 → Worker）
3. ✅ Socket.IO 消息格式定义
4. ✅ IM 端集成示例代码
5. ✅ UI 设计参考

### 待完成

1. ⏳ IM 端验证弹窗实际集成（需要在 CRM PC IM 中实现）
2. ⏳ 短信验证码输入界面（需要 Worker 端支持）
3. ⏳ 扫码验证功能（未来支持）

### 测试状态

🟡 **待集成测试** - Master 端代码已完成，等待 IM 端实现后进行完整测试

---

**创建时间**: 2025-12-02
**文档类型**: 集成指南
**适用版本**: Master v1.0 + Worker v1.0
