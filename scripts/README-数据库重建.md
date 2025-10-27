# 数据库重建快速指南

## ⚠️ 重要提示

执行前请确保：
1. ✅ 已关闭所有数据库连接（Master、Worker、测试脚本）
2. ✅ 已备份重要数据（如有）

## 🚀 一键执行

```bash
# 在项目根目录执行
node scripts/rebuild-database.js
```

## 📋 执行内容

1. 删除旧数据库文件
2. 创建新数据库（基于 schema.sql v1.0）
3. 从备份恢复配置数据：
   - accounts (账户配置)
   - workers (Worker 配置)
   - proxies (代理配置)
4. 验证数据库结构

## ✅ 预期结果

```
✅ 数据库表列表 (共 16 个)
✅ 配置数据已恢复:
   - accounts: 1 条
   - workers: 1 条
   - proxies: 1 条
✅ 业务数据已清空（准备重新爬取）
```

## ❌ 常见错误

### 错误 1: 数据库文件被占用

```
❌ 删除失败 (文件可能被占用): master.db
```

**解决**:
```bash
# 关闭所有 Node 进程
tasklist | grep node
# 或强制关闭
taskkill /F /IM node.exe
```

### 错误 2: 备份文件不存在

**解决**: 检查 `packages/master/data/` 目录是否有备份文件

## 📖 详细文档

查看完整文档：[docs/数据库重建指南.md](../docs/数据库重建指南.md)
