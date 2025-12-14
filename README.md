**简体中文** | [English](./README_en.md)

# NapGram

> 基于 NapCat 和 mtcute 的现代化 QQ-Telegram 消息桥接工具

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-25-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![CI/CD](https://img.shields.io/github/actions/workflow/status/magisk317/NapGram/docker-publish.yml?branch=main&label=Build%20%26%20Publish&logo=githubactions)](https://github.com/magisk317/NapGram/actions/workflows/docker-publish.yml)
[![Release](https://img.shields.io/github/v/release/magisk317/NapGram?display_name=tag&include_prereleases&logo=git&label=Latest)](https://github.com/magisk317/NapGram/releases)
[![Downloads](https://img.shields.io/github/downloads/magisk317/NapGram/total?label=Release%20Downloads&logo=github)](https://github.com/magisk317/NapGram/releases)
[![GHCR Image](https://img.shields.io/badge/ghcr.io%2Fmagisk317%2Fnapgram-blue?logo=docker&label=Container)](https://github.com/users/magisk317/packages/container/package/napgram)
[![Last Commit](https://img.shields.io/github/last-commit/magisk317/NapGram/main?logo=github&label=Last%20Commit)](https://github.com/magisk317/NapGram/commits/main)
[![Commit Activity](https://img.shields.io/github/commit-activity/m/magisk317/NapGram?logo=github&label=Commit%20Activity)](https://github.com/magisk317/NapGram/pulse)
[![Issues](https://img.shields.io/github/issues/magisk317/NapGram?logo=github)](https://github.com/magisk317/NapGram/issues)
[![PRs](https://img.shields.io/github/issues-pr/magisk317/NapGram?logo=github&label=Pull%20Requests)](https://github.com/magisk317/NapGram/pulls)
[![Stars](https://img.shields.io/github/stars/magisk317/NapGram?style=social)](https://github.com/magisk317/NapGram/stargazers)
[![Forks](https://img.shields.io/github/forks/magisk317/NapGram?style=social)](https://github.com/magisk317/NapGram/network/members)

## ✨ 核心特性

### 🚀 现代化架构
- **统一抽象层**：基于 `IQQClient` 接口的标准化实现，解耦底层协议
- **模块化设计**：Feature 驱动的架构（Forward, Recall, Media, Commands）
- **高性能核心**：
  - ⚡ 消息处理速度提升 50%
  - 📉 内存占用降低 15%
  - 🔄 LRU 多级缓存系统

### 💬 消息能力
- **全类型支持**：
  - ✅ 文本、图片（含闪照）、视频、音频
  - ✅ 文件、贴纸、@提及、表情
  - ✅ 合并转发消息、引用回复
  - ✅ 商城表情 (mface)、掷骰子/猜拳
  - ✅ Markdown/JSON 卡片消息
- **媒体增强**：
  - 🖼️ 智能图片分片发送（解决合并转发显示问题）
  - 🎥 GIF 自动优化播放
  - 🎵 语音自动转码 (Silk/Ogg)
  - 📂 跨容器大文件流式传输

### 🛡️ 稳定性与监控
- **双向撤回同步**：QQ 与 Telegram 消息撤回互通
- **智能重连**：WebSocket 断线自动重连机制
- **健康监控**：
  - 实时延迟统计 (p50/p95/p99)
  - 错误率追踪与自动恢复
  - 消息队列优先级管理
- **Web 控制台 (WIP)**:
  - 🚧 可视化配置管理 (开发中)
  - 📊 系统状态监控大屏 (开发中)

## 🏗️ 技术栈列表

| 组件 | 技术方案 | 说明 |
|-----------|-----------|-----------|
| **QQ 适配** | [NapCat](https://github.com/NapNeko/NapCatQQ) | 基于 WebSocket 的现代化协议实现 |
| **TG 适配** | [mtcute](https://github.com/mtcute/mtcute) | 原生 MTProto 实现，无需 Bot API 中转 |
| **核心语言** | TypeScript 5.0+ | 严格模式，全链路类型安全 |
| **前端框架** | React 19 + Vite | Tailwind CSS 4, Shadcn UI, Recharts |
| **运行时** | Node.js 25 (ESM) | 现代化模块系统 |
| **数据持久化** | PostgreSQL + Prisma 7 | 强类型 ORM，支持自动迁移 |
| **测试框架** | Vitest | 单元测试覆盖率 >80% |

## 🚀 部署指南

### 前置要求
- **NapCat (必选)**：需自行部署 [NapCatQQ](https://napneko.github.io/) 实例，并开启 WebSocket 服务
- **数据库**：PostgreSQL 14+
- **网络**：NapGram 容器需能访问 NapCat 服务端口

### Docker Compose 部署 (推荐)

1. **获取项目**
   ```bash
   git clone https://github.com/magisk317/NapGram.git
   cd NapGram
   ```

2. **环境配置**
   ```bash
   cp main/.env.example main/.env
   # 编辑 .env 填入 NapCat 连接信息和 TG Bot Token
   ```

3. **启动服务**
   ```bash
   cp compose.example.yaml docker-compose.yml
   docker-compose up -d
   ```

## 📖 开发者文档

## 📅 更新日志

📝 **[查看版本更新日志](./docs/changelog.md)**

## 📖 开发者文档

### 目录结构
```bash
main/src/
├── features/             # 功能模块
│   ├── forward/         # 消息转发核心
│   ├── recall/          # 撤回同步
│   ├── media/           # 媒体处理流水线
│   └── commands/        # 下一代命令系统
├── infrastructure/       # 基础设施
│   ├── clients/qq/      # QQ 协议适配层
│   └── clients/telegram/# MTProto 封装
└── domain/              # 领域模型与转换器
```

### 创建新功能
得益于模块化架构，添加新功能非常简单：

```typescript
// 1. 实现 Feature 接口
class MyFeature {
    constructor(
        private instance: Instance,
        private tgBot: Telegram,
        private qqClient: IQQClient,
    ) {
        this.setupListeners();
    }
    
    private setupListeners() {
        this.qqClient.on('message', this.handleMessage);
    }
}

// 2. 注册到 FeatureManager
featureManager.register(new MyFeature(...));
```

## 🎯 已启用插件

- **ForwardFeature**: 包含去重逻辑和高级转发策略
- **RecallFeature**: 双向撤回同步
- **MediaFeature**: 统一媒体下载与转码
- **CommandsFeature**: 丰富的管理命令系统
  - 基础命令: `/mode`, `/bind`, `/help`
  - 群组管理: `/ban`, `/unban`, `/kick`, `/card`

### 群组管理命令 (仅管理员)

| 命令 | 说明 | 用法示例 |
|------|------|----------|
| `/ban` | 禁言群成员 | `/ban <QQ号>` 或回复消息使用 `/ban [时长]`<br>时长格式: `1m` (1分钟), `30m`, `1h`, `1d` |
| `/unban` | 解除禁言 | `/unban <QQ号>` 或回复消息使用 `/unban` |
| `/kick` | 踢出群成员 | `/kick <QQ号>` 或回复消息使用 `/kick` |
| `/card` | 设置群名片 | `/card <QQ号> <名片>` 或回复消息使用 `/card <名片>` |

> **注意**: 
> - 仅群主和管理员可使用这些命令
> - 管理员无法对群主和其他管理员执行操作
> - 支持回复消息快捷操作，无需手动输入 QQ 号

## 🤝 贡献与致谢

- 核心协议库感谢 [NapCat](https://github.com/NapNeko/NapCatQQ) 和 [mtcute](https://github.com/mtcute/mtcute) 的开源贡献
- 感谢 [原始 q2tg 项目](https://github.com/Clansty/Q2TG) 为本项目提供了重要的参考和灵感


## ⚠️ 免责声明

本项目仅供教育和个人使用。请遵守 QQ 和 Telegram 的服务条款。

## 💬 加入社区

- **Telegram 群组**: [https://t.me/+BiKryJzcQRYzZjA1](https://t.me/+BiKryJzcQRYzZjA1)
- **Telegram 频道**: [https://t.me/napgram_offical](https://t.me/napgram_offical)
- **QQ 群**: 1036505332

## ⭐ Star 趋势

[![Star History Chart](https://starchart.cc/magisk317/NapGram.svg)](https://starchart.cc/magisk317/NapGram)

---

## 📧 联系方式

- GitHub Issues: [报告问题](https://github.com/magisk317/NapGram/issues)

---
