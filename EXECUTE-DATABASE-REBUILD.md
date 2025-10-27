# 📌 数据库重建执行指令

**创建时间**: 2025-10-27
**执行状态**: ⏸️ 等待用户执行

---

## ⚠️ 重要说明

当前数据库文件被 Node 进程占用，无法直接删除。需要您手动执行以下步骤完成数据库重建。

---

## 📋 执行步骤

### Step 1: 关闭所有数据库连接

请关闭以下所有进程（如果正在运行）：

```bash
# 1. Master 服务器
按 Ctrl+C 停止 Master 进程

# 2. Worker 进程
按 Ctrl+C 停止 Worker 进程

# 3. 所有测试脚本
按 Ctrl+C 停止任何正在运行的测试

# 4. 验证没有 Node 进程占用数据库
tasklist | grep node
```

### Step 2: 执行数据库重建脚本

在项目根目录执行：

```bash
node scripts/rebuild-database.js
```

### Step 3: 验证重建结果

脚本会自动验证，您应该看到：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 数据库重建完成！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 说明:
   - 新数据库使用最终 schema (v1.0)
   - 已迁移核心配置数据 (accounts, workers, proxies)
   - 业务数据表已清空
   - 现在可以启动 Master 和 Worker 开始爬取数据
```

---

## ✅ 重建完成后

### 1. 启动 Master

```bash
cd packages/master
npm start
```

### 2. 启动 Worker

```bash
cd packages/worker
npm start
```

### 3. 验证数据爬取

Worker 会自动开始监控和爬取数据到以下表：
- `contents` - 作品数据
- `comments` - 评论数据
- `discussions` - 讨论数据
- `direct_messages` - 私信数据
- `conversations` - 会话数据

---

## 📊 已完成的工作

本次会话已完成：

1. ✅ **works → contents 重命名**
   - 表名: `works` → `contents`
   - 字段: `platform_work_id` → `platform_content_id`
   - 统计字段添加 `stats_` 前缀
   - 账户表字段: `total_works` → `total_contents`
   - 批量代码更新: 51 个文件，626 处替换

2. ✅ **清理迁移历史**
   - 删除所有 `migrate-*.js` 迁移脚本
   - `schema.sql` 现为初始版本 (v1.0)
   - 简化数据库初始化流程

3. ✅ **创建重建工具**
   - `scripts/rebuild-database.js` - 一键重建脚本
   - `scripts/migrate-config-from-backup.js` - 配置迁移脚本
   - `docs/数据库重建指南.md` - 完整文档

4. ✅ **Git 提交**
   - 提交 1: `436390a` - works → contents 重命名
   - 提交 2: `f5ac6ae` - 移除迁移脚本，添加重建工具

---

## 📁 关键文件

### 脚本文件
- [scripts/rebuild-database.js](scripts/rebuild-database.js) - **一键重建（推荐）**
- [scripts/migrate-config-from-backup.js](scripts/migrate-config-from-backup.js) - 配置迁移
- [scripts/README-数据库重建.md](scripts/README-数据库重建.md) - 快速指南

### 文档
- [docs/数据库重建指南.md](docs/数据库重建指南.md) - **详细指南**
- [docs/works重命名为contents完成报告.md](docs/works重命名为contents完成报告.md) - 重命名报告

### Schema
- [packages/master/src/database/schema.sql](packages/master/src/database/schema.sql) - 最终 schema (v1.0)
- [packages/master/src/database/init.js](packages/master/src/database/init.js) - 初始化脚本

### 备份
- `packages/master/data/master.db.config_backup_20251027` - 配置备份（1 账户 + 1 Worker + 1 代理）

---

## ❌ 故障排除

### 问题: 数据库文件仍被占用

**解决方案**:
```bash
# 方法 1: 强制关闭所有 Node 进程
taskkill /F /IM node.exe

# 方法 2: 重启终端后重试

# 方法 3: 重启计算机（最后手段）
```

### 问题: 备份文件不存在

**检查**:
```bash
ls -lh packages/master/data/master.db*
```

如果没有备份，可以：
1. 跳过配置迁移，手动配置账户
2. 使用其他备份文件（修改脚本中的路径）

---

## 📞 需要帮助？

如果遇到问题，请查看：
1. [docs/数据库重建指南.md](docs/数据库重建指南.md) - 完整文档
2. [scripts/README-数据库重建.md](scripts/README-数据库重建.md) - 快速指南
3. 检查 Git 提交历史了解变更详情

---

**下一步**: 请按照上述步骤执行数据库重建 🚀
