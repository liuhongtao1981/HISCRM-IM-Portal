# 抖音评论发布API详细文档

## 概述

本文档详细记录了抖音Web端评论发布功能的API调用细节，包括一级评论（对作品的直接评论）和二级回复（对评论的回复）两种场景的完整请求和响应格式。

**测试时间**: 2025-12-01
**测试视频**: https://www.douyin.com/video/7534563676188052786
**测试方法**: API拦截（fetch + XMLHttpRequest）

---

## API端点

### 基础信息

- **URL**: `https://www.douyin.com/aweme/v1/web/comment/publish`
- **方法**: `POST`
- **Content-Type**: `application/x-www-form-urlencoded`

### URL查询参数

```
app_name=aweme
enter_from=video_detail
previous_page=video_detail
device_platform=webapp
aid=6383
channel=channel_pc_web
pc_client_type=1
pc_libra_divert=Windows
update_version_code=170400
support_h265=1
support_dash=1
version_code=170400
version_name=17.4.0
cookie_enabled=true
screen_width=1920
screen_height=1080
browser_language=zh-CN
browser_platform=Win32
browser_name=Chrome
browser_version=142.0.0.0
browser_online=true
engine_name=Blink
engine_version=142.0.0.0
os_name=Windows
os_version=10
cpu_core_num=12
device_memory=8
platform=PC
downlink=10
effective_type=4g
round_trip_time=50
webid=7563144483933275675
uifid=[长字符串指纹]
```

---

## 一级评论（对作品的直接评论）

### 请求体参数

```
aweme_id=7534563676188052786
comment_send_celltime=42635
comment_video_celltime=704084
one_level_comment_rank=-1
paste_edit_method=non_paste
text=%E6%B5%8B%E8%AF%95API%E6%8B%A6%E6%88%AA-%E4%B8%80%E7%BA%A7%E8%AF%84%E8%AE%BA
text_extra=%5B%5D
```

#### 参数说明

| 参数名 | 示例值 | 说明 |
|--------|--------|------|
| `aweme_id` | 7534563676188052786 | 视频ID（作品ID） |
| `comment_send_celltime` | 42635 | 评论发送时的时间戳（毫秒） |
| `comment_video_celltime` | 704084 | 视频播放时长（毫秒） |
| `one_level_comment_rank` | -1 | 一级评论排名（-1表示新评论） |
| `paste_edit_method` | non_paste | 输入方式（non_paste=手动输入） |
| `text` | URL编码的评论内容 | 评论文本（需URL编码） |
| `text_extra` | %5B%5D（即[]） | 附加文本信息（空数组） |

**关键特征**: **没有 `reply_id` 参数**

### 响应数据

```json
{
  "comment": {
    "cid": "7578754028746720052",
    "create_time": 1764566574,
    "digg_count": 0,
    "image_list": null,
    "label_list": null,
    "label_text": "作者",
    "label_type": 1,
    "reply_comment": null,
    "reply_id": "0",
    "reply_to_reply_id": "0",
    "status": 7,
    "text": "测试API拦截-一级评论",
    "text_extra": [],
    "text_music_info": null,
    "user": {
      "nickname": "临终关怀志愿者-宝哥",
      "uid": "564495895506771",
      "sec_uid": "MS4wLjABAAAAEgyUYZIg6TENcFzIWkQ6-gbwKvGDn8NJbGtoQAIXXwM",
      "avatar_thumb": { /* 头像信息 */ }
      // ... 其他用户信息
    },
    "user_digged": 0,
    "video_list": null
  },
  "log_pb": {
    "impr_id": "202512011322533E184591E34F978F9C0E"
  },
  "status_code": 0
}
```

#### 响应关键字段

| 字段路径 | 值 | 说明 |
|----------|-----|------|
| `status_code` | 0 | **API成功状态码（0=成功）** |
| `comment.cid` | "7578754028746720052" | 新生成的评论ID |
| `comment.status` | 7 | **评论状态（7=成功发布）** |
| `comment.reply_id` | "0" | **一级评论的reply_id固定为"0"** |
| `comment.reply_to_reply_id` | "0" | 回复的目标ID（一级评论为"0"） |
| `comment.text` | "测试API拦截-一级评论" | 评论内容 |
| `comment.create_time` | 1764566574 | Unix时间戳（秒） |
| `comment.reply_comment` | null | **一级评论此字段为null** |

---

## 二级回复（对评论的回复）

### 请求体参数

```
aweme_id=7534563676188052786
comment_send_celltime=34787
comment_video_celltime=613560
one_level_comment_rank=3
paste_edit_method=non_paste
reply_id=7565319628098143022
text=%E6%B5%8B%E8%AF%95API%E6%8B%A6%E6%88%AA-%E4%BA%8C%E7%BA%A7%E5%9B%9E%E5%A4%8D
text_extra=%5B%5D
```

#### 参数说明

| 参数名 | 示例值 | 说明 |
|--------|--------|------|
| `aweme_id` | 7534563676188052786 | 视频ID（作品ID） |
| `comment_send_celltime` | 34787 | 评论发送时的时间戳（毫秒） |
| `comment_video_celltime` | 613560 | 视频播放时长（毫秒） |
| `one_level_comment_rank` | 3 | 被回复评论在列表中的排名位置 |
| `paste_edit_method` | non_paste | 输入方式（non_paste=手动输入） |
| **`reply_id`** | **7565319628098143022** | **被回复评论的cid（关键参数！）** |
| `text` | URL编码的回复内容 | 回复文本（需URL编码） |
| `text_extra` | %5B%5D（即[]） | 附加文本信息（空数组） |

**关键特征**: **必须包含 `reply_id` 参数，值为被回复评论的 `cid`**

### 响应数据

```json
{
  "comment": {
    "cid": "7578753299466502954",
    "create_time": 1764566476,
    "digg_count": 0,
    "image_list": null,
    "label_list": null,
    "label_text": "作者",
    "label_type": 1,
    "reply_comment": [
      {
        "cid": "7565319628098143022",
        "create_time": 1764566476,
        "digg_count": 0,
        "reply_id": "0",
        "reply_to_reply_id": "0",
        "status": 1,
        "text": "？[黑脸]我去年冬天晚上经常凌晨两点到四点热醒[黑脸]...",
        "user": {
          "nickname": "纯白",
          "uid": "1383658389264763",
          // ... 被回复用户的完整信息
        },
        "user_digged": 0
      }
    ],
    "reply_id": "7565319628098143022",
    "reply_to_reply_id": "0",
    "status": 7,
    "text": "测试API拦截-二级回复",
    "text_extra": [],
    "text_music_info": null,
    "user": {
      "nickname": "临终关怀志愿者-宝哥",
      "uid": "564495895506771",
      // ... 当前用户信息
    },
    "user_digged": 0,
    "video_list": null
  },
  "log_pb": {
    "impr_id": "202512011321157FD8F3290A8AFCD1543B"
  },
  "status_code": 0
}
```

#### 响应关键字段

| 字段路径 | 值 | 说明 |
|----------|-----|------|
| `status_code` | 0 | **API成功状态码（0=成功）** |
| `comment.cid` | "7578753299466502954" | 新生成的回复ID |
| `comment.status` | 7 | **评论状态（7=成功发布）** |
| `comment.reply_id` | "7565319628098143022" | **被回复评论的cid（与请求一致）** |
| `comment.reply_to_reply_id` | "0" | 回复链的终点ID |
| `comment.text` | "测试API拦截-二级回复" | 回复内容 |
| `comment.create_time` | 1764566476 | Unix时间戳（秒） |
| `comment.reply_comment` | [数组] | **包含被回复评论的完整信息** |
| `comment.reply_comment[0].cid` | "7565319628098143022" | 被回复评论的ID |
| `comment.reply_comment[0].text` | "？[黑脸]我去年..." | 被回复评论的内容 |
| `comment.reply_comment[0].user` | {对象} | 被回复用户的完整信息 |

---

## 成功判断标准

### 如何判断评论/回复是否成功？

根据API拦截测试，判断成功的**多重验证标准**如下：

#### 1. HTTP状态码验证
```javascript
response.status === 200
```

#### 2. 抖音API业务状态码验证（主要依据）
```javascript
const responseBody = JSON.parse(response.body);
responseBody.status_code === 0  // 0表示成功
```

#### 3. 评论状态验证
```javascript
responseBody.comment.status === 7  // 7表示评论成功发布
```

#### 4. 数据完整性验证
```javascript
// 必须返回完整的comment对象
responseBody.comment !== null
// 必须生成新的cid
responseBody.comment.cid !== null && responseBody.comment.cid !== ""
// 必须包含评论文本
responseBody.comment.text === "发送的评论内容"
```

#### 5. 回复关系验证（仅二级回复）
```javascript
// 对于二级回复，必须验证reply_id一致性
if (isSecondLevelReply) {
  responseBody.comment.reply_id === requestBody.reply_id
  // 并且必须包含被回复评论的详细信息
  responseBody.comment.reply_comment !== null
  responseBody.comment.reply_comment.length > 0
  responseBody.comment.reply_comment[0].cid === requestBody.reply_id
}
```

#### 6. UI反馈验证（可选）
- 页面显示"已发布"通知消息
- 评论/回复出现在评论列表中
- 显示"刚刚"时间戳

### 推荐的成功判断实现

```javascript
/**
 * 判断评论/回复是否成功发布
 * @param {Object} response - API响应对象
 * @param {Object} requestParams - 请求参数
 * @returns {Object} { success: boolean, message: string, commentId: string }
 */
function isCommentPublishSuccess(response, requestParams) {
  try {
    // 1. HTTP状态码检查
    if (response.status !== 200) {
      return {
        success: false,
        message: `HTTP错误: ${response.status}`,
        commentId: null
      };
    }

    const body = JSON.parse(response.body);

    // 2. API业务状态码检查（最关键）
    if (body.status_code !== 0) {
      return {
        success: false,
        message: `API错误: status_code=${body.status_code}`,
        commentId: null
      };
    }

    // 3. 评论状态检查
    if (body.comment.status !== 7) {
      return {
        success: false,
        message: `评论状态异常: status=${body.comment.status}`,
        commentId: body.comment.cid || null
      };
    }

    // 4. 数据完整性检查
    if (!body.comment || !body.comment.cid || !body.comment.text) {
      return {
        success: false,
        message: '响应数据不完整',
        commentId: null
      };
    }

    // 5. 二级回复特殊检查
    if (requestParams.reply_id) {
      if (body.comment.reply_id !== requestParams.reply_id) {
        return {
          success: false,
          message: 'reply_id不匹配',
          commentId: body.comment.cid
        };
      }
      if (!body.comment.reply_comment || body.comment.reply_comment.length === 0) {
        return {
          success: false,
          message: '缺少被回复评论信息',
          commentId: body.comment.cid
        };
      }
    }

    // 所有检查通过
    return {
      success: true,
      message: '评论发布成功',
      commentId: body.comment.cid,
      createTime: body.comment.create_time
    };

  } catch (error) {
    return {
      success: false,
      message: `解析错误: ${error.message}`,
      commentId: null
    };
  }
}
```

---

## 关键差异对比

| 特征 | 一级评论 | 二级回复 |
|------|----------|----------|
| **请求参数中是否有reply_id** | ❌ 无 | ✅ 有（值为被回复评论的cid） |
| **响应中的reply_id** | "0" | 被回复评论的cid |
| **响应中的reply_comment** | null | 数组，包含被回复评论详情 |
| **one_level_comment_rank** | -1 | 实际排名位置（如3） |
| **UI显示位置** | 顶层评论列表 | 嵌套在被回复评论下方 |
| **UI前缀** | 无 | "回复@用户名：" |

---

## 错误处理

### 常见错误码

基于测试和抖音平台经验，可能的错误情况：

| status_code | 说明 | 处理建议 |
|-------------|------|----------|
| 0 | 成功 | 正常处理 |
| 非0 | 失败 | 需要根据具体错误码处理 |

### 可能的失败场景

1. **频率限制**: 发送过快会触发限流
2. **内容审核**: 包含敏感词会被拦截
3. **用户权限**: 未登录或账号被限制
4. **视频状态**: 视频已删除或评论已关闭
5. **网络问题**: 请求超时或连接失败

### 重试策略建议

```javascript
async function publishCommentWithRetry(params, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await publishComment(params);
      const result = isCommentPublishSuccess(response, params);

      if (result.success) {
        return result;
      }

      // 如果是业务错误（非网络错误），不重试
      if (response.status === 200) {
        return result;
      }

      // 网络错误，等待后重试
      await sleep(1000 * (i + 1)); // 递增等待时间

    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * (i + 1));
    }
  }
}
```

---

## 实际应用示例

### 发送一级评论

```javascript
const params = new URLSearchParams({
  aweme_id: '7534563676188052786',
  comment_send_celltime: Date.now().toString(),
  comment_video_celltime: '100000', // 当前视频播放位置（毫秒）
  one_level_comment_rank: '-1',
  paste_edit_method: 'non_paste',
  text: encodeURIComponent('这是一条测试评论'),
  text_extra: '[]'
});

const response = await fetch(
  'https://www.douyin.com/aweme/v1/web/comment/publish?' + queryParams,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // ... 其他必要的headers（Cookie等）
    },
    body: params.toString()
  }
);

const result = isCommentPublishSuccess(response, { reply_id: null });
if (result.success) {
  console.log('评论发布成功，cid:', result.commentId);
} else {
  console.error('评论发布失败:', result.message);
}
```

### 发送二级回复

```javascript
const targetCommentId = '7565319628098143022'; // 要回复的评论ID

const params = new URLSearchParams({
  aweme_id: '7534563676188052786',
  comment_send_celltime: Date.now().toString(),
  comment_video_celltime: '100000',
  one_level_comment_rank: '3', // 被回复评论的位置
  paste_edit_method: 'non_paste',
  reply_id: targetCommentId, // 关键参数！
  text: encodeURIComponent('这是一条测试回复'),
  text_extra: '[]'
});

const response = await fetch(
  'https://www.douyin.com/aweme/v1/web/comment/publish?' + queryParams,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // ... 其他必要的headers
    },
    body: params.toString()
  }
);

const result = isCommentPublishSuccess(response, { reply_id: targetCommentId });
if (result.success) {
  console.log('回复发布成功，cid:', result.commentId);
  console.log('回复给评论ID:', targetCommentId);
} else {
  console.error('回复发布失败:', result.message);
}
```

---

## 注意事项

### 1. 认证要求
- 必须携带有效的Cookie（包含登录态）
- webid和uifid等指纹参数必须与当前浏览器会话匹配

### 2. 反爬虫机制
- 需要真实的浏览器环境特征（User-Agent、浏览器指纹等）
- URL中包含大量设备和浏览器信息用于验证
- 建议使用真实浏览器环境发送请求

### 3. 时间参数
- `comment_send_celltime`: 评论发送时的时间戳，应为实时生成
- `comment_video_celltime`: 视频播放时长，应与实际播放进度相符

### 4. 文本编码
- 评论内容必须进行URL编码
- text_extra参数为空时传递`[]`（URL编码为`%5B%5D`）

### 5. 性能考虑
- 避免频繁发送（建议间隔至少3-5秒）
- 实现重试机制处理网络波动
- 缓存成功发送的评论ID，避免重复提交

---

## 总结

本文档基于实际API拦截测试，详细记录了抖音评论发布API的完整调用流程。核心要点：

1. **一级评论与二级回复的唯一关键差异**: 是否包含 `reply_id` 参数
2. **成功判断的最可靠标准**: `status_code === 0` 且 `comment.status === 7`
3. **响应数据完整性**: 成功时会返回完整的comment对象，包含新生成的cid
4. **二级回复的关联验证**: 响应中的reply_id必须与请求一致，且包含被回复评论的完整信息

---

**文档版本**: v1.0
**最后更新**: 2025-12-01
**测试环境**: Chrome 142.0.0.0 / Windows 10
