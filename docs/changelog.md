# Changelog

所有重要的项目更改都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [v0.1.0] - 2025-12-15

### 🎯 命令系统重构与修复

- **命令参数灵活性**: 所有命令支持参数顺序互换、回复消息提取目标用户
- **Forum Topic 修复**: 修复 Telegram Forum/Topic 环境下命令解析错误的关键Bug
- **命令整合**: 合并 `/mute` 和 `/ban` 为统一接口，支持人性化时间格式 (1m/1h/1d)
- **新增/改进命令**:
  - `/nick` - 修改机器人群名片（已实现setGroupCard API）
  - `/poke` - 戳一戳功能（支持NapCat API调用）
  - `/like` - 点赞命令，修复参数解析
  - `/card` - 修改群名片，修复QQ号识别
  - `/title` - 专属头衔，修复参数顺序
  - `/admin` - 管理员设置，修复绑定检查
  - `/honor` - 群荣誉榜，修复用户ID显示
  - `/muteall` & `/unmuteall` - 全员禁言/解除

### 🔧 技术债务清理

- **移除冗余代码**: 删除handleMute等未实现的冗余方法
- **清理TODO注释**: 移除已实现功能的过时TODO标记
- **调试日志清理**: 移除所有开发调试用的console.log和临时logger
- **工具类重构**: 新增CommandArgsParser统一参数解析逻辑

### 🐛 核心Bug修复

- **转发消息显示**: 修复合并消息查看器白字问题，添加text-gray-900样式
- **NapCat适配**: 修复napcatConvert使用错误字段导致的内容为空
- **绑定检查失败**: 修复async import导致的命令绑定检查异常
- **Thread ID混淆**: 修复extractThreadId误把命令参数当作threadId

### 📚 文档与质量

- **代码可维护性**: 参数解析逻辑统一化，减少重复代码
- **错误提示优化**: 所有命令提供清晰的使用说明和错误提示
- **构建优化**: 确保所有代码变更通过TypeScript编译检查

[查看 Release 说明](https://github.com/NapLink/NapGram/releases/tag/v0.1.0)

---

## [v0.0.9] - 2025-12-13

- **WebUI 管理面板**: 全新 Web 可视化管理界面，支持实例管理、配对管理、消息浏览、实时日志查看
- **现代化技术栈**: React 19 + Vite + Tailwind CSS 4 + shadcn/ui，响应式设计支持移动端
- **路由优化**: 修复 Web 资源路径配置，移除 `/ui` 前缀
- **代码精简**: 架构优化减少约 2900 行代码，提升可维护性
- **Docker优化**: 改进容器入口脚本，确保 Web 资源正确打包

[查看 Release 说明](https://github.com/NapLink/NapGram/releases/tag/v0.0.9)

## [v0.0.8] - 2025-12-10

- **NapLink SDK 迁移**: 从 node-napcat-ts 迁移到自研 NapLink SDK，提供更现代化的通信基础
- **TGS 贴纸优化**: 重构动态贴纸转换逻辑，改用 sharp 处理图片转换
- **媒体转发提示**: 新增视频、语音消息转发时的友好提示信息
- **CI/CD 增强**: Telegram 通知支持多个接收者、构建状态实时推送、依赖自动更新
- **依赖升级**: NapLink v0.1.1、sharp v0.33.5 等核心依赖更新

[查看 Release 说明](https://github.com/NapLink/NapGram/releases/tag/v0.0.8)

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