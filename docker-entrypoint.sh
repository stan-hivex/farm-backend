#!/bin/sh
set -e
echo "→ Running database migrations..."
npx prisma migrate deploy
echo "→ Starting FARM backend..."
exec node dist/main.js
