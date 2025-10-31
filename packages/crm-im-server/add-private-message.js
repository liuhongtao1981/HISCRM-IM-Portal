const fs = require('fs');

let html = fs.readFileSync('public/admin.html', 'utf8');

// 1. 在评论弹窗后添加私信弹窗 HTML
const privateModalHtml = `
  <!-- 私信对话弹窗 -->
  <div id="privateMessageModal" class="modal">
    <div class="modal-content" style="max-width: 800px; max-height: 90vh; padding: 0; overflow: hidden; display: flex; flex-direction: column;">
      <!-- 顶部 - 显示当前用户信息 -->
      <div style="background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%); padding: 20px; color: white;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div id="privateUserAvatar" style="width: 48px; height: 48px; border-radius: 50%; background: rgba(255,255,255,0.3);
                          color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px;
                          border: 2px solid rgba(255,255,255,0.5);"></div>
              <div>
                <h2 style="color: white; margin: 0; font-size: 20px;">💬 私信对话: <span id="privateUserNameDisplay"></span></h2>
                <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">一对一私信交流</p>
              </div>
            </div>
          </div>
          <button onclick="closePrivateMessage()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 24px; transition: all 0.3s; flex-shrink: 0; margin-left: 20px;">&times;</button>
        </div>
      </div>

      <!-- 消息列表区域 -->
      <div id="privateMessageList" style="flex: 1; overflow-y: auto; padding: 20px 20px 180px 20px; background: #f5f5f5; min-height: 400px;">
        <p style="text-align: center; color: #999; padding: 40px 20px;">加载中...</p>
      </div>

      <!-- 发送消息输入框 - 固定在底部 -->
      <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 16px; background: linear-gradient(180deg, #fafafa 0%, #f5f5f5 100%); border-top: 2px solid #e0e0e0; box-shadow: 0 -4px 12px rgba(0,0,0,0.08); z-index: 10;">
        <div style="margin-bottom: 10px; padding: 8px 12px; background: white; border-radius: 6px; border-left: 3px solid #52c41a;">
          <div style="font-size: 13px; font-weight: 600; color: #333; margin-bottom: 2px;">
            💬 发送私信
          </div>
          <div style="font-size: 11px; color: #999;">
            发送给: <span id="privateUserName" style="color: #52c41a; font-weight: 500;"></span>
          </div>
        </div>
        <textarea id="privateMessageInput" rows="3" style="width: 100%; padding: 10px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 13px; font-family: inherit; resize: none; box-sizing: border-box;" placeholder="输入私信内容... (Ctrl+Enter 发送)"></textarea>
        <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #999;">💡 一对一私信对话</span>
          <button class="btn btn-primary btn-small" onclick="submitPrivateMessage()">
            📤 发送私信
          </button>
        </div>
      </div>
    </div>
  </div>
`;

html = html.replace(
  '  <!-- 创建/编辑作品模态框 -->',
  privateModalHtml + '\n  <!-- 创建/编辑作品模态框 -->'
);

// 2. 在 "加载账户的作品到下拉框" 之前添加私信相关函数
const privateFunctions = `
    // ============ 私信对话弹窗相关函数 ============
    let currentPrivateUser = null;
    let allPrivateMessages = [];

    // 打开私信对话弹窗
    async function openPrivateMessage(user) {
      currentPrivateUser = user;

      document.getElementById('privateUserNameDisplay').textContent = user.name;
      document.getElementById('privateUserAvatar').textContent = user.name.substring(0, 1);
      document.getElementById('privateUserName').textContent = user.name;
      document.getElementById('privateMessageInput').value = '';
      document.getElementById('privateMessageModal').style.display = 'flex';

      await loadPrivateMessages(user.id);
    }

    // 加载私信历史消息
    async function loadPrivateMessages(userId) {
      const listContainer = document.getElementById('privateMessageList');
      listContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 40px 20px;">加载中...</p>';

      try {
        const channelId = 'private_messages';
        const topicId = \`private_\${userId}\`;
        const url = \`/api/messages?channelId=\${channelId}&topicId=\${topicId}\`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(\`HTTP错误! 状态: \${response.status}\`);

        const data = await response.json();
        const messages = data.messages || [];

        allPrivateMessages = messages.map((msg, index) => ({
          id: msg.id || \`msg_\${index}_\${msg.timestamp}\`,
          content: msg.content,
          fromName: msg.fromName || '匿名用户',
          fromId: msg.fromId || 'unknown',
          timestamp: msg.timestamp,
          type: msg.type || 'text'
        }));

        allPrivateMessages.sort((a, b) => a.timestamp - b.timestamp);

        if (allPrivateMessages.length === 0) {
          listContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 40px 20px;">暂无私信记录</p>';
          return;
        }

        const messagesHtml = allPrivateMessages.map(msg => {
          const time = formatCommentTime(msg.timestamp);
          const isFromUser = msg.fromId === userId;
          const isFromMonitor = msg.fromId === 'monitor_client';

          if (isFromUser) {
            return \`
              <div style="display: flex; justify-content: flex-start; margin-bottom: 16px; gap: 10px;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; flex-shrink: 0;">
                  \${msg.fromName.substring(0, 1)}
                </div>
                <div style="max-width: 70%;">
                  <div style="font-size: 12px; color: #999; margin-bottom: 4px;">\${msg.fromName} \${time}</div>
                  <div style="background: white; padding: 10px 14px; border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); word-wrap: break-word; line-height: 1.5; font-size: 14px; color: #191919;">
                    \${msg.content}
                  </div>
                </div>
              </div>
            \`;
          } else if (isFromMonitor) {
            return \`
              <div style="display: flex; justify-content: flex-end; margin-bottom: 16px; gap: 10px;">
                <div style="max-width: 70%; text-align: right;">
                  <div style="font-size: 12px; color: #999; margin-bottom: 4px;">\${time} 客服</div>
                  <div style="background: #95ec69; padding: 10px 14px; border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); word-wrap: break-word; line-height: 1.5; font-size: 14px; color: #191919; text-align: left;">
                    \${msg.content}
                  </div>
                </div>
                <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%);
                            color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; flex-shrink: 0;">
                  客
                </div>
              </div>
            \`;
          } else {
            return \`
              <div style="display: flex; justify-content: flex-start; margin-bottom: 16px; gap: 10px;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: #faad14;
                            color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; flex-shrink: 0;">
                  \${msg.fromName.substring(0, 1)}
                </div>
                <div style="max-width: 70%;">
                  <div style="font-size: 12px; color: #999; margin-bottom: 4px;">\${msg.fromName} \${time}</div>
                  <div style="background: white; padding: 10px 14px; border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); word-wrap: break-word; line-height: 1.5; font-size: 14px; color: #191919;">
                    \${msg.content}
                  </div>
                </div>
              </div>
            \`;
          }
        }).join('');

        listContainer.innerHTML = messagesHtml;
        listContainer.scrollTop = listContainer.scrollHeight;

      } catch (error) {
        console.error('[私信历史] 加载失败:', error);
        listContainer.innerHTML = \`<p style="text-align: center; color: #ff4d4f; padding: 40px 20px;">加载失败: \${error.message}</p>\`;
      }
    }

    // 关闭私信对话弹窗
    function closePrivateMessage() {
      document.getElementById('privateMessageModal').style.display = 'none';
      currentPrivateUser = null;
      allPrivateMessages = [];
    }

    // 提交私信消息
    async function submitPrivateMessage() {
      const content = document.getElementById('privateMessageInput').value.trim();

      if (!content) {
        showToast('请输入私信内容', 'warning');
        return;
      }

      if (!currentPrivateUser) {
        showToast('用户信息不完整', 'error');
        return;
      }

      try {
        const channelId = 'private_messages';
        const topicId = \`private_\${currentPrivateUser.id}\`;

        const messageData = {
          channelId: channelId,
          topicId: topicId,
          content: content,
          fromUserId: currentPrivateUser.id,
          fromUserName: currentPrivateUser.name,
          messageType: 'private'
        };

        const messageRes = await fetch('/api/send-test-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messageData)
        });

        const result = await messageRes.json();

        if (result.success) {
          showToast(\`✓ 私信发送成功\`, 'success');
          document.getElementById('privateMessageInput').value = '';
          await loadPrivateMessages(currentPrivateUser.id);
          addMessageLog(channelId, topicId, content, currentPrivateUser.name + ' (私信)', false);
        } else {
          showToast('发送失败: ' + (result.error || '未知错误'), 'error');
        }

      } catch (error) {
        console.error('提交私信失败:', error);
        showToast('提交私信失败: ' + error.message, 'error');
      }
    }

`;

html = html.replace(
  '    // 加载账户的作品到下拉框',
  privateFunctions + '    // 加载账户的作品到下拉框'
);

// 3. 修改 startTestSession 函数中的私信部分
html = html.replace(
  /} else if \(type === 'private'\) \{[\s\S]*?defaultMessage = `你好,我是\$\{user\.name\},有事情想私下咨询`;[\s\S]*?\}[\s\S]*?\/\/ 弹出输入框获取消息内容/m,
  `} else if (type === 'private') {
        // 私信类型:直接打开私信对话弹窗
        await openPrivateMessage(user);
        return;
      }

      // 弹出输入框获取消息内容`
);

// 4. 在 DOMContentLoaded 中添加私信快捷键
html = html.replace(
  /(\/\/ 点击评论弹窗外部关闭[\s\S]*?closeCommentHistory\(\);[\s\S]*?\}\);[\s\S]*?\}\);)/m,
  `$1

      // 私信输入框 Ctrl+Enter 快捷键
      document.getElementById('privateMessageInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          submitPrivateMessage();
        }
      });

      // 点击私信弹窗外部关闭
      document.getElementById('privateMessageModal').addEventListener('click', (e) => {
        if (e.target.id === 'privateMessageModal') {
          closePrivateMessage();
        }
      });`
);

fs.writeFileSync('public/admin.html', html);
console.log('✓ 私信功能添加完成!');
