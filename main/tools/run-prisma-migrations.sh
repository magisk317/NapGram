#!/usr/bin/env bash
set -euo pipefail

SCHEMA_PATH="/app/main/prisma/schema.prisma"
if [ ! -f "$SCHEMA_PATH" ]; then
  echo "Prisma schema not found at $SCHEMA_PATH, skipping migrations."
  exit 0
fi

echo "Checking Prisma migration status..."
STATUS_OUTPUT=$(
  pnpm --filter ./main exec prisma migrate status --schema "$SCHEMA_PATH" 2>&1 || true
)
echo "$STATUS_OUTPUT"

ROLLBACK_COUNT=0
if echo "$STATUS_OUTPUT" | grep -qi "Following migration have failed:"; then
  failed_block=$(
    printf "%s\n" "$STATUS_OUTPUT" |
      sed -n '/Following migration have failed:/,/^$/p' |
      tail -n +2 |
      sed '/^[[:space:]]*$/d'
  )
  if [ -n "$failed_block" ]; then
    echo "Detected failed migrations:"
    printf "%s\n" "$failed_block"
    while read -r name; do
      [ -z "$name" ] && continue
      echo "Resolving failed migration $name as rolled back..."
      pnpm --filter ./main exec prisma migrate resolve --rolled-back "$name" --schema "$SCHEMA_PATH"
      ROLLBACK_COUNT=$((ROLLBACK_COUNT + 1))
    done <<< "$failed_block"
    echo "Resolved $ROLLBACK_COUNT failed migrations, rechecking status..."
    STATUS_OUTPUT=$(
      pnpm --filter ./main exec prisma migrate status --schema "$SCHEMA_PATH" 2>&1 || true
    )
    echo "$STATUS_OUTPUT"
  fi
fi

if echo "$STATUS_OUTPUT" | grep -qi "Database is up to date"; then
  echo "Prisma migrations are already up to date."
  exit 0
fi

if echo "$STATUS_OUTPUT" | grep -qi "Database is not started"; then
  echo "Prisma database not started yet, will deploy migrations."
fi

if echo "$STATUS_OUTPUT" | grep -qi "Database schema is not current"; then
  echo "Prisma database schema is not current, attempting to deploy migrations."
fi

deploy_log=$(mktemp)
echo "Running prisma migrate deploy..."
if pnpm --filter ./main exec prisma migrate deploy --schema "$SCHEMA_PATH" 2>&1 | tee "$deploy_log"; then
  rm -f "$deploy_log"
  exit 0
fi

if grep -Eq 'relation .* does not exist|P3009|invalid input value for enum|invalid input value for type|invalid input value for.*enum' "$deploy_log"; then
  echo "Detected migration failure that suggests schema drift; falling back to prisma db push."
  rm -f "$deploy_log"
  
  PUSH_ARGS=""
  if [ "${PLUGIN_PRISMA_ACCEPT_DATA_LOSS:-0}" = "1" ] || [ "${PRISMA_ACCEPT_DATA_LOSS:-0}" = "1" ]; then
    echo "Accepting potential data loss (PLUGIN_PRISMA_ACCEPT_DATA_LOSS=1)"
    PUSH_ARGS="--accept-data-loss"
  fi

  pnpm --filter ./main exec prisma db push --schema "$SCHEMA_PATH" $PUSH_ARGS
  exit 0
fi

cat "$deploy_log"
rm -f "$deploy_log"
echo "Prisma migrate deploy failed; please inspect the log above."
exit 1
