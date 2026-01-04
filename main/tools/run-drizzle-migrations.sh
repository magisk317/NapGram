#!/usr/bin/env bash
set -euo pipefail

echo "Running database migrations with Drizzle..."

# Check if database is accessible
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

# Run Drizzle migrations
echo "Applying Drizzle migrations..."
pnpm --filter @napgram/database db:migrate

echo "✅ Database migrations completed successfully"
exit 0
