# 抖音评论API V1 vs V2 对比测试

## 测试目的

确定应该使用V1还是V2 API体系，通过实际运行对比两套API的数据完整性。

## 测试准备

已在代码中添加详细日志，每个API回调都会输出：
- API版本标识（V1/V2）
- 数据样本（第一条评论的完整结构）
- 关键字段信息（字段名、类型、是否存在）
- 统计信息（总数、字段完整性）

## 日志标识

### V1 API 日志标识
```
[API V1] 评论列表 comment_info_list.length: X
📊 [V1 API 数据样本] 评论列表
```

### V2 API 日志标识
```
[API V2] 讨论列表V2 comments.length: X
📊 [V2 API 数据样本] 讨论列表V2
```

## 测试步骤

### 1. 清理旧日志
```bash
# 清理或备份旧日志
cd packages/worker
rm -rf logs/*.log  # 或移动到备份目录
```

### 2. 运行爬虫
```bash
npm run start:worker
# 然后在Admin界面或命令行触发评论爬取任务
```

### 3. 查看日志
```bash
# 查看Worker日志
tail -f packages/worker/logs/douyin-crawl-comments.log

# 或搜索特定内容
grep "📊.*API 数据样本" packages/worker/logs/*.log
```

## 对比清单

### 关键字段对比

| 字段分类 | V1 API | V2 API | 优先选择 |
|---------|--------|--------|---------|
| **评论ID** | `comment_id` (加密字符串) | `cid` (数字字符串) | ? |
| **作品ID** | ❌ 缺失（需从URL提取） | ✅ `aweme_id` (数字) | V2 ✅ |
| **用户ID** | `user_info.user_id` (加密) | `user.uid` (数字) | ? |
| **用户昵称** | `user_info.screen_name` (string) | `user.nickname` (string) | = |
| **用户头像** | `user_info.avatar_url` (string) | `user.avatar_thumb.url_list[0]` (string) | = |
| **评论内容** | `text` (string) | `text` (string) | = |
| **创建时间** | `create_time` (字符串) | `create_time` (数字) | V2 ✅ |
| **点赞数** | `digg_count` (字符串) | `digg_count` (数字) | V2 ✅ |
| **回复数** | `reply_count` (字符串) | `reply_comment_total` (数字) | V2 ✅ |
| **评论图片** | ❌ 无 | ✅ `image_list` (数组) | V2 ✅ |
| **IP属地** | ❌ 无 | ✅ `ip_label` (string) | V2 ✅ |
| **是否作者** | `is_author` (boolean) | `label_text === '作者'` | = |
| **用户已点赞** | `user_digg` (boolean) | `user_digged` (0/1) | = |

### 数据类型对比

| 字段 | V1 类型 | V2 类型 | 备注 |
|------|---------|---------|------|
| 时间戳 | 字符串 `"1703200978"` | 数字 `1703200978` | V2更好 |
| 数量统计 | 字符串 `"0"` | 数字 `0` | V2更好 |
| ID | 加密字符串（Base64） | 数字字符串 | 取决于需求 |

## 测试结果记录

### 实际触发的API

运行爬虫后，记录实际触发了哪些API：

#### 评论列表
- [ ] V1: `onCommentsListAPI` - 日志显示次数: ___
- [ ] V2: `onCommentsListV2API` - 日志显示次数: ___

#### 讨论列表（回复）
- [ ] V1: `onDiscussionsListAPI` - 日志显示次数: ___
- [ ] V2: `onDiscussionsListV2API` - 日志显示次数: ___

### 数据样本对比

#### V1 API 样本
```
从日志中复制粘贴V1的数据样本：
📊 [V1 API 数据样本] 评论列表
  - comment_id: ...
  - ...
```

#### V2 API 样本
```
从日志中复制粘贴V2的数据样本：
📊 [V2 API 数据样本] 讨论列表V2
  - cid: ...
  - ...
```

### 完整性评分

| 评估项 | V1 评分 | V2 评分 | 说明 |
|--------|---------|---------|------|
| 字段完整性 | ___/10 | ___/10 | 是否包含所有需要的字段 |
| 数据类型 | ___/10 | ___/10 | 类型是否合理（数字vs字符串） |
| 扩展性 | ___/10 | ___/10 | 是否有额外有用字段（图片、IP等） |
| 易用性 | ___/10 | ___/10 | 字段命名和结构是否合理 |
| **总分** | ___/40 | ___/40 | |

## 决策建议

### 如果V2评分更高（推荐）

**保留V2 API，移除V1 API**

**理由**：
1. ✅ 数据类型更合理（数字而非字符串）
2. ✅ 字段更完整（有 `aweme_id`, `image_list`, `ip_label`）
3. ✅ 性能更好（数字ID索引效率高）
4. ✅ 未来趋势（新API都用数字ID）

**实施步骤**：
1. 在 `platform.js` 中移除V1 API注册
2. 简化 `normalizeCommentData()` 只处理V2格式
3. 更新 `mapCommentData()` 只处理V2字段
4. 更新文档说明

### 如果V1评分更高

**保留V1 API，移除V2 API**

**理由**：
- 数据更完整（记录实际原因）
- 更稳定（如果V2有bug或缺失数据）

**实施步骤**：
1. 在 `platform.js` 中移除V2 API注册
2. 简化 `normalizeCommentData()` 只处理V1格式
3. 更新 `mapCommentData()` 只处理V1字段
4. 补充缺失的 `aweme_id` 从URL提取逻辑

### 如果两者评分相近

**保留当前兼容方案**

继续支持V1和V2两套API，使用 `normalizeCommentData()` 统一转换。

## 测试报告模板

```
## 测试日期
2025-11-14

## 测试账号
- 账号ID: ___
- 平台: 抖音

## 测试结果
- V1 API触发次数: ___ 次
- V2 API触发次数: ___ 次
- 实际使用的API: V1 / V2 / 混合

## 数据对比
（粘贴日志中的数据样本）

## 完整性评分
- V1: ___/40
- V2: ___/40

## 最终决策
选择 V1 / V2，原因：
1. ...
2. ...
3. ...

## 下一步行动
- [ ] 移除不使用的API代码
- [ ] 简化数据转换函数
- [ ] 更新文档
- [ ] 测试验证
```

## 注意事项

1. **确保触发API**：必须真实点击作品和评论，才会触发API拦截
2. **查看多个样本**：不要只看一条数据，多看几条确保数据一致性
3. **检查边界情况**：有图片的评论、被点赞的评论、作者回复等
4. **对比数量**：V1和V2返回的评论数量是否一致

## 相关文件

- [crawler-comments.js](../packages/worker/src/platforms/douyin/crawler-comments.js) - API回调函数
- [platform.js](../packages/worker/src/platforms/douyin/platform.js) - API注册
- [抖音评论三种API字段对比与统一方案.md](抖音评论三种API字段对比与统一方案.md) - 详细字段对比
- [抖音评论API统一方案-实施总结.md](抖音评论API统一方案-实施总结.md) - 实施总结

## 快速命令参考

```bash
# 启动Worker
npm run start:worker

# 实时查看日志
tail -f packages/worker/logs/douyin-crawl-comments.log

# 搜索V1 API日志
grep "V1 API 数据样本" packages/worker/logs/*.log -A 15

# 搜索V2 API日志
grep "V2 API 数据样本" packages/worker/logs/*.log -A 15

# 统计API触发次数
grep "API V1.*评论列表" packages/worker/logs/*.log | wc -l
grep "API V2.*讨论列表V2" packages/worker/logs/*.log | wc -l
```
