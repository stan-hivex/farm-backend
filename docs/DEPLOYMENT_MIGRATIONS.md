# Migrations on deploy

Render's Free plan locks the Pre-Deploy Command, so `npm run start` runs
`prisma migrate deploy` (the bundled prisma CLI, now a runtime dependency)
before `node dist/main.js`. If a migration fails, the process exits non-zero
and the server does not start on an old schema; Render keeps the previous
instance live and marks the deploy failed. All migrations are additive.

Before the first deploy with this change, production's `_prisma_migrations`
table must already record every migration that was applied by hand;
otherwise mark them with `prisma migrate resolve --applied <name>` first.
