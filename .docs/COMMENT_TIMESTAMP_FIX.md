# 评论时间戳修复总结

## 问题描述
评论的 `created_at`（评论创建时间）与 `detected_at`（系统检测时间）相同，这意味着所有评论都没有正确的评论创建时间戳。

## 问题根因
**数据字段名不匹配**：
- Worker 端在发送评论时使用的是 `create_time` 字段名
- Master 端在接收评论时期望的是 `created_at` 字段名
- 导致 `created_at` 无法正确映射，最终被设置为当前时间

### 代码位置

**Worker 端** [packages/worker/src/platforms/douyin/platform.js:829](../../packages/worker/src/platforms/douyin/platform.js#L829)
```javascript
// Worker 发送的评论使用 create_time 字段
create_time: parseInt(c.create_time),
```

**Master 端** [packages/master/src/database/comments-dao.js:337](../../packages/master/src/database/comments-dao.js#L337)
```javascript
// 修复前：只查找 comment.created_at
created_at: Number(comment.created_at) || Math.floor(Date.now() / 1000),

// 修复后：同时支持 created_at 和 create_time
created_at: Number(comment.created_at || comment.create_time) || Math.floor(Date.now() / 1000),
```

## 解决方案

### 修复内容
在 Master 端的 `CommentsDAO.bulkInsert()` 方法中，修改 `created_at` 字段的映射，使其同时支持两种字段名：

```javascript
// 修复前
created_at: Number(comment.created_at) || Math.floor(Date.now() / 1000),

// 修复后
created_at: Number(comment.created_at || comment.create_time) || Math.floor(Date.now() / 1000),
```

这样做可以确保：
1. 首先尝试使用 `created_at` 字段（如果存在）
2. 如果不存在，则回退到 `create_time` 字段（Worker 发送的实际字段名）
3. 如果都不存在，则使用当前时间作为默认值

### 修改的文件
- **文件**：[packages/master/src/database/comments-dao.js](../../packages/master/src/database/comments-dao.js)
- **行号**：第 337 行
- **修复类型**：字段映射兼容性处理

## 验证方式

系统重启后，新收集的评论将具有正确的 `created_at` 时间戳：

```javascript
// 预期结果
{
  id: "comment-123",
  content: "评论内容",
  created_at: 1725487481,        // ✅ 来自 React 对象中的 create_time
  detected_at: 1760758013,       // 系统检测时间
  time_diff: 35270532,           // 会有时间差异
}
```

## 后续步骤

当新评论被抓取时：
1. Admin Web UI 的消息管理页面会显示正确的评论创建时间
2. `created_at` 和 `detected_at` 会有明显的时间差异
3. 时间差反映了评论实际发表距离系统检测的时间间隔

## 相关修复
此修复与私信时间戳修复类似：
- 私信已通过 React Fiber 方式正确提取 `item.createdTime`
- 评论使用 API 响应中的 `create_time` 字段
- 两者现在都通过 Master 端的字段名兼容处理得到正确映射
