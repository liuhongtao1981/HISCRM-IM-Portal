const fs = require('fs');
let content = fs.readFileSync('admin.html', 'utf8');

// 修复所有 .replace(/'/g, "\'") 的用法
// 1. 在 loadChannels 中
content = content.replace(
  /const channelListHtml = data\.channels\.map\(channel => `[\s\S]*?`\)\.join\(''\);/m,
  `const channelListHtml = data.channels.map(channel => {
          const escapedName = channel.name.replace(/'/g, "\\'");
          return \`
          <div class="channel-item \\${channel.isPinned ? 'pinned' : ''} \\${!channel.enabled ? 'disabled' : ''}">
            <div class="channel-info">
              <div class="channel-name">
                \\${channel.name}
                \\${channel.isPinned ? '<span class="badge badge-warning">📌 置顶</span>' : ''}
                \\${!channel.enabled ? '<span class="badge badge-error">🚫 已禁用</span>' : '<span class="badge badge-success">✓ 已启用</span>'}
              </div>
              <div class="channel-desc">
                ID: \\${channel.id} | \\${channel.description || '暂无描述'}
              </div>
            </div>
            <div class="channel-actions">
              <button class="btn btn-primary btn-small" onclick="selectChannelForTopic('\\${channel.id}', '\\${escapedName}')">
                选择
              </button>
              <button class="btn btn-success btn-small" onclick="openTopicsModal('\\${channel.id}', '\\${escapedName}')">
                管理作品
              </button>
              <button class="btn btn-warning btn-small" onclick="editChannel('\\${channel.id}')">
                编辑
              </button>
              <button class="btn btn-danger btn-small" onclick="deleteChannel('\\${channel.id}', '\\${escapedName}')">
                删除
              </button>
            </div>
          </div>
        \`;
        }).join('');`
);

// 2. 在 loadTopics 中
content = content.replace(
  /topicsList\.innerHTML = topics\.map\(topic => `[\s\S]*?`\)\.join\(''\);/m,
  `topicsList.innerHTML = topics.map(topic => {
          const topicJson = JSON.stringify(topic).replace(/'/g, "\\'");
          const escapedTitle = topic.title.replace(/'/g, "\\'");
          return \`
          <div class="topic-item">
            <div class="topic-info">
              <h4>\\${topic.isPinned ? '📌 ' : ''}\\${topic.title}</h4>
              <p>\\${topic.description || '暂无描述'}</p>
              <small>评论数: \\${topic.messageCount || 0} | 发布时间: \\${new Date(topic.createdTime).toLocaleString('zh-CN')}</small>
            </div>
            <div class="topic-actions">
              <button class="btn btn-small btn-secondary" onclick='editTopic(\\${topicJson})'>编辑</button>
              <button class="btn btn-small btn-danger" onclick="deleteTopic('\\${topic.id}', '\\${escapedTitle}')">删除</button>
            </div>
          </div>
        \`;
        }).join('');`
);

// 3. 在 loadTopicsForSelection 中
content = content.replace(
  /listEl\.innerHTML = topics\.map\(topic => `[\s\S]*?`\)\.join\(''\);[\s\S]*?} catch \(error\) \{/m,
  `listEl.innerHTML = topics.map(topic => {
          const escapedTitle = topic.title.replace(/'/g, "\\'");
          return \`
          <div class="topic-item" onclick="selectTopicFromList('\\${topic.id}', '\\${escapedTitle}')">
            <div class="topic-info">
              <h4 style="cursor: pointer;">\\${topic.isPinned ? '📌 ' : ''}\\${topic.title}</h4>
              <p>\\${topic.description || '暂无描述'}</p>
              <small>评论数: \\${topic.messageCount || 0} | 发布时间: \\${new Date(topic.createdTime).toLocaleString('zh-CN')}</small>
            </div>
          </div>
        \`;
        }).join('');

      } catch (error) {`
);

fs.writeFileSync('admin.html', content);
console.log('修复完成!');
