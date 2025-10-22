# 开发指南

## 🚀 快速开始

### 方式一：单独运行前端（推荐用于 UI 开发）

```bash
npm run dev
```

然后在浏览器访问: http://localhost:5173

### 方式二：运行完整 Electron 应用

**步骤 1：启动 Vite 开发服务器**
```bash
npm run dev
```

**步骤 2：在另一个终端运行 Electron**
```bash
npm run electron
```

或者使用一条命令（会自动等待 Vite 启动）：
```bash
npm run electron:dev
```

## 📦 构建打包

```bash
npm run electron:build
```

打包后的文件在 `release/` 目录

## 🛠 开发脚本说明

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器（前端） |
| `npm run build` | 构建前端生产版本 |
| `npm run build:electron` | 构建 Electron 主进程 |
| `npm run electron` | 构建并启动 Electron |
| `npm run electron:dev` | 同时启动 Vite + Electron（开发模式） |
| `npm run electron:build` | 完整构建并打包 |

## 🐛 常见问题

### Q: Vite 开发服务器无法启动
A: 检查端口 5173 是否被占用，可以修改 vite.config.ts 中的 port 配置

### Q: Electron 窗口显示空白
A: 确保 Vite 开发服务器已经启动并运行在 http://localhost:5173

### Q: 代码修改后没有热更新
A: Vite 支持热更新，但 Electron 主进程代码修改后需要重启 Electron

### Q: 如何只开发前端 UI？
A: 运行 `npm run dev`，然后在浏览器中开发，速度更快

## 📝 开发流程建议

1. **UI 开发阶段**
   - 只运行 `npm run dev`
   - 在浏览器中开发和调试
   - 使用 Mock 数据测试

2. **集成测试阶段**
   - 运行 `npm run electron:dev`
   - 在 Electron 环境中测试
   - 测试 IPC 通信和原生功能

3. **打包发布阶段**
   - 运行 `npm run electron:build`
   - 测试打包后的应用
   - 发布到生产环境

## 🔧 项目结构

```
crm-pc-im/
├── electron/              # Electron 主进程代码
│   ├── main.ts           # 主进程入口
│   └── preload.ts        # Preload 脚本
├── src/                  # React 前端代码
│   ├── components/       # 组件
│   ├── pages/            # 页面
│   ├── services/         # 服务层
│   ├── store/            # Redux 状态
│   └── shared/           # 共享代码
├── dist/                 # Vite 构建输出（前端）
├── dist-electron/        # Electron 构建输出（主进程）
└── release/              # 最终打包输出
```

## 💡 开发技巧

1. **使用浏览器调试前端**
   - 更快的热更新
   - 更好的开发工具
   - 更方便的调试

2. **使用 Electron 调试主进程**
   - 主进程代码修改后需重启
   - 使用 `console.log` 查看主进程日志
   - F12 打开渲染进程开发工具

3. **Mock 数据开发**
   - 前期使用 Mock 数据快速开发
   - 后期切换到真实 API

## 📚 相关文档

- [Vite 文档](https://vitejs.dev/)
- [Electron 文档](https://www.electronjs.org/)
- [React 文档](https://react.dev/)
- [Ant Design 文档](https://ant.design/)
