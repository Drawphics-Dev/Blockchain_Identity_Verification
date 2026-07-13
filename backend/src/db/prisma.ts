/**
 * PostgreSQL access via Prisma (ROADMAP Phase 3).
 * A single shared client for the process — replaces the in-memory `store.ts` stand-in.
 *
 * Prisma 7 connects through a driver adapter rather than reading the URL from the schema,
 * so the connection string is supplied here from the environment.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { env } from '../config/env'

const adapter = new PrismaPg({ connectionString: env.databaseUrl })

export const prisma = new PrismaClient({ adapter })
