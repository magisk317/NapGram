[简体中文](./README.md) | **English**

# NapGram

> A modern QQ-Telegram message bridge powered by NapCat and mtcute

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

## ✨ Features

- 🚀 **Modern Tech Stack**: Built on NapCat (QQ) and mtcute (Telegram)
- 💬 **Bidirectional Forwarding**: Seamless message sync between QQ and Telegram
- 📎 **Rich Media Support**: Images, videos, audio, files, and stickers
- ⚡ **High Performance**: Optimized with Stream API for large files
- 🔒 **Type Safe**: Full TypeScript with strict type checking
- 🐳 **Docker Ready**: Easy deployment with Docker Compose
- 🎯 **Feature Rich**: Commands, media forwarding, group management
- **Web Dashboard (WIP)**:
  - 🚧 Visual configuration management (In Development)
  - 📊 System status monitoring board (Phase 4)

## 🏗️ Tech Stack

| Component | Technology |
|-----------|-----------|
| **QQ Client** | [NapCat](https://github.com/NapNeko/NapCatQQ) + [node-napcat-ts](https://github.com/HkTeamX/node-napcat-ts) |
| **Telegram Client** | [mtcute](https://github.com/mtcute/mtcute) |
| **Language** | TypeScript (ESM) |
| **Frontend** | React 19 + Vite |
| **Runtime** | Node.js 18+ |
| **Database** | PostgreSQL |
| **Build Tool** | esbuild |

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL
- **NapCat** - QQ bot framework (requires separate deployment)
  - Recommended to deploy with Docker: [NapCat Official Docs](https://napneko.github.io/)
  - Needs WebSocket or HTTP interface configured for NapGram connection
- QQ account (for NapCat login)
- Telegram account

### Docker (Recommended)

**Note**: NapGram requires connection to a deployed NapCat instance. Please ensure NapCat is running first.

```bash
# Clone the repository
git clone https://github.com/magisk317/NapGram.git
cd NapGram

# Configure environment
cp main/.env.example main/.env
# Edit main/.env with:
# - NapCat connection URL (WebSocket or HTTP)
# - Telegram Bot Token and API credentials
# - PostgreSQL database connection info

# Start with Docker Compose
cp compose.example.yaml docker-compose.yml
docker-compose up -d
```

**NapCat Configuration**:
- Ensure NapCat has WebSocket or HTTP interface enabled
- Configure `NAPCAT_WS_URL` or `NAPCAT_HTTP_URL` in `.env`
- NapCat and NapGram must be in the same network or accessible to each other

### Manual Installation

```bash
# Install dependencies
pnpm install

# Build
pnpm --filter=@napgram/core run build

# Start
pnpm --filter=@napgram/core start
```

## 📖 Documentation

- [Deployment Guide](./docs/deployment.md)

## 📅 Changelog

📝 **[View Changelog](./docs/changelog.md)**

## 🎯 Features

### Message Forwarding
- ✅ Text messages with formatting
- ✅ Images and photos
- ✅ Videos and animations
- ✅ Audio and voice messages
- ✅ Files and documents
- ✅ Stickers and emojis
- ✅ Forward messages
- ✅ Reply messages

### Commands
- `/bind` - Bind QQ group to Telegram chat
- `/unbind` - Unbind QQ group from Telegram chat
- `/mode` - Configure forwarding mode
- `/help` - Show help message

### Advanced Features
- 📊 Message statistics
- 🔄 Auto-reconnect
- 🎨 Rich message formatting
- 👥 Group member management
- 🔔 Notification control

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Development mode
pnpm --filter=@napgram/core run dev

# Type checking
pnpm --filter=@napgram/core run type-check

# Build
pnpm --filter=@napgram/core run build
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Credits

- Powered by [NapCat](https://github.com/NapNeko/NapCatQQ) - Modern QQ bot framework
- Powered by [mtcute](https://github.com/mtcute/mtcute) - Modern Telegram client library

## ⚠️ Disclaimer

This project is for educational and personal use only. Please comply with the Terms of Service of QQ and Telegram.

## ⭐ Star History

[![Star History Chart](https://starchart.cc/magisk317/NapGram.svg)](https://starchart.cc/magisk317/NapGram)

---

## 📧 Contact

- GitHub Issues: [Report a bug](https://github.com/magisk317/NapGram/issues)
- Telegram: [Join discussion](https://t.me/napgram) (if available)

---

Made with ❤️ by [magisk317](https://github.com/magisk317)
