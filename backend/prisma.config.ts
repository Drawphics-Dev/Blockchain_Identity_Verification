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
  },
})
