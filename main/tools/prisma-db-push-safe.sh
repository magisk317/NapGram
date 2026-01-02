#!/bin/sh
set -eu

# Ensure we run from /app/main (script lives in ./tools)
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR/.."

# 适用于“历史用 prisma db push 初始化过数据库”的场景：
# - 先把旧枚举值 oicq 迁移为 napcat
# - 再用 db push --accept-data-loss 应用 schema（此处的 data loss 仅是移除枚举分支）

echo "[prisma] normalize legacy enum values (if QqBot exists)..."
# Use ::text to avoid casting 'oicq' into enum when the variant is already removed.
cat <<'SQL' | pnpm exec prisma db execute --stdin
DO $$
BEGIN
  IF to_regclass('public."QqBot"') IS NOT NULL THEN
    UPDATE "public"."QqBot" SET "type"='napcat' WHERE "type"::text='oicq';
  END IF;
END $$;
SQL

ACCEPT_DATA_LOSS="${PLUGIN_PRISMA_ACCEPT_DATA_LOSS:-${PRISMA_ACCEPT_DATA_LOSS:-0}}"
if [ "$ACCEPT_DATA_LOSS" = "1" ]; then
  echo "[prisma] db push (accept data loss)..."
  if ! pnpm exec prisma db push --accept-data-loss; then
    echo "[prisma] ERROR: db push failed. Check DATABASE_URL and migration state." >&2
    exit 1
  fi
else
  echo "[prisma] db push..."
  if ! pnpm exec prisma db push; then
    echo "[prisma] ERROR: db push failed. If this is a destructive change, set PRISMA_ACCEPT_DATA_LOSS=1." >&2
    exit 1
  fi
fi
