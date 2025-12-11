# Changelog

所有重要的项目更改都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [v0.0.7] - 2025-12-09

- **Node.js 25 升级**: 运行时升级至 `node:25-slim` 基础镜像，保持高性能。
- **配置持久化**: 实现 `/mode` (转发模式/昵称模式) 的数据库持久化存储，无需重启即生效。
- **通知修复**: 修复构建成功时重复发送 Telegram 通知的问题。
- **依赖清理**: 移除冗余文件，优化项目导入路径。
- **数据库迁移**: 新增 `forwardMode` 和 `nicknameMode` 字段。

[查看 Release 说明](https://github.com/magisk317/NapGram/releases/tag/v0.0.7)

## [v0.0.6] - 2025-12-09

- **架构重构**: 核心框架从 Elysia 迁移至 **Fastify**，提升插件生态支持与稳定性。
- **代码去重**: 移除重复工具库 (tmp-promise, undici)，统一各类 Helper 函数。
- **目录简化**: 拍平 `interfaces`, `features`, `clients` 等多层嵌套目录，结构更清晰。
- **共享模块**: 提取 `TTLCache`, `ErrorResponses` 等通用工具类，提升复用率。
- **全量测试**: 所有 40 个单元测试通过，确保重构的稳定性。

[查看 Release 说明](https://github.com/magisk317/NapGram/releases/tag/v0.0.6)

## [v0.0.5] - 2025-12-08

- **模块化重构**: 将 `TelegramSender`, `CommandsFeature` 等千行大文件拆分为 16 个独立模块。
- **媒体增强**: 支持从 Telegram 向 QQ 转发**图文混排 (Media Group)** 消息。
- **质量提升**: 代码量减少 49%，可维护性大幅提升；全面修复单元测试。
- **配置优化**: 移除 Prisma Schema 中过时的 `driverAdapters` 特性。

[查看 Release 说明](https://github.com/magisk317/NapGram/releases/tag/v0.0.5)

## [v0.0.4] - 2025-12-07

- **小程序支持**: 新增 **QQ 小程序卡片** (Ark/JSON) 智能解析，转发为带标题和链接的富文本。
- **显示优化**: 转发消息时优先展示群名片 (Card)，无名片时回退显示昵称。
- **UI 修复**: 修复 Web 管理界面头像显示过大的问题，统一固定为 36px。
- **依赖更新**: 升级 `lucide-react` 和 `react-day-picker` 等前端组件库。

[查看 Release 说明](https://github.com/magisk317/NapGram/releases/tag/v0.0.4)

## [v0.0.3] - 2025-12-07

- **交互体验**: 新增 `/bind` 命令的交互式引导流程；支持 `/cmd@botname` 命令格式。
- **Bug 修复**: 修复 **Telegram 论坛话题** 回复错乱问题；修复删除消息时的程序崩溃。
- **API 修复**: 统一前后端头像 API 路由，解决头像加载失败问题。
- **构建优化**: 修复 Docker 构建过程中的 NPM 版本警告。

[查看 Release 说明](https://github.com/magisk317/NapGram/releases/tag/v0.0.3)

## [v0.0.2] - 2025-12-06

- **双向撤回**: 完整支持 QQ 与 Telegram 消息的双向即时撤回同步。
- **连接监控**: 新增 NapCat 掉线/重连的管理员通知，支持冷却时间配置。
- **命令增强**: 新增 `/rm` 命令，支持同时撤回双端消息并删除命令记录。
- **底座修复**: 修复 `mtcute` 消息结构兼容性问题及多处所有的类型安全修正。

[查看 Release 说明](https://github.com/magisk317/NapGram/releases/tag/v0.0.2)

## [v0.0.1] - 2025-12-05

- **首个发布**: 现代化 QQ ↔ Telegram 双向消息桥接工具，基于 DDD 分层架构设计。
- **核心功能**: 支持文本、图片、视频、文件等全类型消息转发；支持 Telegram Topic。
- **原生体验**: 独家实现 **QQ 原生引用回复** (灰色框)；支持双向昵称/头像展示。
- **管理能力**: 提供 `/status` 监控、`/bind` 绑定、`/mode` 模式切换等管理命令。
- **技术栈**: Node.js 22+, TypeScript, NapCat (OneBot 11), mtcute, PostgreSQL, Prisma。

[查看 Release 说明](https://github.com/magisk317/NapGram/releases/tag/v0.0.1)