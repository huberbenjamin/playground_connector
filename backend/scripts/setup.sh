#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo "Installing Node dependencies..."
npm install

echo "Building shared types..."
npm run build --workspace=@marketplace/shared-types

echo "Generating Prisma client..."
npm run db:generate --workspace=@marketplace/api

echo "Running database migrations..."
npm run db:migrate --workspace=@marketplace/api

echo "Seeding user pool..."
npm run db:seed --workspace=@marketplace/api

echo ""
echo "Setup complete."
echo "Start services with:"
echo "  npm run dev:python   # Python generator on :8001"
echo "  npm run dev:api      # NestJS API on :3000"
