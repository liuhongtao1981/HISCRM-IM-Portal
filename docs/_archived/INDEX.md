# 文档索引

HisCRM-IM 项目的完整文档索引。

## 📚 主要文档

### 系统设计与架构文档

1. **[01-ADMIN-WEB-系统文档.md](01-ADMIN-WEB-系统文档.md)** - 管理平台前端系统设计
2. **[02-MASTER-系统文档.md](02-MASTER-系统文档.md)** - Master 服务器系统设计
3. **[03-WORKER-系统文档.md](03-WORKER-系统文档.md)** - Worker 爬虫系统设计
4. **[快速参考-系统文档.md](快速参考-系统文档.md)** - 系统文档快速参考

### 平台扩展与实现

5. **[04-WORKER-平台扩展指南.md](04-WORKER-平台扩展指南.md)** - 如何添加新平台支持
6. **[05-DOUYIN-平台实现技术细节.md](05-DOUYIN-平台实现技术细节.md)** - 抖音平台实现细节
7. **[07-DOUYIN-消息回复功能技术总结.md](07-DOUYIN-消息回复功能技术总结.md)** - 评论/私信回复功能实现

### 调试与开发指南

8. **[06-WORKER-爬虫调试指南.md](06-WORKER-爬虫调试指南.md)** - Worker 爬虫调试方法
9. **[Debug模式使用指南.md](Debug模式使用指南.md)** - 调试模式快速入门
10. **[WORKER-DEBUG-MODE-GUIDE.md](WORKER-DEBUG-MODE-GUIDE.md)** - Worker 调试模式详细指南
11. **[WORKER-BROWSER-DEBUG-GUIDE.md](WORKER-BROWSER-DEBUG-GUIDE.md)** - 浏览器调试指南

### 功能实现路线图

12. **[08-DOUYIN-Phase8-私信爬虫改进实现路线图.md](08-DOUYIN-Phase8-私信爬虫改进实现路线图.md)** - 私信功能改进计划

### 验证与报告

13. **[FINAL-VERIFICATION-REPORT.md](FINAL-VERIFICATION-REPORT.md)** - 最终验证报告
14. **[项目完成度状态报告.md](项目完成度状态报告.md)** - 项目状态报告

### 其他参考文档

15. **[VIRTUAL-LIST-DOM-MAPPING.md](VIRTUAL-LIST-DOM-MAPPING.md)** - 虚拟列表与 DOM 映射
16. **[VIRTUAL-LIST-INVESTIGATION-COMPLETE.md](VIRTUAL-LIST-INVESTIGATION-COMPLETE.md)** - 虚拟列表调查完整报告
17. **[MASTER-TEST-REPORT.md](MASTER-TEST-REPORT.md)** - Master 测试报告
18. **[README.md](README.md)** - 文档首页

**主要文档总数: 18 个**

---

## 📦 归档文档

### _archived 目录

包含历史版本和已完成的实现指南：

- **07-WORKER-回复功能完整设计.md** - 回复功能完整设计（旧版）
- **08-DOUYIN-回复功能选择器分析.md** - 回复功能选择器分析
- **09-DOUYIN-回复功能实现指南.md** - 回复功能实现指南（旧版）
- **10-DOUYIN-私信回复选择器验证.md** - 私信回复选择器验证
- **11-DOUYIN-私信ID定位和匹配指南.md** - 私信ID定位指南
- **12-DOUYIN-从虚拟列表提取消息ID指南.md** - 虚拟列表提取ID指南
- **13-DOUYIN-代码实现分析和完整集成指南.md** - 代码实现分析

#### 验证和测试文档

- **CHROME_DEVTOOLS_VERIFICATION_REPORT.md** - Chrome DevTools 验证报告
- **COMMENT_ID_EXTRACTION_COMPLETE.md** - 评论ID提取完成报告
- **DIRECT_MESSAGE_API_VERIFICATION_***.md** - 私信API验证文档集
- **ERROR_HANDLING_IMPLEMENTATION_SUMMARY.md** - 错误处理实现总结
- **INTEGRATION_TESTING_ROADMAP.md** - 集成测试路线图

#### Session 记录

- **SESSION_COMPLETION_REPORT.md** - Session 完成报告
- **SESSION_SUMMARY.md** - Session 总结
- **WORK_SUMMARY.md** - 工作总结
- **UNIT_TESTING_COMPLETE.md** - 单元测试完成报告

### _archived_session 目录

包含历史 Session 的完整记录和验证文档：

- **PHASE7_***.md - Phase 7 相关文档
- **PHASE8_***.md - Phase 8 相关文档
- **PHASE9_***.md - Phase 9 相关文档
- **Chrome-DevTools-私信抓取验证指南.md** - Chrome DevTools 验证指南
- **Douyin-IM-API端点参考.md** - 抖音 IM API 参考
- **PROJECT_COMPLETION_SUMMARY.md** - 项目完成总结

---

## 🗂️ 文件组织结构

```
docs/
├── INDEX.md                                    # 本文件 - 文档索引
├── README.md                                   # 文档首页
│
├── 主要文档 (按功能分类)
│   ├── 01-ADMIN-WEB-系统文档.md
│   ├── 02-MASTER-系统文档.md
│   ├── 03-WORKER-系统文档.md
│   ├── 04-WORKER-平台扩展指南.md
│   ├── 05-DOUYIN-平台实现技术细节.md
│   ├── 06-WORKER-爬虫调试指南.md
│   ├── 07-DOUYIN-消息回复功能技术总结.md
│   ├── 08-DOUYIN-Phase8-私信爬虫改进实现路线图.md
│   └── ...
│
├── _archived/                                  # 旧版实现文档和验证报告
│   ├── 07-WORKER-回复功能完整设计.md
│   ├── 08-DOUYIN-回复功能选择器分析.md
│   ├── ...
│   └── INTEGRATION_TESTING_ROADMAP.md
│
└── _archived_session/                          # 历史 Session 文档和阶段报告
    ├── PHASE7_SUMMARY.md
    ├── PHASE8_*.md
    ├── PHASE9_*.md
    └── ...
```

---

## 🎯 快速导航

### 按功能查找文档

#### 需要了解系统架构？
→ 从 [02-MASTER-系统文档.md](02-MASTER-系统文档.md) 和 [03-WORKER-系统文档.md](03-WORKER-系统文档.md) 开始

#### 需要调试 Worker？
→ 查看 [06-WORKER-爬虫调试指南.md](06-WORKER-爬虫调试指南.md) 和 [Debug模式使用指南.md](Debug模式使用指南.md)

#### 需要实现新平台？
→ 查看 [04-WORKER-平台扩展指南.md](04-WORKER-平台扩展指南.md)

#### 需要了解回复功能？
→ 查看 [07-DOUYIN-消息回复功能技术总结.md](07-DOUYIN-消息回复功能技术总结.md)

#### 需要使用 MCP？
→ 查看 [MCP-QUICK-REFERENCE.md](MCP-QUICK-REFERENCE.md)

#### 查看历史实现步骤？
→ 查看 `_archived` 目录中的相关文档

#### 查看阶段性报告？
→ 查看 `_archived_session` 目录中的 PHASE 文档

---

## 📊 文档统计

| 类别 | 数量 | 说明 |
|------|------|------|
| **主要文档** | 21 | 核心参考文档（docs/ 根目录）|
| **归档文档** | 56 | 已完成/过时的实现文档（_archived/）|
| **Session 文档** | 37 | 历史阶段报告（_archived_session/）|
| **总计** | **114** | 完整文档集合 |

---

## 📝 文档维护

- **更新日期**: 2025-10-21
- **最后更新**: 清理调试文档，优化目录结构
- **版本**: 1.1

### 如何贡献

1. 新文档请放在 `docs/` 根目录
2. 完成或过时的文档请移至 `docs/_archived/`
3. 历史 Session 相关文档请保存在 `docs/_archived_session/`
4. 调试/临时文档也应归档到 `docs/_archived/`
5. 更新此索引文件以保持最新

### 最近更改

- ✅ 根目录 session 文档移至 `docs/_archived/`（11 个）
- ✅ packages 测试脚本移至 `tests/packages/`（3 个）
- ✅ .docs 实现文档移至 `docs/_archived_session/`（19 个）
- ✅ 调试/MCP 文档移至 `docs/_archived/`（19 个）

---

Generated with Claude Code | 2025-10-21
