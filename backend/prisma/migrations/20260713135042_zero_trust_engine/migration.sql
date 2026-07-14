-- CreateEnum
CREATE TYPE "RevocationReason" AS ENUM ('LOGOUT', 'TERMINATED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "totpSecret" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "deviceFingerprint" TEXT,
ADD COLUMN     "firstAnomalyAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "mfaRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "revokedBy" "RevocationReason";

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "resource" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "reasons" TEXT[],
    "signals" JSONB NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditMirror" (
    "eventId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "hash" TEXT NOT NULL,
    "prevHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditMirror_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "userAgent" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnownNetwork" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnownNetwork_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskEvent_studentId_idx" ON "RiskEvent"("studentId");

-- CreateIndex
CREATE INDEX "RiskEvent_createdAt_idx" ON "RiskEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditMirror_studentId_idx" ON "AuditMirror"("studentId");

-- CreateIndex
CREATE INDEX "Device_studentId_idx" ON "Device"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_studentId_fingerprint_key" ON "Device"("studentId", "fingerprint");

-- CreateIndex
CREATE INDEX "KnownNetwork_studentId_idx" ON "KnownNetwork"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "KnownNetwork_studentId_ipAddress_key" ON "KnownNetwork"("studentId", "ipAddress");

-- CreateIndex
CREATE INDEX "Session_revokedAt_lastSeenAt_idx" ON "Session"("revokedAt", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "RiskEvent" ADD CONSTRAINT "RiskEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEvent" ADD CONSTRAINT "RiskEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnownNetwork" ADD CONSTRAINT "KnownNetwork_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

