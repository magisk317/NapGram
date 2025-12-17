<p align="center"><strong>简体中文</strong> | <a href="./README_en.md">English</a></p>

<h1 align="center">NapGram</h1>

<p align="center">基于 NapCat 和 mtcute 的现代化 QQ-Telegram 消息桥接工具</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-25-green.svg" alt="Node.js" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0+-blue.svg" alt="TypeScript" /></a>
  <a href="https://github.com/NapLink/NapGram/actions/workflows/docker-release.yml"><img src="https://img.shields.io/github/actions/workflow/status/NapLink/NapGram/docker-release.yml?branch=main&label=Release%20Build&logo=githubactions" alt="CI/CD" /></a>
  <a href="https://github.com/NapLink/NapGram/releases"><img src="https://img.shields.io/github/v/release/NapLink/NapGram?display_name=tag&include_prereleases&logo=git&label=Latest" alt="Release" /></a>
  <a href="https://github.com/NapLink/NapGram/releases"><img src="https://img.shields.io/github/downloads/NapLink/NapGram/total?label=Release%20Downloads&logo=github" alt="Downloads" /></a>
  <a href="https://github.com/NapLink/NapGram/pkgs/container/napgram"><img src="https://img.shields.io/badge/ghcr.io%2Fnaplink%2Fnapgram-blue?logo=docker&label=Container" alt="GHCR Image" /></a>
  <a href="https://github.com/NapLink/NapGram/commits/main"><img src="https://img.shields.io/github/last-commit/NapLink/NapGram/main?logo=github&label=Last%20Commit" alt="Last Commit" /></a>
  <a href="https://github.com/NapLink/NapGram/pulse"><img src="https://img.shields.io/github/commit-activity/m/NapLink/NapGram?logo=github&label=Commit%20Activity" alt="Commit Activity" /></a>
  <a href="https://github.com/NapLink/NapGram/issues"><img src="https://img.shields.io/github/issues/NapLink/NapGram?logo=github" alt="Issues" /></a>
  <a href="https://github.com/NapLink/NapGram/pulls"><img src="https://img.shields.io/github/issues-pr/NapLink/NapGram?logo=github&label=Pull%20Requests" alt="PRs" /></a>
  <a href="https://github.com/NapLink/NapGram/stargazers"><img src="https://img.shields.io/github/stars/NapLink/NapGram?style=social" alt="Stars" /></a>
  <a href="https://github.com/NapLink/NapGram/network/members"><img src="https://img.shields.io/github/forks/NapLink/NapGram?style=social" alt="Forks" /></a>
</p>

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
- **Web 控制台**：
  - ✅ Docker 镜像内置前端（默认端口 `8080`，访问 `http://<host>:8080/`）
  - 📊 系统状态与性能指标（统计概览、趋势、延迟）
  - ⚙️ 可视化管理（实例/绑定/配置、日志与消息查询）

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

### 镜像标签约定

- 稳定版（Release 构建）：`latest` + `vX.Y.Z`
- 开发版（每日构建）：`dev-latest` + `dev-YYYYMMDD`

### Docker Compose 部署 (推荐)

1. **获取项目**
   ```bash
   git clone https://github.com/NapLink/NapGram.git
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
      # 编辑相关信息
   docker-compose up -d
   ```

### KoishiHost（可选）

NapGram 支持在**进程内启动 Koishi 运行时**作为插件宿主（通过 NapGram Gateway 收消息/发消息），用于后续插件市场与生态兼容。

相关环境变量（可选）：

- `KOISHI_ENABLED=1`：启用 KoishiHost（默认关闭）
- `KOISHI_GATEWAY_URL=ws://127.0.0.1:8765`：Gateway 地址（默认本机）
- `KOISHI_INSTANCES=0`：订阅实例列表（逗号分隔）
- `KOISHI_CONFIG_PATH=/app/data/koishi/plugins.yaml`：从 JSON/YAML 配置加载插件
- `KOISHI_PLUGINS_DIR=/app/data/koishi/plugins`：从目录加载插件（默认只加载 `.js/.mjs/.cjs`）
- `KOISHI_ALLOW_TS=1`：允许加载 `.ts` 插件（仅建议开发环境）
- `KOISHI_DEBUG_SESSIONS=1`：打印 Koishi `session`（用于联调）

### 升级 FAQ

#### 1) 升级流程建议（从旧版本升级到新版本）

- 建议优先使用镜像默认的启动方式（`/app/entrypoint.sh`），让 Prisma 执行 `migrate deploy`；不要长期使用 `prisma db push` 作为生产升级手段。
- 如果你的 `docker-compose.yml` 里手动写了 `command: npx prisma db push ...`，升级时建议先去掉该 `command` 覆盖，让容器走默认 entrypoint（会自动跑迁移）。

#### 2) 升级后出现 `QqBotType` 移除 `oicq` 的报错怎么办？

这是 Prisma 的保护提示：新版本移除了枚举值 `oicq`，但你的数据库里可能仍有旧数据/旧枚举分支。

推荐做法（一次性修复）：

1. **先备份数据库**
2. **把历史数据中的 `oicq` 统一改为 `napcat`**
   ```sql
   UPDATE "public"."QqBot" SET "type" = 'napcat' WHERE "type" = 'oicq';
   ```
3. **再执行迁移**
   - 推荐：`npx prisma migrate deploy`
   - 如果你确实在用 `prisma db push`（开发/临时场景），需要加 `--accept-data-loss`（这里的 data loss 仅指移除枚举分支）：
     ```bash
     npx prisma db push --accept-data-loss
     ```

如果你是 `compose.dev.yaml` 这种挂载源码运行的方式，也可以直接执行：
```bash
sh ./main/tools/prisma-db-push-safe.sh
```

## 📚 文档

- 📖 **项目文档（Wiki）**：https://github.com/NapLink/NapGram/wiki
- 📝 **更新日志**：https://github.com/NapLink/NapGram/wiki/Changelog
- 🔗 **相关项目**：NapCat SDK（TypeScript）[NapLink](https://github.com/NapLink/NapLink)

## 📅 更新日志

📝 **[查看版本更新日志](https://github.com/NapLink/NapGram/wiki/Changelog)**

## 📖 开发者文档

### 目录结构
```bash
.
├── main/                 # 后端核心（Fastify + mtcute + NapCat）
│   ├── src/
│   │   ├── domain/       # 领域模型、转换器与业务逻辑
│   │   ├── features/     # 功能模块（Forward/Media/Recall/Commands）
│   │   ├── infrastructure/# 协议适配与外部依赖（QQ/TG 客户端等）
│   │   ├── interfaces/   # Web API + Web 控制台托管（Fastify）
│   │   └── shared/       # 通用工具、日志、服务
│   ├── prisma/           # Prisma schema & migrations
│   └── .env.example      # 环境变量示例
├── web/                  # Web 控制台静态资源（Docker 镜像内置 dist）
│   └── dist/             # 前端构建产物（提供 SPA）
├── Dockerfile            # 容器构建（默认启用 Web 控制台）
└── compose*.yaml         # Docker Compose 示例
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
- **CommandsFeature**: 丰富的管理命令系统（发送 `/help` 查看完整列表）

### 常用命令

| 命令 | 说明 | 权限 |
|------|------|------|
| `/help` | 帮助信息 | 全员 |
| `/status` | 运行状态 | 全员 |
| `/bind` / `/unbind` | 绑定/解绑 TG 聊天与 QQ 群 | 管理员 |
| `/mode` | 转发显示模式（昵称/转发开关） | 全员 |
| `/rm` | 撤回消息（支持回复消息/批量） | 全员 |
| `/forwardoff` / `/forwardon` | 暂停/恢复双向转发 | 管理员 |
| `/disable_qq_forward` / `/enable_qq_forward` | 关闭/开启 QQ→TG | 管理员 |
| `/disable_tg_forward` / `/enable_tg_forward` | 关闭/开启 TG→QQ | 管理员 |
| `/refresh` / `/refresh_all` | 刷新群头像/简介（单群/全部） | 管理员 |
| `/flags` | 实验性功能开关 | 管理员 |
| `/info` | 查看群/消息详情 | 全员 |
| `/q` | QuotLy 引用图片（开发中） | 全员 |
| `/poke` / `/nick` / `/like` / `/honor` | QQ 交互（戳一戳/名片/点赞/群荣誉） | 全员 |

### 群组管理命令（管理员）

| 命令 | 说明 | 用法示例 |
|------|------|----------|
| `/ban` | 禁言群成员 | `/ban <QQ号>` 或回复消息使用 `/ban [时长]`<br>时长格式: `1m` (1分钟), `30m`, `1h`, `1d` |
| `/unban` | 解除禁言 | `/unban <QQ号>` 或回复消息使用 `/unban` |
| `/kick` | 踢出群成员 | `/kick <QQ号>` 或回复消息使用 `/kick` |
| `/card` | 设置群名片 | `/card <QQ号> <名片>` 或回复消息使用 `/card <名片>` |
| `/muteall` / `/unmuteall` | 全员禁言开关 | `/muteall on` / `/muteall off` |
| `/admin` | 设置/取消管理员（仅群主） | `/admin <QQ号> <on\|off>` |
| `/groupname` | 修改群名 | `/groupname <新群名>` |
| `/title` / `/头衔` | 设置专属头衔（仅群主） | `/头衔 <QQ号> <头衔>` 或回复消息 `/头衔 <头衔>` |

> **注意**: 
> - 仅群主和管理员可使用这些命令
> - 管理员无法对群主和其他管理员执行操作
> - 支持回复消息快捷操作，无需手动输入 QQ 号

### 请求管理命令（管理员）

| 命令 | 说明 | 用法示例 |
|------|------|----------|
| `/pending` | 查看待处理请求 | `/pending [friend\|group]` |
| `/approve` / `/reject` | 通过/拒绝请求 | `/approve <flag>` / `/reject <flag> [理由]` |
| `/reqstats` | 请求统计 | `/reqstats [today\|week\|month\|all]` |
| `/approveall` / `/rejectall` | 批量处理请求 | `/approveall [friend\|group]` / `/rejectall [friend\|group] [reason]` |

## 🤝 贡献与致谢

- 核心协议库感谢 [NapCat](https://github.com/NapNeko/NapCatQQ) 和 [mtcute](https://github.com/mtcute/mtcute) 的开源贡献
- 感谢 [原始 q2tg 项目](https://github.com/Clansty/Q2TG) 和[node-napcat-ts](https://github.com/HkTeamX/node-napcat-ts)为本项目提供了重要的参考和灵感


## ⚠️ 免责声明

本项目仅供教育和个人使用。请遵守 QQ 和 Telegram 的服务条款。

## 💬 加入社区

- **Telegram 群组**: [https://t.me/+BiKryJzcQRYzZjA1](https://t.me/+BiKryJzcQRYzZjA1)
- **Telegram 频道**: [https://t.me/napgram_offical](https://t.me/napgram_offical)
- **QQ 群**: 1036505332

## ⭐ Star 趋势

[![Star History Chart](https://starchart.cc/NapLink/NapGram.svg)](https://starchart.cc/NapLink/NapGram)

---

## 📧 联系方式

- GitHub Issues: [报告问题](https://github.com/NapLink/NapGram/issues)

---
