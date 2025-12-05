# syntax=docker/dockerfile:1

FROM node:22-slim AS base
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    curl wget \
    fonts-wqy-microhei \
    libpixman-1-0 libcairo2 libpango1.0-0 libgif7 libjpeg62-turbo libpng16-16 librsvg2-2 libvips42 ffmpeg \
    && rm -rf /var/lib/apt/lists/*
ENV DATABASE_URL=postgres://user:password@postgres/db_name
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS build
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential pkg-config \
    libpixman-1-dev libcairo2-dev libpango1.0-dev libgif-dev libjpeg62-turbo-dev libpng-dev librsvg2-dev libvips-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json* /app/
COPY main/package.json /app/main/
COPY web/package.json /app/web/
WORKDIR /app
RUN pnpm install --frozen-lockfile --shamefully-hoist
# Ensure native bindings (e.g., better-sqlite3) are compiled for the target Node version
RUN cd /app/main && pnpm rebuild better-sqlite3
# Manually rebuild native modules to ensure bindings are generated
RUN find /app/node_modules -type d \( -name "silk-sdk" -o -name "better-sqlite3" \) -exec sh -c 'cd "{}" && npm rebuild --build-from-source' \;

COPY main/ /app/main/
RUN DATABASE_URL="postgresql://dummy" pnpm --filter=@napgram/core run prisma generate
RUN pnpm --filter=@napgram/core run build

# Build Frontend
COPY web/ /app/web/
RUN pnpm --filter=web run build

FROM base
# Lottie converter support
COPY --from=edasriyan/lottie-to-gif:latest /usr/bin/lottie_to_gif.sh /usr/local/bin/tgs_to_gif
COPY --from=edasriyan/lottie-to-gif:latest /usr/bin/lottie_common.sh /usr/local/bin/lottie_common.sh
COPY --from=edasriyan/lottie-to-gif:latest /usr/bin/lottie_to_png /usr/local/bin/lottie_to_png
COPY --from=edasriyan/lottie-to-gif:latest /usr/bin/gifski /usr/local/bin/gifski
ENV TGS_TO_GIF=/usr/local/bin/tgs_to_gif

WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/main/build /app/build
COPY --from=build --chown=node:node /app/main/package.json /app/package.json
COPY --from=build --chown=node:node /app/main/prisma /app/prisma
COPY --from=build --chown=node:node /app/main/prisma.config.js /app/prisma.config.js
COPY --from=build --chown=node:node /app/web/dist /app/public
RUN echo '{ "type": "module" }' > /app/build/package.json && chown node:node /app/build/package.json

COPY --chown=node:node docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Create data directories
RUN mkdir -p /app/data /app/.config/QQ && \
    chown -R node:node /app/data /app/.config/QQ

ENV DATA_DIR=/app/data
ENV CACHE_DIR=/app/.config/QQ/NapCat/temp
ENV UI_PATH=/app/public

EXPOSE 8080
USER node
CMD ["/app/entrypoint.sh"]
