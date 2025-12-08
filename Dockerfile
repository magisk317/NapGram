# syntax=docker/dockerfile:1

FROM node:24-slim AS base
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

RUN corepack enable && corepack prepare pnpm@latest --activate && npm install -g npm@latest
WORKDIR /app

FROM edasriyan/lottie-to-gif:latest AS lottie

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

# 分两步安装以精确控制原生模块编译：
# 1. 先安装所有依赖但跳过所有安装脚本（避免 sharp 尝试源码编译）
# 2. 然后递归重新编译必需的原生模块（-r 确保在所有 workspace 中执行）
RUN pnpm install --frozen-lockfile --shamefully-hoist --ignore-scripts && \
    pnpm -r rebuild better-sqlite3 silk-sdk && \
    pnpm --filter=@prisma/engines run postinstall

# 源码构建
COPY main/ /app/main/
RUN DATABASE_URL="postgresql://dummy" pnpm --filter=@napgram/core run prisma generate
RUN pnpm --filter=@napgram/core run build

# Frontend
COPY web/ /app/web/
RUN pnpm --filter=web run build

# Dev/Build 阶段也带上 tgs 转换工具，便于 compose.dev 使用 target=build
COPY --from=lottie /usr/bin/lottie_to_gif.sh /usr/local/bin/tgs_to_gif
COPY --from=lottie /usr/bin/lottie_common.sh /usr/local/bin/lottie_common.sh
COPY --from=lottie /usr/bin/lottie_to_png /usr/local/bin/lottie_to_png
COPY --from=lottie /usr/bin/gifski /usr/local/bin/gifski
ENV TGS_TO_GIF=/usr/local/bin/tgs_to_gif

FROM base AS release
# Lottie Converter
COPY --from=lottie /usr/bin/lottie_to_gif.sh /usr/local/bin/tgs_to_gif
COPY --from=lottie /usr/bin/lottie_common.sh /usr/local/bin/lottie_common.sh
COPY --from=lottie /usr/bin/lottie_to_png /usr/local/bin/lottie_to_png
COPY --from=lottie /usr/bin/gifski /usr/local/bin/gifski
ENV TGS_TO_GIF=/usr/local/bin/tgs_to_gif

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
