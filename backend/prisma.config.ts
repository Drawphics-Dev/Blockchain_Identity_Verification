/**
 * Prisma CLI configuration (Prisma 7).
 *
 * From v7 the connection URL may no longer live in schema.prisma. Migration and
 * introspection commands read it from here; the application reads it at runtime via the
 * pg driver adapter in src/db/prisma.ts.
 */
import 'dotenv/config'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
    /**
     * Throwaway database Prisma replays the migration history into when it needs to compare
     * "what the migrations produce" against "what schema.prisma declares" — `migrate diff
     * --from-migrations` and `migrate dev` both require it, and neither works without it in
     * Prisma 7.
     *
     * Optional: unset for `migrate deploy` and normal application use, which never diff.
     * Point it at a scratch database on the same server, e.g.
     *   SHADOW_DATABASE_URL="postgresql://ziam:...@localhost:55432/shadow?schema=public"
     */
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
})
