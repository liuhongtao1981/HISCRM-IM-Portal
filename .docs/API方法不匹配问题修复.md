# Proxies API PUT/PATCH 方法不匹配问题修复

## 问题描述

用户报告访问 `http://localhost:3001/api/v1/proxies/485f9498-82af-46e7-929d-19a5c245f0ee` 时返回 404 错误。

## 根本原因

**HTTP 方法不匹配**：
- Admin Web 前端使用 `api.put()` 方法
- Master 后端定义的是 `router.patch()` 方法
- PUT 请求没有对应的路由处理器，导致 404

## 修复内容

### [packages/admin-web/src/services/api.js:75](../packages/admin-web/src/services/api.js#L75)

```javascript
// 之前
updateProxy: (id, data) => api.put(`/proxies/${id}`, data),

// 修复后
updateProxy: (id, data) => api.patch(`/proxies/${id}`, data),
```

## 技术说明

### PUT vs PATCH 的区别

- **PUT**: 完全替换资源，需要提供所有字段
- **PATCH**: 部分更新资源，只需提供要更新的字段

Master 服务使用 PATCH 是正确的选择，因为：
1. 代理更新通常只修改部分字段（如状态、名称等）
2. PATCH 更符合 RESTful API 最佳实践
3. 避免客户端需要发送完整对象

## 验证方法

```bash
# 测试更新代理 API
curl -X PATCH http://localhost:3000/api/v1/proxies/{proxy-id} \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'
```

预期返回：
```json
{
  "success": true,
  "data": {
    "id": "...",
    "name": "...",
    "status": "active",
    // ...
  }
}
```

## 相关文件

- [packages/admin-web/src/services/api.js](../packages/admin-web/src/services/api.js) - 前端 API 服务
- [packages/master/src/api/routes/proxies.js](../packages/master/src/api/routes/proxies.js) - 后端路由定义

## 其他 API 端点

检查确认其他 proxies API 端点方法正确：
- ✅ GET `/api/v1/proxies` - 获取列表
- ✅ GET `/api/v1/proxies/:id` - 获取单个
- ✅ POST `/api/v1/proxies` - 创建
- ✅ PATCH `/api/v1/proxies/:id` - 更新（已修复）
- ✅ DELETE `/api/v1/proxies/:id` - 删除
- ✅ POST `/api/v1/proxies/:id/test` - 测试连接