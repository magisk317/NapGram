#!/usr/bin/env bash
set -euo pipefail

echo "Running database migrations with Drizzle..."

# Resolve repo root from this script location to avoid cwd issues.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Check if database is accessible
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

# Run Drizzle migrations (from installed package)
echo "Applying Drizzle migrations..."
"$(pnpm -C "${ROOT_DIR}/main" bin)/drizzle-kit" migrate --config "${SCRIPT_DIR}/drizzle.config.cjs"

echo "✅ Database migrations completed successfully"
exit 0
