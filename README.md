# Chrome RSS Reader

一个现代化的 Chrome RSS 阅读器插件，灵感来自 Feedbro，使用最新的 Manifest V3 规范构建。

## 功能特性

### 核心功能
- ✅ RSS/Atom Feed 订阅管理
- ✅ 三栏式高效阅读界面（Feed列表 - 文章列表 - 阅读器）
- ✅ 文章已读/未读状态管理
- ✅ 文章收藏功能（星标）
- ✅ 后台自动更新 Feed
- ✅ 通知提醒新文章
- ✅ 搜索文章功能
- ✅ 浅色/深色主题切换

### 数据管理
- IndexedDB 本地存储，支持离线访问
- 智能更新策略
- 文章自动清理（可配置保留时间）
- OPML 导入导出（计划中）

### 界面特性
- 现代化设计，简洁高效
- 虚拟滚动，支持海量文章
- 响应式布局
- 键盘快捷键支持（计划中）

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
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

2. 开发模式：
```bash
pnpm dev
```

3. 构建生产版本：
```bash
pnpm build
```

### 加载到 Chrome

1. 构建项目：
```bash
pnpm build
```

2. 打开 Chrome 浏览器，访问 `chrome://extensions/`

3. 开启右上角的"开发者模式"

4. 点击"加载已解压的扩展程序"

5. 选择项目的 `dist` 目录

6. 插件安装完成！

## 使用指南

### 添加 Feed

1. 点击工具栏的 ➕ 按钮
2. 输入 RSS Feed URL
3. 点击"Add Feed"按钮

### 阅读文章

1. 在左侧边栏选择 Feed
2. 在中间栏点击文章标题
3. 右侧阅读器显示文章内容

### 收藏文章

点击文章列表或阅读器中的星标按钮

### 刷新 Feed

- 点击工具栏的刷新按钮刷新所有 Feed
- Feed 也会在后台自动更新（默认每30分钟）

### 设置

点击工具栏的设置按钮，可以配置：
- 主题（浅色/深色/自动）
- 默认更新间隔
- 通知开关
- Feed 最大文章数
- 文章保留天数

## 项目结构

```
chrome-rss/
├── public/
│   ├── manifest.json          # Chrome 扩展配置
│   └── icons/                 # 扩展图标
├── src/
│   ├── background/            # Service Worker后台脚本
│   ├── components/            # React 组件
│   │   ├── layout/           # 布局组件
│   │   ├── feed/             # Feed相关组件
│   │   └── ui/               # 通用UI组件
│   ├── lib/                  # 核心功能库
│   │   ├── parser/           # RSS解析器
│   │   ├── storage/          # 数据存储
│   │   ├── fetcher/          # Feed抓取
│   │   └── utils/            # 工具函数
│   ├── pages/                # 页面
│   │   ├── main/             # 主界面
│   │   ├── popup/            # 弹出窗口
│   │   └── options/          # 设置页面
│   ├── store/                # 状态管理
│   └── types/                # TypeScript类型定义
├── dist/                      # 构建输出目录
└── package.json
```

## 开发计划

### 即将实现
- [ ] 文件夹分组管理
- [ ] OPML 导入/导出
- [ ] 全文抓取功能
- [ ] 文章过滤规则
- [ ] 键盘快捷键
- [ ] 多视图模式（紧凑/舒适/卡片）
- [ ] 文章分享功能

### 长期计划
- [ ] 云同步支持
- [ ] 移动端适配
- [ ] 更多主题
- [ ] AI 摘要功能
- [ ] 播客支持

## 常见问题

### Q: 如何找到 RSS Feed URL？
A: 大多数网站在页面源代码中有 RSS 链接，或者在网站底部有 RSS 图标。也可以使用 RSS 发现工具。

### Q: 支持哪些 Feed 格式？
A: 支持 RSS 2.0 和 Atom 1.0 格式。

### Q: 数据存储在哪里？
A: 所有数据使用 IndexedDB 存储在本地，Chrome 不会上传到云端。

### Q: 如何备份数据？
A: 当前版本支持手动 OPML 导出（开发中）。未来版本会添加完整的备份功能。

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 致谢

本项目灵感来自 Feedbro，感谢所有开源项目的贡献者。
