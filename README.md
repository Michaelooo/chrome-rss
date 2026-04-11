# Chrome RSS Reader

一个现代化的 Chrome RSS 阅读器插件，灵感来自 Feedbro，使用最新的 Manifest V3 规范构建。

## 功能特性

### 核心功能
- RSS/Atom Feed 订阅管理
- 三栏式高效阅读界面（Feed列表 - 文章列表 - 阅读器）
- 文章已读/未读状态管理
- 文章收藏功能（星标）
- 后台自动更新 Feed
- 通知提醒新文章
- 搜索文章功能
- 浅色/深色主题切换（即时生效，支持跟随系统）

### AI 功能
- **文章摘要**：自动为文章生成摘要和标签，支持手动触发
- **每日简报**：自动生成每日简报，按重要性（高/中/低）分类
- 支持自定义 OpenAI 兼容 API 端点和模型

### 过滤规则
- 按标题/内容/作者/链接设置过滤条件
- 支持正则表达式匹配
- AND/OR 逻辑组合
- 动作：标记已读、加星、删除、添加标签
- 支持全局规则和按订阅源规则

### 数据管理
- IndexedDB 本地存储，支持离线访问
- OPML 导入/导出
- 全文抓取功能
- 智能更新策略（可配置更新间隔）
- 文章自动清理（可配置保留时间）
- 存储空间管理

### 界面特性
- 现代化设计，简洁高效
- 虚拟滚动，支持海量文章
- 可调整栏宽的三栏布局
- 键盘快捷键支持
- 中英文双语支持

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite + @crxjs/vite-plugin
- **样式**: TailwindCSS
- **状态管理**: Zustand
- **数据库**: IndexedDB (Dexie.js)
- **UI 组件**: Radix UI
- **图标**: Lucide React

## 安装说明

### 开发环境

1. 克隆仓库并安装依赖：
```bash
pnpm install
```

2. 开发模式（支持热更新）：
```bash
pnpm dev
```

3. 构建生产版本：
```bash
pnpm build
```

### 加载到 Chrome

1. 构建项目：`pnpm build`
2. 打开 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"，选择 `dist/` 目录

## 使用指南

### 添加 Feed
点击侧边栏 ➕ 按钮，输入 RSS Feed URL

### 阅读文章
左侧边栏选择 Feed → 中间栏点击文章 → 右侧阅读器显示内容

### 过滤规则
侧边栏点击漏斗图标，创建过滤规则。支持按标题、内容、作者、链接设置条件，支持正则和逻辑组合。

### 设置
点击工具栏设置按钮，可配置主题、更新间隔、AI 接口、翻译等。

## 项目结构

```
src/
├── background/            # Service Worker（后台处理）
├── components/
│   ├── layout/           # 布局组件（三栏）
│   ├── feed/             # Feed 管理对话框
│   ├── filter/           # 过滤规则组件
│   └── ui/               # 通用 UI 组件
├── lib/
│   ├── ai/               # AI 客户端和提示词
│   ├── filter/           # 过滤规则引擎
│   ├── parser/           # RSS/Atom 解析器
│   ├── storage/          # IndexedDB 数据库
│   ├── fetcher/          # Feed 抓取
│   └── i18n/             # 国际化
├── pages/
│   ├── main/             # 主界面
│   ├── popup/            # 弹出窗口
│   └── options/          # 设置页面
├── store/                # Zustand 状态管理
└── types/                # TypeScript 类型定义
```

## 常见问题

### Q: 支持哪些 Feed 格式？
A: 支持 RSS 2.0 和 Atom 1.0 格式。

### Q: 数据存储在哪里？
A: 所有数据使用 IndexedDB 存储在本地，不上传云端。

### Q: AI 功能如何使用？
A: 在设置页配置 OpenAI 兼容的 API 端点和 Key 即可启用。

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 致谢

本项目灵感来自 Feedbro，感谢所有开源项目的贡献者。
