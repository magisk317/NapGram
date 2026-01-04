#!/bin/bash
set -euo pipefail

# 确保必要的目录存在
mkdir -p /app/.config/QQ /app/data /app/data/logs

# 如果未提供 ADMIN_TOKEN，自动生成一个随机 Token 并打印（使用 Node 内置 crypto 保证可用）
if [ -z "${ADMIN_TOKEN:-}" ]; then
  export ADMIN_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  echo "已生成随机 ADMIN_TOKEN（请妥善保存）：${ADMIN_TOKEN}"
fi

# 尝试运行数据库迁移
echo "正在运行数据库迁移..."
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

if ! /app/node_modules/.bin/drizzle-kit migrate --config /app/database/drizzle.config.ts; then
  echo "Database migration failed; aborting."
  exit 1
fi

echo "数据库迁移完成，启动应用..."
exec node --enable-source-maps build/index.js
