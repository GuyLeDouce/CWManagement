-- CreateEnum
-- Phase 5 credits retain positive quantities and permit signed cost/price adjustments.
ALTER TABLE "ChangeOrderLine" DROP CONSTRAINT "ChangeOrderLine_values_check";
ALTER TABLE "ChangeOrderLine" ADD CONSTRAINT "ChangeOrderLine_values_check" CHECK ("quantity" >= 0);
ALTER TABLE "ChangeOrderRevision" DROP CONSTRAINT "ChangeOrderRevision_totals_check";
ALTER TABLE "ChangeOrderRevision" ADD CONSTRAINT "ChangeOrderRevision_totals_check" CHECK ("total" = "subtotal" + "taxAmount" AND "taxRate" BETWEEN 0 AND 1 AND "scheduleDays" BETWEEN -3650 AND 3650 AND "version" > 0 AND "revision" >= 0);

-- CreateEnum
CREATE TYPE "SelectionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'APPROVAL_REQUIRED', 'APPROVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConversationAudience" AS ENUM ('INTERNAL', 'CLIENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Capability" ADD VALUE 'CLIENT_ACCESS_MANAGE';
ALTER TYPE "Capability" ADD VALUE 'CLIENT_CONTENT_PUBLISH';
ALTER TYPE "Capability" ADD VALUE 'SELECTION_VIEW';
ALTER TYPE "Capability" ADD VALUE 'SELECTION_CREATE';
ALTER TYPE "Capability" ADD VALUE 'SELECTION_EDIT';
ALTER TYPE "Capability" ADD VALUE 'SELECTION_PUBLISH';
ALTER TYPE "Capability" ADD VALUE 'SELECTION_APPROVE_INTERNAL';
ALTER TYPE "Capability" ADD VALUE 'CLIENT_MESSAGE_VIEW';
ALTER TYPE "Capability" ADD VALUE 'CLIENT_MESSAGE_SEND';

-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN     "clientSummary" TEXT;

-- AlterTable
ALTER TABLE "Jobsite" ADD COLUMN     "clientTargetCompletion" DATE;

-- AlterTable
ALTER TABLE "ProjectTask" ADD COLUMN     "clientDescription" TEXT,
ADD COLUMN     "clientTitle" TEXT,
ADD COLUMN     "clientVisible" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ClientProjectAccess" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "invitedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "invitedById" TEXT NOT NULL,

    CONSTRAINT "ClientProjectAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allowance" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "internalNotes" TEXT,
    "costCodeId" TEXT NOT NULL,
    "costType" "CostCodeType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "includedCost" DECIMAL(14,2) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "estimateLineId" TEXT,
    "budgetLineId" TEXT,
    "deadline" DATE,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allowance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Selection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "allowanceId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "internalNotes" TEXT,
    "deadline" DATE,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" "SelectionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMPTZ(3),
    "decidedAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "changeOrderId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Selection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelectionOption" (
    "id" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "finish" TEXT,
    "referenceUrl" TEXT,
    "leadTime" TEXT,
    "vendorContactId" TEXT,
    "attachmentIds" TEXT[],
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" TEXT,
    "costCodeId" TEXT NOT NULL,
    "costType" "CostCodeType" NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "markupMethod" "MarkupMethod" NOT NULL,
    "markupValue" DECIMAL(14,4) NOT NULL,
    "clientPrice" DECIMAL(14,2) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SelectionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelectionDecision" (
    "id" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SelectionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientApproval" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "typedName" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "audience" "ConversationAudience" NOT NULL DEFAULT 'INTERNAL',
    "selectionId" TEXT,
    "changeOrderRevisionId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationRead" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationRead_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientProjectAccess_projectId_userId_key" ON "ClientProjectAccess"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProjectAccess_projectId_contactId_key" ON "ClientProjectAccess"("projectId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Allowance_estimateLineId_key" ON "Allowance"("estimateLineId");

-- CreateIndex
CREATE INDEX "Allowance_projectId_idx" ON "Allowance"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Selection_allowanceId_key" ON "Selection"("allowanceId");

-- CreateIndex
CREATE UNIQUE INDEX "Selection_changeOrderId_key" ON "Selection"("changeOrderId");

-- CreateIndex
CREATE INDEX "Selection_projectId_status_idx" ON "Selection"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SelectionDecision_selectionId_key" ON "SelectionDecision"("selectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientApproval_revisionId_key" ON "ClientApproval"("revisionId");

-- CreateIndex
CREATE INDEX "Conversation_projectId_audience_idx" ON "Conversation"("projectId", "audience");

-- CreateIndex
CREATE INDEX "ProjectMessage_conversationId_createdAt_idx" ON "ProjectMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientProjectAccess" ADD CONSTRAINT "ClientProjectAccess_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientProjectAccess" ADD CONSTRAINT "ClientProjectAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientProjectAccess" ADD CONSTRAINT "ClientProjectAccess_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allowance" ADD CONSTRAINT "Allowance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allowance" ADD CONSTRAINT "Allowance_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allowance" ADD CONSTRAINT "Allowance_estimateLineId_fkey" FOREIGN KEY ("estimateLineId") REFERENCES "EstimateLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allowance" ADD CONSTRAINT "Allowance_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_allowanceId_fkey" FOREIGN KEY ("allowanceId") REFERENCES "Allowance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionOption" ADD CONSTRAINT "SelectionOption_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionOption" ADD CONSTRAINT "SelectionOption_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionOption" ADD CONSTRAINT "SelectionOption_vendorContactId_fkey" FOREIGN KEY ("vendorContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionDecision" ADD CONSTRAINT "SelectionDecision_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionDecision" ADD CONSTRAINT "SelectionDecision_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "SelectionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionDecision" ADD CONSTRAINT "SelectionDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientApproval" ADD CONSTRAINT "ClientApproval_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ChangeOrderRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientApproval" ADD CONSTRAINT "ClientApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_changeOrderRevisionId_fkey" FOREIGN KEY ("changeOrderRevisionId") REFERENCES "ChangeOrderRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMessage" ADD CONSTRAINT "ProjectMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMessage" ADD CONSTRAINT "ProjectMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationRead" ADD CONSTRAINT "ConversationRead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationRead" ADD CONSTRAINT "ConversationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Allowance" ADD CONSTRAINT "Allowance_amounts_check" CHECK ("amount" >= 0 AND "includedCost" >= 0);
ALTER TABLE "SelectionOption" ADD CONSTRAINT "SelectionOption_values_check" CHECK ("quantity" >= 0 AND "unitCost" >= 0 AND "markupValue" >= 0 AND "clientPrice" >= 0);
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_version_check" CHECK ("version" > 0);
ALTER TABLE "ClientApproval" ADD CONSTRAINT "ClientApproval_action_check" CHECK ("action" IN ('APPROVE','DECLINE'));
CREATE FUNCTION protect_client_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Client decisions and approval evidence are immutable'; END $$;
CREATE TRIGGER selection_decision_immutable BEFORE UPDATE OR DELETE ON "SelectionDecision" FOR EACH ROW EXECUTE FUNCTION protect_client_evidence();
CREATE TRIGGER client_approval_immutable BEFORE UPDATE OR DELETE ON "ClientApproval" FOR EACH ROW EXECUTE FUNCTION protect_client_evidence();
CREATE TRIGGER project_message_immutable BEFORE UPDATE OR DELETE ON "ProjectMessage" FOR EACH ROW EXECUTE FUNCTION protect_client_evidence();
CREATE FUNCTION protect_selection_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME = 'SelectionOption' THEN
  IF TG_OP <> 'INSERT' AND EXISTS(SELECT 1 FROM "Selection" WHERE id=OLD."selectionId" AND status <> 'DRAFT') THEN RAISE EXCEPTION 'Published selection options are immutable'; END IF;
  IF TG_OP <> 'DELETE' AND EXISTS(SELECT 1 FROM "Selection" WHERE id=NEW."selectionId" AND status <> 'DRAFT') THEN RAISE EXCEPTION 'Published selection options are immutable'; END IF;
 ELSIF TG_TABLE_NAME = 'Selection' AND EXISTS(SELECT 1 FROM "SelectionDecision" WHERE "selectionId"=OLD.id) THEN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','version','updatedAt','decidedAt','approvedAt','changeOrderId']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updatedAt','decidedAt','approvedAt','changeOrderId']) THEN RAISE EXCEPTION 'Decided selection content is immutable'; END IF;
 ELSIF TG_TABLE_NAME = 'Allowance' AND OLD."publishedAt" IS NOT NULL THEN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-'publishedAt') IS DISTINCT FROM (to_jsonb(OLD)-'publishedAt') THEN RAISE EXCEPTION 'Published contractual allowance is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER selection_options_immutable BEFORE INSERT OR UPDATE OR DELETE ON "SelectionOption" FOR EACH ROW EXECUTE FUNCTION protect_selection_content();
CREATE TRIGGER selection_content_immutable BEFORE UPDATE OR DELETE ON "Selection" FOR EACH ROW EXECUTE FUNCTION protect_selection_content();
CREATE TRIGGER allowance_content_immutable BEFORE UPDATE OR DELETE ON "Allowance" FOR EACH ROW EXECUTE FUNCTION protect_selection_content();
