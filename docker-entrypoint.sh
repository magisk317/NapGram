#!/bin/bash
set -euo pipefail

# 确保必要的目录存在
mkdir -p /app/.config/QQ /app/data

# 尝试运行迁移，如果失败则检查是否是 P3005 错误
echo "正在运行数据库迁移..."
if ! ./node_modules/.bin/prisma migrate deploy 2>&1 | tee /tmp/migrate.log; then
  if grep -q "P3005" /tmp/migrate.log; then
    echo "检测到 P3005 错误（数据库非空），尝试 baseline 所有迁移..."
    # 获取所有迁移目录名称并标记为已应用
    for migration in ./prisma/migrations/*/; do
      migration_name=$(basename "$migration")
      if [ "$migration_name" != "migration_lock.toml" ]; then
        echo "标记迁移为已应用: $migration_name"
        ./node_modules/.bin/prisma migrate resolve --applied "$migration_name" || true
      fi
    done
    echo "重新运行迁移..."
    ./node_modules/.bin/prisma migrate deploy
  else
    echo "迁移失败，错误日志："
    cat /tmp/migrate.log
    exit 1
  fi
fi

echo "数据库迁移完成，启动应用..."
exec node --enable-source-maps build/index.js
