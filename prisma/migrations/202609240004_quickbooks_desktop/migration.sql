-- CreateEnum
CREATE TYPE "QuickBooksMode" AS ENUM ('DISCOVERY', 'ACTIVE');

-- CreateEnum
CREATE TYPE "QuickBooksJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'BLOCKED', 'FAILED', 'RECONCILIATION_REQUIRED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Capability" ADD VALUE 'QUICKBOOKS_VIEW';
ALTER TYPE "Capability" ADD VALUE 'QUICKBOOKS_CONFIGURE';
ALTER TYPE "Capability" ADD VALUE 'QUICKBOOKS_MAP';
ALTER TYPE "Capability" ADD VALUE 'QUICKBOOKS_QUEUE';
ALTER TYPE "Capability" ADD VALUE 'QUICKBOOKS_RECONCILE';

-- DropIndex
DROP INDEX "AccountingSyncMapping_entityType_entityId_key";

-- AlterTable
ALTER TABLE "AccountingSyncMapping" ADD COLUMN     "connectionId" TEXT,
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastSeenInQuickBooksAt" TIMESTAMPTZ(3),
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "quickBooksEditSequence" TEXT,
ADD COLUMN     "quickBooksFullName" TEXT,
ADD COLUMN     "quickBooksType" TEXT,
ADD COLUMN     "sourceVersion" INTEGER,
ADD COLUMN     "syncHash" TEXT;

-- CreateTable
CREATE TABLE "QuickBooksConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "ownerGuid" TEXT NOT NULL,
    "fileGuid" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" "QuickBooksMode" NOT NULL DEFAULT 'DISCOVERY',
    "intervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "companyFileName" TEXT,
    "companyName" TEXT,
    "companyHash" TEXT,
    "boundCompanyHash" TEXT,
    "companyMismatch" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT,
    "qbXmlVersion" TEXT,
    "lastCallback" TEXT,
    "lastConnectedAt" TIMESTAMPTZ(3),
    "lastAuthenticatedAt" TIMESTAMPTZ(3),
    "lastSuccessfulSyncAt" TIMESTAMPTZ(3),
    "lastErrorAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "importStartDate" DATE,
    "billCursor" TIMESTAMPTZ(3),
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QuickBooksConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickBooksCandidate" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "editSequence" TEXT,
    "subtype" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuickBooksCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickBooksSyncRun" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "requestsSent" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "queued" INTEGER NOT NULL DEFAULT 0,
    "companyName" TEXT,
    "qbXmlVersion" TEXT,
    "error" TEXT,

    CONSTRAINT "QuickBooksSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickBooksSyncSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "companyVerified" BOOLEAN NOT NULL DEFAULT false,
    "companyFileName" TEXT,
    "currentRequestId" TEXT,
    "lastError" TEXT,

    CONSTRAINT "QuickBooksSyncSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickBooksSyncJob" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "operation" TEXT NOT NULL,
    "direction" "SyncDirection" NOT NULL,
    "requestKey" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "QuickBooksJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "sessionId" TEXT,
    "phase" TEXT NOT NULL DEFAULT 'INITIAL',
    "payload" JSONB,
    "lastError" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QuickBooksSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickBooksRequest" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "isWrite" BOOLEAN NOT NULL,
    "responseHash" TEXT,
    "percent" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "QuickBooksRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickBooksSyncIssue" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "jobId" TEXT,
    "key" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "qbStatusCode" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedById" TEXT,
    "resolution" TEXT,

    CONSTRAINT "QuickBooksSyncIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickBooksBillMirror" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "txnId" TEXT NOT NULL,
    "editSequence" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "appliedHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "lastError" TEXT,
    "lineLinks" JSONB,
    "observedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMPTZ(3),

    CONSTRAINT "QuickBooksBillMirror_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksConnection_username_key" ON "QuickBooksConnection"("username");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksConnection_ownerGuid_key" ON "QuickBooksConnection"("ownerGuid");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksConnection_fileGuid_key" ON "QuickBooksConnection"("fileGuid");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksConnection_boundCompanyHash_key" ON "QuickBooksConnection"("boundCompanyHash");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksCandidate_connectionId_type_listId_key" ON "QuickBooksCandidate"("connectionId", "type", "listId");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksSyncSession_tokenHash_key" ON "QuickBooksSyncSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksSyncSession_runId_key" ON "QuickBooksSyncSession"("runId");

-- CreateIndex
CREATE INDEX "QuickBooksSyncSession_connectionId_expiresAt_idx" ON "QuickBooksSyncSession"("connectionId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksSyncJob_requestKey_key" ON "QuickBooksSyncJob"("requestKey");

-- CreateIndex
CREATE INDEX "QuickBooksSyncJob_connectionId_status_availableAt_priority_idx" ON "QuickBooksSyncJob"("connectionId", "status", "availableAt", "priority");

-- CreateIndex
CREATE INDEX "QuickBooksRequest_sessionId_completedAt_idx" ON "QuickBooksRequest"("sessionId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksSyncIssue_key_key" ON "QuickBooksSyncIssue"("key");

-- CreateIndex
CREATE INDEX "QuickBooksSyncIssue_connectionId_resolvedAt_idx" ON "QuickBooksSyncIssue"("connectionId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksBillMirror_connectionId_txnId_key" ON "QuickBooksBillMirror"("connectionId", "txnId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingSyncMapping_connectionId_entityType_entityId_key" ON "AccountingSyncMapping"("connectionId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingSyncMapping_connectionId_entityType_quickBooksLis_key" ON "AccountingSyncMapping"("connectionId", "entityType", "quickBooksListId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingSyncMapping_connectionId_entityType_quickBooksTxn_key" ON "AccountingSyncMapping"("connectionId", "entityType", "quickBooksTxnId");

-- AddForeignKey
ALTER TABLE "AccountingSyncMapping" ADD CONSTRAINT "AccountingSyncMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "QuickBooksConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickBooksCandidate" ADD CONSTRAINT "QuickBooksCandidate_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "QuickBooksConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickBooksSyncRun" ADD CONSTRAINT "QuickBooksSyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "QuickBooksConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickBooksSyncSession" ADD CONSTRAINT "QuickBooksSyncSession_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "QuickBooksConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickBooksSyncSession" ADD CONSTRAINT "QuickBooksSyncSession_runId_fkey" FOREIGN KEY ("runId") REFERENCES "QuickBooksSyncRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickBooksSyncJob" ADD CONSTRAINT "QuickBooksSyncJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "QuickBooksConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickBooksSyncJob" ADD CONSTRAINT "QuickBooksSyncJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuickBooksSyncSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickBooksRequest" ADD CONSTRAINT "QuickBooksRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "QuickBooksSyncJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickBooksRequest" ADD CONSTRAINT "QuickBooksRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuickBooksSyncSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickBooksSyncIssue" ADD CONSTRAINT "QuickBooksSyncIssue_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "QuickBooksConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickBooksSyncIssue" ADD CONSTRAINT "QuickBooksSyncIssue_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "QuickBooksSyncJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickBooksBillMirror" ADD CONSTRAINT "QuickBooksBillMirror_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "QuickBooksConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Retain the pre-integration uniqueness contract for legacy mappings.
CREATE UNIQUE INDEX "AccountingSyncMapping_legacy_source_key"
ON "AccountingSyncMapping" ("entityType", "entityId") WHERE "connectionId" IS NULL;
ALTER TABLE "QuickBooksConnection" ADD CONSTRAINT "qb_interval_valid" CHECK ("intervalMinutes" BETWEEN 5 AND 1440);
ALTER TABLE "QuickBooksSyncJob" ADD CONSTRAINT "qb_attempts_nonnegative" CHECK (attempts >= 0);

-- A corrected approved-time source cannot silently remain marked synchronized.
CREATE FUNCTION cw_qb_time_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.version <> OLD.version THEN
  UPDATE "AccountingSyncMapping" SET status = 'CONFLICT', "lastError" = 'Approved time changed after QuickBooks synchronization; Controller reconciliation required.'
  WHERE "entityType" = 'TIME' AND "entityId" = NEW.id AND "connectionId" IS NOT NULL AND "quickBooksTxnId" IS NOT NULL;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER cw_qb_time_changed AFTER UPDATE ON "TimeSegment" FOR EACH ROW EXECUTE FUNCTION cw_qb_time_changed();

-- Request identity and the exact outbound body survive retries and application restarts.
CREATE FUNCTION cw_qb_request_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'QuickBooks request evidence cannot be deleted'; END IF;
 IF NEW."jobId" <> OLD."jobId" OR NEW."sessionId" <> OLD."sessionId" OR NEW.operation <> OLD.operation OR NEW.data <> OLD.data OR NEW."isWrite" <> OLD."isWrite"
 OR (OLD."completedAt" IS NOT NULL AND (NEW."completedAt" IS DISTINCT FROM OLD."completedAt" OR NEW."responseHash" IS DISTINCT FROM OLD."responseHash" OR NEW.percent IS DISTINCT FROM OLD.percent)) THEN
  RAISE EXCEPTION 'QuickBooks request evidence is immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER cw_qb_request_immutable BEFORE UPDATE OR DELETE ON "QuickBooksRequest" FOR EACH ROW EXECUTE FUNCTION cw_qb_request_immutable();
