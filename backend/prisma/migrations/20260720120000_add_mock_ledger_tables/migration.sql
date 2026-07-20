-- Reconciles the migration history with schema.prisma.
--
-- These objects were declared in schema.prisma and used by the running application, but no
-- migration ever created them — they had only ever been applied via `prisma db push` /
-- `migrate dev` against already-existing local databases. A fresh clone running
-- `prisma migrate deploy` therefore produced a database that was missing:
--
--   * Student.mfaEnrolledAt / Student.enrollmentToken — so TOTP enrollment could not work;
--   * LedgerIdentity / LedgerAuditRecord — the MockLedger's storage, so LEDGER=mock could
--     not start and prisma/seed.ts crashed on its first deleteMany().
--
-- Found by scripts/start.sh, which is the first thing to provision this database from nothing.
--
-- EVERY STATEMENT IS GUARDED WITH `IF NOT EXISTS`, and that is load-bearing rather than
-- defensive habit. This migration describes state that ALREADY EXISTS on any database that was
-- provisioned with `db push` before it was written — which includes the live deployment. An
-- unguarded `ADD COLUMN` there fails with "column already exists", leaving the migration
-- half-applied and the history stuck. Guarded, the same file is correct in both directions: it
-- creates the objects on a fresh database and no-ops on an existing one.
--
-- Additive only: no existing data is altered or dropped.

-- AlterTable
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "enrollmentToken" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "mfaEnrolledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LedgerIdentity" (
    "studentId" TEXT NOT NULL,
    "credentialHash" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerIdentity_pkey" PRIMARY KEY ("studentId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LedgerAuditRecord" (
    "eventId" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "studentId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "hash" TEXT NOT NULL,
    "prevHash" TEXT NOT NULL,

    CONSTRAINT "LedgerAuditRecord_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerAuditRecord_seq_key" ON "LedgerAuditRecord"("seq");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LedgerAuditRecord_studentId_idx" ON "LedgerAuditRecord"("studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LedgerAuditRecord_seq_idx" ON "LedgerAuditRecord"("seq");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Student_enrollmentToken_key" ON "Student"("enrollmentToken");
