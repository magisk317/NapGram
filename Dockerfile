# syntax=docker/dockerfile:1

ARG NODE_VERSION=25-slim
FROM node:${NODE_VERSION} AS base
ARG USE_MIRROR=true
ENV DEBIAN_FRONTEND=noninteractive

# 基础运行时依赖
RUN if [ "$USE_MIRROR" = "true" ]; then \
      sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources; \
    fi && \
    apt-get update && apt-get install -y --no-install-recommends \
    curl wget bash \
    fonts-wqy-microhei \
    libpixman-1-0 libcairo2 libpango1.0-0 libgif7 libjpeg62-turbo libpng16-16 librsvg2-2 libvips42 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g corepack@latest --force && corepack enable && corepack prepare pnpm@latest --activate && npm install -g npm@latest
WORKDIR /app

FROM base AS build
ARG USE_MIRROR=true

# 编译环境依赖 (python3, build-essential)
RUN if [ "$USE_MIRROR" = "true" ]; then \
      sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources; \
    fi && \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential pkg-config \
    libpixman-1-dev libcairo2-dev libpango1.0-dev libgif-dev libjpeg62-turbo-dev libpng-dev librsvg2-dev libvips-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json* /app/
COPY main/package.json /app/main/
COPY web/package.json /app/web/

# 三步安装策略：
# 1. 先安装 Prisma 相关包并运行 postinstall（下载引擎）
# 2. 再安装其他依赖并跳过脚本（避免 sharp 尝试源码编译）
# 3. 编译必需的原生模块
#    - better-sqlite3: mtcute 用于 Telegram session 存储
#    - silk-wasm 是纯 WASM，无需编译
RUN pnpm install --filter=prisma --filter=@prisma/client --filter=@prisma/engines --frozen-lockfile --shamefully-hoist && \
    pnpm install --frozen-lockfile --shamefully-hoist --ignore-scripts && \
    pnpm -r rebuild better-sqlite3

# 源码构建
COPY main/ /app/main/
RUN DATABASE_URL="postgresql://dummy" pnpm --filter=@napgram/core run prisma generate
RUN pnpm --filter=@napgram/core run build

# Frontend
COPY web/ /app/web/
RUN pnpm --filter=web run build

FROM base AS release
# Note: TGS to GIF conversion now handled by tgs-to npm package

COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/main/build /app/build
COPY --from=build --chown=node:node /app/main/package.json /app/package.json
COPY --from=build --chown=node:node /app/main/prisma /app/prisma
COPY --from=build --chown=node:node /app/main/prisma.config.js /app/prisma.config.js
COPY --from=build --chown=node:node /app/web/dist /app/public

# 确保 ESM 兼容
RUN echo '{ "type": "module" }' > /app/build/package.json && \
    chown node:node /app/build/package.json && \
    mkdir -p /app/data /app/.config/QQ && \
    chown -R node:node /app/data /app/.config/QQ

COPY --chown=node:node docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV DATA_DIR=/app/data \
    CACHE_DIR=/app/.config/QQ/NapCat/temp \
    UI_PATH=/app/public

EXPOSE 8080
USER node
CMD ["/app/entrypoint.sh"]
