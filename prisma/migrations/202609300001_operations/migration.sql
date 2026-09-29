-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('SUBMITTED', 'REVIEWING', 'ACCEPTED', 'NOT_WARRANTY', 'ASSIGNED', 'SCHEDULED', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'READY_FOR_CLIENT', 'CLIENT_VERIFIED', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Capability" ADD VALUE 'CRM_VIEW';
ALTER TYPE "Capability" ADD VALUE 'CRM_MANAGE';
ALTER TYPE "Capability" ADD VALUE 'CRM_CONFIGURE';
ALTER TYPE "Capability" ADD VALUE 'WARRANTY_VIEW';
ALTER TYPE "Capability" ADD VALUE 'WARRANTY_MANAGE';
ALTER TYPE "Capability" ADD VALUE 'REPORT_VIEW';
ALTER TYPE "Capability" ADD VALUE 'AUTOMATION_MANAGE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dailyDigestEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Jobsite" ADD COLUMN     "warrantyExpirationDate" DATE,
ADD COLUMN     "warrantyStartDate" DATE,
ADD COLUMN     "weeklyClientSummaryEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StoredFile" ADD COLUMN     "storageProvider" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN     "warrantyRequestId" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "automationEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "automationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nextWarrantyNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "OpportunityStage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OpportunityStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "sourceId" TEXT,
    "ownerId" TEXT NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "projectType" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "municipality" TEXT NOT NULL DEFAULT '',
    "referralSource" TEXT NOT NULL DEFAULT '',
    "estimatedValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expectedCloseDate" DATE,
    "consultationDate" TIMESTAMPTZ(3),
    "nextFollowUp" TIMESTAMPTZ(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "lostReason" TEXT,
    "closedAt" TIMESTAMPTZ(3),
    "projectId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmActivity" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "WarrantyStatus" NOT NULL DEFAULT 'SUBMITTED',
    "clientContactId" TEXT,
    "assignedUserId" TEXT,
    "assignedTradeId" TEXT,
    "createdById" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ(3),
    "appointmentAt" TIMESTAMPTZ(3),
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "clientNotes" TEXT NOT NULL DEFAULT '',
    "tradeDescription" TEXT NOT NULL DEFAULT '',
    "decisionReason" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMPTZ(3),
    "clientVerifiedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WarrantyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyUpdate" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "audience" "FileVisibility" NOT NULL DEFAULT 'INTERNAL',
    "body" TEXT NOT NULL,
    "status" "WarrantyStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "report" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "generated" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "safeError" TEXT,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationLease" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AutomationLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRecord" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "actionUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMPTZ(3),
    "safeError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityStage_name_key" ON "OpportunityStage"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSource_name_key" ON "LeadSource"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_projectId_key" ON "Opportunity"("projectId");

-- CreateIndex
CREATE INDEX "Opportunity_ownerId_status_nextFollowUp_idx" ON "Opportunity"("ownerId", "status", "nextFollowUp");

-- CreateIndex
CREATE INDEX "CrmActivity_ownerId_completedAt_dueAt_idx" ON "CrmActivity"("ownerId", "completedAt", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyRequest_number_key" ON "WarrantyRequest"("number");

-- CreateIndex
CREATE INDEX "WarrantyRequest_projectId_status_dueAt_idx" ON "WarrantyRequest"("projectId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "WarrantyRequest_assignedTradeId_status_idx" ON "WarrantyRequest"("assignedTradeId", "status");

-- CreateIndex
CREATE INDEX "WarrantyUpdate_requestId_createdAt_idx" ON "WarrantyUpdate"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedReport_userId_name_key" ON "SavedReport"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRecord_dedupeKey_key" ON "DeliveryRecord"("dedupeKey");

-- CreateIndex
CREATE INDEX "DeliveryRecord_status_availableAt_idx" ON "DeliveryRecord"("status", "availableAt");

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_warrantyRequestId_fkey" FOREIGN KEY ("warrantyRequestId") REFERENCES "WarrantyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "OpportunityStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LeadSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyRequest" ADD CONSTRAINT "WarrantyRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyUpdate" ADD CONSTRAINT "WarrantyUpdate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "WarrantyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedReport" ADD CONSTRAINT "SavedReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "DeliveryRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
