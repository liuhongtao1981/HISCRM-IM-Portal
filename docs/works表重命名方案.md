# works 表重命名方案

**日期**: 2025-10-27
**问题**: `works` 和 `workers` 表名太相似，容易混淆
**目标**: 选择更清晰的表名，避免命名冲突

---

## 🔍 问题分析

### 当前状况

| 表名 | 用途 | 容易混淆的原因 |
|------|------|----------------|
| `works` | 作品/内容表（视频、帖子等） | 只差一个字母 's' |
| `workers` | Worker 进程注册表 | 只差一个字母 's' |

**典型混淆场景**：
```javascript
// 😕 哪个是作品？哪个是工作进程？
const works = db.prepare('SELECT * FROM works').all();
const workers = db.prepare('SELECT * FROM workers').all();

// 😕 DAO 也容易混淆
const worksDAO = new WorksDAO();
const workersDAO = new WorkersDAO();
```

---

## 💡 重命名方案对比

### 方案 1: 重命名 `works` → `contents` （推荐 ⭐）

| 项目 | 评分 | 说明 |
|------|------|------|
| 语义清晰度 | ⭐⭐⭐⭐⭐ | "内容"更通用，涵盖所有类型 |
| 避免混淆 | ⭐⭐⭐⭐⭐ | `contents` vs `workers` 差异明显 |
| 影响范围 | ⭐⭐⭐⭐ | 约 15 个文件，可控 |
| 未来扩展性 | ⭐⭐⭐⭐⭐ | 支持更多内容类型 |
| 技术债务 | ⭐⭐⭐⭐⭐ | 彻底解决命名问题 |

**改动后的代码**：
```javascript
// ✅ 清晰明了
const contents = db.prepare('SELECT * FROM contents').all();
const workers = db.prepare('SELECT * FROM workers').all();

const contentsDAO = new ContentsDAO();
const workersDAO = new WorkersDAO();
```

### 方案 2: 重命名 `works` → `posts`

| 项目 | 评分 | 说明 |
|------|------|------|
| 语义清晰度 | ⭐⭐⭐⭐ | 社交媒体常用术语 |
| 避免混淆 | ⭐⭐⭐⭐⭐ | `posts` vs `workers` 差异明显 |
| 影响范围 | ⭐⭐⭐⭐ | 约 15 个文件 |
| 未来扩展性 | ⭐⭐⭐ | 偏向社交媒体，限制性稍强 |
| 技术债务 | ⭐⭐⭐⭐ | 解决命名问题 |

### 方案 3: 重命名 `works` → `media_items`

| 项目 | 评分 | 说明 |
|------|------|------|
| 语义清晰度 | ⭐⭐⭐⭐ | 强调媒体属性 |
| 避免混淆 | ⭐⭐⭐⭐⭐ | 完全不同的词汇 |
| 影响范围 | ⭐⭐⭐⭐ | 约 15 个文件 |
| 未来扩展性 | ⭐⭐⭐⭐ | 偏向媒体内容 |
| 技术债务 | ⭐⭐⭐ | 名称较长，书写繁琐 |

### 方案 4: 重命名 `workers` → `worker_nodes`

| 项目 | 评分 | 说明 |
|------|------|------|
| 语义清晰度 | ⭐⭐⭐⭐⭐ | 更明确是节点 |
| 避免混淆 | ⭐⭐⭐⭐⭐ | 完全不同 |
| 影响范围 | ⭐⭐ | 约 30+ 文件，核心架构 |
| 未来扩展性 | ⭐⭐⭐⭐ | 更专业 |
| 技术债务 | ⭐⭐ | 改动大，风险高 |

---

## 🎯 推荐方案：`works` → `contents`

### 为什么选择这个方案？

1. **语义最清晰**
   - "内容"是最通用的概念
   - 涵盖视频、文章、图片、音频等所有类型
   - 符合业务领域术语

2. **避免混淆最彻底**
   ```
   contents ≠ workers  ✅ 差异明显
   posts ≠ workers     ✅ 差异明显
   works ≈ workers     ❌ 太相似
   ```

3. **影响范围可控**
   - Master: 约 10 个文件
   - Worker: 约 5 个文件
   - Tests: 约 9 个文件
   - **总计**: ~24 个文件

4. **未来扩展性最强**
   - 支持多平台内容
   - 支持多种内容类型
   - 不限制业务发展

---

## 📋 实施计划

### 第一阶段：数据库 Schema（核心）

**文件**: `packages/master/src/database/schema.sql`

```sql
-- 修改前
CREATE TABLE works (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_work_id TEXT NOT NULL,
  ...
);

-- 修改后
CREATE TABLE contents (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_content_id TEXT NOT NULL,  -- 也可以改字段名
  ...
);
```

**索引也需要更新**：
```sql
-- 旧索引
CREATE INDEX idx_works_account_id ON works(account_id);
CREATE UNIQUE INDEX idx_works_platform_work_id ON works(account_id, platform, platform_work_id);

-- 新索引
CREATE INDEX idx_contents_account_id ON contents(account_id);
CREATE UNIQUE INDEX idx_contents_platform_content_id ON contents(account_id, platform, platform_content_id);
```

### 第二阶段：DAO 层（数据访问）

**文件改动**：
- `packages/master/src/database/works-dao.js` → `contents-dao.js`
- `packages/master/src/dao/WorksDAO.js` → `ContentsDAO.js`

**类名改动**：
```javascript
// 修改前
class WorksDAO {
  insert(work) { ... }
  findByPlatformWorkId(accountId, platform, workId) { ... }
}

// 修改后
class ContentsDAO {
  insert(content) { ... }
  findByPlatformContentId(accountId, platform, contentId) { ... }
}
```

### 第三阶段：Master API（业务逻辑）

**受影响的文件**：
1. `packages/master/src/index.js` - Socket 消息处理
2. `packages/master/src/communication/message-receiver.js` - Worker 消息接收
3. `packages/master/src/api/routes/im/works.js` → `contents.js` - REST API
4. `packages/master/src/database/init.js` - 数据库初始化
5. `packages/master/src/database/schema-validator.js` - Schema 验证

**API 路由改动**：
```javascript
// 修改前
app.use('/api/im/works', worksRouter);

// 修改后
app.use('/api/im/contents', contentsRouter);
```

### 第四阶段：Worker 爬虫（数据生产者）

**受影响的文件**：
1. `packages/worker/src/platforms/douyin/platform.js` - 平台接口
2. `packages/worker/src/platforms/douyin/crawl-works.js` → `crawl-contents.js` - 爬虫模块
3. `packages/worker/src/platforms/douyin/crawl-comments.js` - 评论爬虫（引用了 works）
4. `packages/worker/src/handlers/account-status-reporter.js` - 状态报告
5. `packages/worker/src/communication/message-reporter.js` - 消息上报

**消息类型改动**：
```javascript
// 修改前
this.bridge.sendMessage('works_data', { works: [...] });

// 修改后
this.bridge.sendMessage('contents_data', { contents: [...] });
```

### 第五阶段：测试脚本（验证）

**受影响的文件**（9 个）：
- `tests/查看最新抓取数据.js`
- `tests/清空所有测试数据表.js`
- `tests/检查所有爬虫数据.js`
- ... 等

**SQL 改动**：
```javascript
// 修改前
const works = db.prepare('SELECT * FROM works').all();

// 修改后
const contents = db.prepare('SELECT * FROM contents').all();
```

### 第六阶段：清理脚本（运维）

**受影响的文件**：
- `packages/master/scripts/clean-database.js`
- `packages/master/clear-tables.js`

---

## 🔧 实施步骤（详细）

### Step 1: 准备工作

```bash
# 1. 创建备份
cp -r packages packages_backup_before_rename

# 2. 备份数据库
cp packages/master/data/master.db packages/master/data/master.db.backup

# 3. 创建新分支
git checkout -b refactor/rename-works-to-contents
```

### Step 2: 数据库迁移

```bash
# 1. 更新 schema.sql
# 手动编辑文件：works → contents

# 2. 创建数据迁移脚本
node packages/master/src/database/migrate-works-to-contents.js
```

**迁移脚本**（需要创建）：
```javascript
// packages/master/src/database/migrate-works-to-contents.js
const db = new Database('./data/master.db');

db.exec('BEGIN TRANSACTION');

try {
  // 1. 创建新表
  db.exec(fs.readFileSync('./schema.sql', 'utf8'));

  // 2. 迁移数据
  db.exec(`
    INSERT INTO contents
    SELECT * FROM works
  `);

  // 3. 删除旧表
  db.exec('DROP TABLE works');

  db.exec('COMMIT');
  console.log('✅ 迁移成功');
} catch (error) {
  db.exec('ROLLBACK');
  console.error('❌ 迁移失败:', error);
}
```

### Step 3: 批量替换代码

```bash
# 使用 sed 批量替换（谨慎操作）
find packages -name "*.js" -type f -exec sed -i 's/\bworks\b/contents/g' {} \;
find packages -name "*.js" -type f -exec sed -i 's/\bWorkDAO\b/ContentDAO/g' {} \;
find packages -name "*.js" -type f -exec sed -i 's/work_/content_/g' {} \;
```

### Step 4: 手动调整细节

某些地方需要手动检查：
- 变量名：`work` → `content`
- 函数名：`getWorks()` → `getContents()`
- 注释和文档

### Step 5: 测试验证

```bash
# 1. 启动 Master
npm run start:master

# 2. 启动 Worker
npm run start:worker

# 3. 运行测试脚本
node tests/查看最新抓取数据.js
node tests/清空所有测试数据表.js

# 4. 手动验证功能
# - 作品抓取
# - 评论抓取
# - 私信抓取
```

---

## ⚠️ 风险评估

### 高风险项

1. **数据库迁移失败**
   - 风险：数据丢失
   - 缓解：提前备份，事务保护

2. **批量替换错误**
   - 风险：改错代码
   - 缓解：Git 版本控制，手动检查关键文件

3. **API 不兼容**
   - 风险：客户端连接失败
   - 缓解：保持消息格式兼容，或同时支持新旧两种

### 中风险项

1. **测试脚本遗漏**
   - 风险：测试数据残留
   - 缓解：全面搜索 `works` 关键字

2. **日志和错误信息**
   - 风险：调试困难
   - 缓解：更新所有日志输出

---

## 📊 工作量估算

| 阶段 | 文件数 | 预计时间 | 风险等级 |
|------|--------|----------|----------|
| Schema 更新 | 1 | 30 分钟 | 🟡 中 |
| DAO 层改动 | 2 | 1 小时 | 🟡 中 |
| Master API | 5 | 2 小时 | 🔴 高 |
| Worker 爬虫 | 5 | 1.5 小时 | 🟡 中 |
| 测试脚本 | 9 | 1 小时 | 🟢 低 |
| 清理脚本 | 2 | 30 分钟 | 🟢 低 |
| 测试验证 | - | 2 小时 | 🟡 中 |
| **总计** | **~24** | **8-9 小时** | 🟡 **中** |

---

## 🎯 决策建议

### 立即执行 ✅

**如果满足以下条件**：
- ✅ 项目处于开发阶段
- ✅ 有充足的测试环境
- ✅ 团队成员都同意
- ✅ 有完整的备份

### 延后执行 ⏳

**如果满足以下条件**：
- ❌ 项目已上线生产环境
- ❌ 时间紧迫
- ❌ 缺少测试资源
- ❌ 团队对命名无强烈意见

### 替代方案 💡

**不重命名，使用代码规范**：
```javascript
// 使用别名区分
const contentWorks = worksDAO.findAll();  // 作品
const workerNodes = workersDAO.findAll(); // 工作进程

// 或使用模块前缀
import { works as contentWorks } from './database/works-dao';
import { workers as workerNodes } from './database/workers-dao';
```

---

## 📝 提交信息模板

```bash
git add -A
git commit -m "refactor: 重命名 works 表为 contents 表以避免与 workers 混淆

重命名范围：
- 数据库表: works → contents
- DAO 类: WorksDAO → ContentsDAO
- API 路由: /api/im/works → /api/im/contents
- 爬虫模块: crawl-works.js → crawl-contents.js

修改文件:
- Master: 10 个文件
- Worker: 5 个文件
- Tests: 9 个文件

影响：
- ✅ 提高代码可读性
- ✅ 避免 works/workers 混淆
- ✅ 更清晰的业务语义
- ✅ 数据完整性保持

迁移：
- 数据已从 works 表迁移到 contents 表
- 所有索引和约束已重建
- 测试通过

Breaking Changes:
- API 端点变更: /api/im/works → /api/im/contents
- Socket 消息类型变更: works_data → contents_data
"
```

---

**决策**: 建议采用 **方案 1**（`works` → `contents`）
**优先级**: 中等（建议在下一个版本迭代时完成）
**预计工时**: 8-9 小时（1 个工作日）
