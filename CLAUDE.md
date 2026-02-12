# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在此代码仓库中工作时提供指导。

## 项目概览

这是一个基于 Manifest V3 规范构建的 Chrome 浏览器扩展 RSS 阅读器，灵感来自 Feedbro。它是一个现代化的客户端应用程序，运行在 Chrome 浏览器环境中，使用 IndexedDB 进行本地存储。

## 开发命令

### 核心开发命令
```bash
# 安装依赖
pnpm install

# 启动开发服务器（支持热重载）
pnpm dev

# 仅进行类型检查（不构建）
pnpm type-check

# 构建生产版本
pnpm build

# 仅构建后台 Service Worker
pnpm build:bg

# 创建发布用的 ZIP 包
pnpm build:zip
```

### Chrome 扩展加载步骤
1. 构建项目：`pnpm build`
2. 打开 `chrome://extensions/`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"并选择 `dist/` 目录

## 构建系统架构

项目使用**两个独立的 Vite 配置**来处理不同的构建目标：

### 主 UI 构建 (`vite.config.ts`)
- 构建 React 组件和页面（main、popup、options）
- 输出到 `dist/` 目录，资源文件在 `assets/` 中
- 输入文件：`index.html`、`popup.html`、`options.html`
- 包含 React 插件和路径别名（`@/` → `./src`）

### 后台 Service Worker 构建 (`vite.config.background.ts`)
- 将 Service Worker 构建为单个 IIFE 包
- 入口：`src/background/index.ts` → `dist/background.js`
- 无代码分割（Service Worker 要求）
- 使用 `emptyOutDir: false` 保留主构建输出

### 构建流程
1. TypeScript 类型检查
2. 主 UI 构建（React 页面）
3. 后台 Service Worker 构建
4. 两个输出合并到 `dist/` 目录

## 核心架构模式

### 状态管理 (Zustand)
- 全局状态存储在 `src/store/index.ts`
- 管理 feeds、文章、文件夹、设置和 UI 状态
- 包含数据加载和 UI 更新的 Actions
- 无复杂中间件，简单直接

### 数据持久化 (IndexedDB via Dexie)
- 数据库架构定义在 `src/lib/storage/db.ts`
- 数据表：feeds、articles、folders、filters、settings
- 复合索引确保高效查询
- 批量操作提升性能

### 后台处理 (Service Worker)
- 入口文件：`src/background/index.ts`
- Chrome 定时器用于周期性 Feed 更新（15分钟间隔）
- UI 与后台之间的消息路由
- 徽章更新和通知管理

### 组件架构
- 三栏布局：`Sidebar` → `ArticleList` → `ArticleReader`
- 布局组件位于 `src/components/layout/`
- 功能组件位于 `src/components/feed/`
- 可复用 UI 组件位于 `src/components/ui/`
- 使用 Radix UI 提供无障碍的无头组件

### RSS 解析
- 自定义 XML 解析器位于 `src/lib/parser/rss-parser.ts`
- 无外部依赖，轻量级标记化处理
- 支持 RSS 2.0 和 Atom 1.0 格式
- 处理 CDATA 节和 HTML 内容

## 目录结构

```
src/
├── background/           # Service Worker（后台处理）
├── components/
│   ├── layout/          # 主 UI 布局（三栏）
│   ├── feed/           # Feed 管理对话框
│   └── ui/             # 可复用组件
├── lib/
│   ├── storage/        # IndexedDB 数据库操作
│   ├── fetcher/        # RSS feed 抓取逻辑
│   ├── parser/         # 自定义 RSS/Atom XML 解析器
│   ├── chrome/         # Chrome 扩展 API
│   ├── translation/    # Google 翻译集成
│   ├── events/         # 文章事件处理器
│   └── utils/          # 工具函数
├── pages/
│   ├── main/           # 主阅读器界面（index.html）
│   ├── popup/          # 扩展弹窗（popup.html）
│   └── options/        # 设置页面（options.html）
├── store/              # Zustand 全局状态
└── types/              # TypeScript 类型定义
```

## 扩展页面

### 主阅读器 (`src/pages/main/index.tsx`)
- 三栏布局的主界面
- Feed 列表、文章列表和文章阅读器
- 可调整大小的栏位，虚拟化滚动

### 弹窗 (`src/pages/popup/index.tsx`)
- 快速访问窗口（400x600px）
- 显示最近的未读文章
- 快速操作：刷新、设置访问

### 选项页 (`src/pages/options/index.tsx`)
- 设置和偏好配置
- 主题、更新间隔、通知
- 翻译设置

## 关键技术决策

### Chrome 扩展特定
- **Manifest V3**：最新标准（V2 已弃用）
- **Service Worker**：替代后台页面，更安全
- **仅本地存储**：IndexedDB，无云同步（隐私保护）
- **消息传递**：UI 与后台之间的通信

### 技术选择
- **React 18 + TypeScript**：现代前端技术栈
- **TailwindCSS**：实用优先的样式，更小的包体积
- **Zustand**：轻量级状态管理，比 Redux 更少样板代码
- **Dexie.js**：支持 TypeScript 的 IndexedDB 包装器
- **自定义 RSS 解析器**：无外部依赖，轻量级
- **Radix UI**：无样式的无障碍组件

### 性能优化
- **虚拟化滚动**：使用 `react-virtuoso` 处理大量文章列表
- **高效查询**：IndexedDB 中的复合索引
- **批量操作**：批量数据库更新
- **分离构建**：UI 与 Service Worker 的不同优化

## 开发指南

### 添加新功能
- 检查是否需要后台处理（Service Worker）
- 考虑 IndexedDB 架构变更（需要迁移）
- 在 `src/types/index.ts` 中更新 TypeScript 类型
- 遵循 `src/components/` 中的现有组件模式

### 数据库变更
- 在 `src/lib/storage/db.ts` 中修改架构
- 如果更改现有表，添加迁移逻辑
- 更新 TypeScript 接口
- 使用现有数据进行测试

### Dexie 布尔值索引查询注意事项
**重要**：Dexie 对布尔值索引的查询有限制
- ❌ **错误写法**：`where('isRead').equals(0)` - 无法正确匹配 `false`
- ✅ **正确写法**：使用 `and()` 过滤器或使用复合索引
  ```javascript
  // 错误
  db.articles.where('isRead').equals(0).toArray()
  // 正确 - 方式1：使用 and 过滤器
  db.articles.where('isRead').and(a => !a.isRead).toArray()
  // 正确 - 方式2：使用复合索引 [feedId+isRead]
  db.articles.where('[feedId+isRead]').equals([feedId, 0]).toArray()
  // 或先获取数据再过滤（适合少量数据）
  const all = await db.articles.where('pubDate').reverse().limit(50).toArray()
  const unread = all.filter(a => !a.isRead)
  ```

### 后台任务
- 添加到 `src/background/index.ts`
- 使用 Chrome 定时器处理周期性任务
- 实现 UI 通信的消息处理器
- 根据需要更新徽章/通知

### UI 组件
- 使用 Radix UI 原语确保无障碍性
- 遵循 TailwindCSS 实用模式
- 保持组件专注和可复用
- 使用适当的 TypeScript props 接口

## Chrome 扩展测试

### 开发测试
1. 使用 `pnpm build` 构建
2. 在 Chrome 中加载未打包的扩展
3. 检查浏览器控制台错误
4. 测试所有三个页面（main、popup、options）
5. 验证后台 Service Worker 功能

### 扩展特定测试
- Feed 在后台正常更新
- 通知正确显示
- 徽章更新显示未读计数
- 存储在浏览器会话间持久化
- 所有扩展页面正常通信

## 常见开发任务

### 添加新的 RSS 解析器功能
1. 修改 `src/lib/parser/rss-parser.ts`
2. 为解析数据更新 TypeScript 类型
3. 使用各种 RSS/Atom feeds 进行测试
4. 如果存储新字段，更新数据库架构

### 添加 UI 组件
1. 在 `src/components/ui/` 中创建可复用组件
2. 使用 Radix UI 原语确保无障碍性
3. 使用 TailwindCSS 实用工具进行样式设计
4. 从组件索引文件中导出

### 修改数据库架构
1. 在 `src/lib/storage/db.ts` 中更新架构
2. 递增版本号
3. 为现有数据添加迁移逻辑
4. 更新 TypeScript 接口
5. 使用现有扩展数据进行测试

### 后台处理更改
1. 修改 `src/background/index.ts`
2. 如果添加新通信，更新消息类型
3. 测试基于定时器的更新
4. 验证适当的错误处理

此代码库结构良好，适用于 Chrome 扩展开发，在 UI、后台处理和数据持久化之间有清晰的关注点分离。