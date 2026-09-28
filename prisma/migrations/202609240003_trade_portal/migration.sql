-- CreateEnum
CREATE TYPE "FileOrigin" AS ENUM ('STAFF', 'TRADE_UPLOAD');

-- CreateEnum
CREATE TYPE "InstructionStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACKNOWLEDGED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeficiencyStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'CLOSED', 'REOPENED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TradeResponseType" AS ENUM ('CONFIRMED', 'CONFLICT', 'QUESTION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Capability" ADD VALUE 'TRADE_ACCESS_MANAGE';
ALTER TYPE "Capability" ADD VALUE 'TRADE_CONTENT_PUBLISH';
ALTER TYPE "Capability" ADD VALUE 'SITE_INSTRUCTION_VIEW';
ALTER TYPE "Capability" ADD VALUE 'SITE_INSTRUCTION_CREATE';
ALTER TYPE "Capability" ADD VALUE 'SITE_INSTRUCTION_ISSUE';
ALTER TYPE "Capability" ADD VALUE 'DEFICIENCY_VIEW';
ALTER TYPE "Capability" ADD VALUE 'DEFICIENCY_CREATE';
ALTER TYPE "Capability" ADD VALUE 'DEFICIENCY_ASSIGN';
ALTER TYPE "Capability" ADD VALUE 'DEFICIENCY_VERIFY';
ALTER TYPE "Capability" ADD VALUE 'TRADE_MESSAGE_VIEW';
ALTER TYPE "Capability" ADD VALUE 'TRADE_MESSAGE_SEND';

-- AlterEnum
ALTER TYPE "ConversationAudience" ADD VALUE 'TRADE';

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "deficiencyId" TEXT,
ADD COLUMN     "purchasingRevisionId" TEXT,
ADD COLUMN     "siteInstructionId" TEXT,
ADD COLUMN     "tradeContactId" TEXT;

-- AlterTable
ALTER TABLE "ProjectMessage" ADD COLUMN     "attachmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ProjectTask" ADD COLUMN     "tradeDescription" TEXT,
ADD COLUMN     "tradeTitle" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "deficiencyPrefix" TEXT NOT NULL DEFAULT 'DEF-',
ADD COLUMN     "nextDeficiencyNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nextSiteInstructionNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "siteInstructionPrefix" TEXT NOT NULL DEFAULT 'SI-';

-- AlterTable
ALTER TABLE "StoredFile" ADD COLUMN     "deficiencyId" TEXT,
ADD COLUMN     "origin" "FileOrigin" NOT NULL DEFAULT 'STAFF',
ADD COLUMN     "revisionLabel" TEXT,
ADD COLUMN     "siteInstructionId" TEXT,
ADD COLUMN     "tradePurchasingRevisionId" TEXT,
ADD COLUMN     "tradeUploaderContactId" TEXT;

-- CreateTable
CREATE TABLE "TradeProjectAccess" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "invitedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "invitedById" TEXT NOT NULL,

    CONSTRAINT "TradeProjectAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeTaskRelease" (
    "taskId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "releasedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeTaskRelease_pkey" PRIMARY KEY ("taskId","contactId")
);

-- CreateTable
CREATE TABLE "TradeScheduleResponse" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "response" "TradeResponseType" NOT NULL,
    "comment" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedById" TEXT,
    "resolution" TEXT,

    CONSTRAINT "TradeScheduleResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeFileShare" (
    "fileId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sharedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TradeFileShare_pkey" PRIMARY KEY ("fileId","contactId")
);

-- CreateTable
CREATE TABLE "SiteInstruction" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "internalNotes" TEXT,
    "status" "InstructionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "acknowledgementRequired" BOOLEAN NOT NULL DEFAULT true,
    "purchasingRevisionId" TEXT,
    "taskId" TEXT,
    "replacesId" TEXT,
    "attachmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "snapshot" JSONB,
    "createdById" TEXT NOT NULL,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMPTZ(3),
    "acknowledgedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SiteInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteInstructionRecipient" (
    "instructionId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "SiteInstructionRecipient_pkey" PRIMARY KEY ("instructionId","contactId")
);

-- CreateTable
CREATE TABLE "TradeAcknowledgement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "purchasingRevisionId" TEXT,
    "instructionId" TEXT,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "typedName" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'RECEIPT_ACKNOWLEDGED',
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deficiency" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "internalNotes" TEXT,
    "assignedContactId" TEXT,
    "status" "DeficiencyStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "taskId" TEXT,
    "dueDate" DATE,
    "completedAt" TIMESTAMPTZ(3),
    "verifiedAt" TIMESTAMPTZ(3),
    "verifiedById" TEXT,
    "createdById" TEXT NOT NULL,
    "attachmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Deficiency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeficiencyUpdate" (
    "recipientContactId" TEXT,
    "id" TEXT NOT NULL,
    "deficiencyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "status" "DeficiencyStatus" NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeficiencyUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeProjectAccess_projectId_userId_key" ON "TradeProjectAccess"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeProjectAccess_projectId_contactId_key" ON "TradeProjectAccess"("projectId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeScheduleResponse_requestId_key" ON "TradeScheduleResponse"("requestId");

-- CreateIndex
CREATE INDEX "TradeScheduleResponse_taskId_contactId_idx" ON "TradeScheduleResponse"("taskId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteInstruction_number_key" ON "SiteInstruction"("number");

-- CreateIndex
CREATE INDEX "SiteInstruction_projectId_status_idx" ON "SiteInstruction"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TradeAcknowledgement_purchasingRevisionId_contactId_key" ON "TradeAcknowledgement"("purchasingRevisionId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeAcknowledgement_instructionId_contactId_key" ON "TradeAcknowledgement"("instructionId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Deficiency_number_key" ON "Deficiency"("number");

-- CreateIndex
CREATE INDEX "Deficiency_projectId_assignedContactId_status_idx" ON "Deficiency"("projectId", "assignedContactId", "status");

-- CreateIndex
CREATE INDEX "DeficiencyUpdate_deficiencyId_createdAt_idx" ON "DeficiencyUpdate"("deficiencyId", "createdAt");

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_tradeUploaderContactId_fkey" FOREIGN KEY ("tradeUploaderContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_tradePurchasingRevisionId_fkey" FOREIGN KEY ("tradePurchasingRevisionId") REFERENCES "PurchasingRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_siteInstructionId_fkey" FOREIGN KEY ("siteInstructionId") REFERENCES "SiteInstruction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_deficiencyId_fkey" FOREIGN KEY ("deficiencyId") REFERENCES "Deficiency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tradeContactId_fkey" FOREIGN KEY ("tradeContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_purchasingRevisionId_fkey" FOREIGN KEY ("purchasingRevisionId") REFERENCES "PurchasingRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_siteInstructionId_fkey" FOREIGN KEY ("siteInstructionId") REFERENCES "SiteInstruction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_deficiencyId_fkey" FOREIGN KEY ("deficiencyId") REFERENCES "Deficiency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProjectAccess" ADD CONSTRAINT "TradeProjectAccess_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProjectAccess" ADD CONSTRAINT "TradeProjectAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProjectAccess" ADD CONSTRAINT "TradeProjectAccess_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeTaskRelease" ADD CONSTRAINT "TradeTaskRelease_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeTaskRelease" ADD CONSTRAINT "TradeTaskRelease_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeScheduleResponse" ADD CONSTRAINT "TradeScheduleResponse_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeScheduleResponse" ADD CONSTRAINT "TradeScheduleResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeScheduleResponse" ADD CONSTRAINT "TradeScheduleResponse_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeFileShare" ADD CONSTRAINT "TradeFileShare_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeFileShare" ADD CONSTRAINT "TradeFileShare_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInstruction" ADD CONSTRAINT "SiteInstruction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInstruction" ADD CONSTRAINT "SiteInstruction_purchasingRevisionId_fkey" FOREIGN KEY ("purchasingRevisionId") REFERENCES "PurchasingRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInstruction" ADD CONSTRAINT "SiteInstruction_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInstruction" ADD CONSTRAINT "SiteInstruction_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "SiteInstruction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInstructionRecipient" ADD CONSTRAINT "SiteInstructionRecipient_instructionId_fkey" FOREIGN KEY ("instructionId") REFERENCES "SiteInstruction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInstructionRecipient" ADD CONSTRAINT "SiteInstructionRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAcknowledgement" ADD CONSTRAINT "TradeAcknowledgement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAcknowledgement" ADD CONSTRAINT "TradeAcknowledgement_purchasingRevisionId_fkey" FOREIGN KEY ("purchasingRevisionId") REFERENCES "PurchasingRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAcknowledgement" ADD CONSTRAINT "TradeAcknowledgement_instructionId_fkey" FOREIGN KEY ("instructionId") REFERENCES "SiteInstruction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAcknowledgement" ADD CONSTRAINT "TradeAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAcknowledgement" ADD CONSTRAINT "TradeAcknowledgement_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deficiency" ADD CONSTRAINT "Deficiency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deficiency" ADD CONSTRAINT "Deficiency_assignedContactId_fkey" FOREIGN KEY ("assignedContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deficiency" ADD CONSTRAINT "Deficiency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeficiencyUpdate" ADD CONSTRAINT "DeficiencyUpdate_deficiencyId_fkey" FOREIGN KEY ("deficiencyId") REFERENCES "Deficiency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial receipt evidence and operational history cannot be rewritten.
ALTER TABLE "TradeAcknowledgement" ADD CONSTRAINT "TradeAcknowledgement_source_check" CHECK (("purchasingRevisionId" IS NULL) <> ("instructionId" IS NULL));
ALTER TABLE "TradeAcknowledgement" ADD CONSTRAINT "TradeAcknowledgement_action_check" CHECK (action = 'RECEIPT_ACKNOWLEDGED');
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_trade_scope_check" CHECK (
 (audience::text='TRADE' AND "tradeContactId" IS NOT NULL AND "selectionId" IS NULL AND "changeOrderRevisionId" IS NULL)
 OR (audience::text<>'TRADE' AND "tradeContactId" IS NULL AND "purchasingRevisionId" IS NULL AND "siteInstructionId" IS NULL AND "deficiencyId" IS NULL));
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_trade_origin_check" CHECK (origin::text<>'TRADE_UPLOAD' OR ("tradeUploaderContactId" IS NOT NULL AND visibility::text='TRADE'));
ALTER TABLE "SiteInstruction" ADD CONSTRAINT "SiteInstruction_version_check" CHECK (version > 0);
ALTER TABLE "Deficiency" ADD CONSTRAINT "Deficiency_version_check" CHECK (version > 0);
CREATE FUNCTION protect_trade_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Trade evidence is immutable'; END $$;
CREATE TRIGGER trade_acknowledgement_immutable BEFORE UPDATE OR DELETE ON "TradeAcknowledgement" FOR EACH ROW EXECUTE FUNCTION protect_trade_evidence();
CREATE TRIGGER deficiency_update_immutable BEFORE UPDATE OR DELETE ON "DeficiencyUpdate" FOR EACH ROW EXECUTE FUNCTION protect_trade_evidence();
CREATE FUNCTION protect_trade_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='SiteInstruction' AND (to_jsonb(OLD)->>'issuedAt') IS NOT NULL THEN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','version','updatedAt','acknowledgedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updatedAt','acknowledgedAt']) THEN RAISE EXCEPTION 'Issued instructions are immutable; create a replacement'; END IF;
 ELSIF TG_TABLE_NAME='SiteInstructionRecipient' THEN
  IF TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM "SiteInstruction" WHERE id=OLD."instructionId" AND "issuedAt" IS NOT NULL) THEN RAISE EXCEPTION 'Issued instruction recipients are immutable'; END IF;
  IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM "SiteInstruction" WHERE id=NEW."instructionId" AND "issuedAt" IS NOT NULL) THEN RAISE EXCEPTION 'Issued instruction recipients are immutable'; END IF;
 ELSIF TG_TABLE_NAME='TradeScheduleResponse' THEN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['resolvedAt','resolvedById','resolution']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['resolvedAt','resolvedById','resolution']) THEN RAISE EXCEPTION 'Schedule response evidence is immutable'; END IF;
 ELSIF TG_TABLE_NAME='TradeFileShare' AND (to_jsonb(OLD)->>'lockedAt') IS NOT NULL THEN
  IF TG_OP='DELETE' OR NEW."lockedAt" IS NULL OR NEW."fileId"<>OLD."fileId" OR NEW."contactId"<>OLD."contactId" THEN RAISE EXCEPTION 'Issued evidence cannot be unshared'; END IF;
 ELSIF TG_TABLE_NAME='StoredFile' AND EXISTS(SELECT 1 FROM "TradeFileShare" WHERE "fileId"=(to_jsonb(OLD)->>'id') AND "lockedAt" IS NOT NULL) THEN
  IF TG_OP='DELETE' OR to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'Files retained as trade evidence are immutable'; END IF;
 ELSIF TG_TABLE_NAME='Conversation' AND (to_jsonb(OLD)->>'audience')='TRADE' THEN
  IF TG_OP='DELETE' OR to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'Trade conversation identity and context are immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER instruction_immutable BEFORE UPDATE OR DELETE ON "SiteInstruction" FOR EACH ROW EXECUTE FUNCTION protect_trade_content();
CREATE TRIGGER instruction_recipients_immutable BEFORE INSERT OR UPDATE OR DELETE ON "SiteInstructionRecipient" FOR EACH ROW EXECUTE FUNCTION protect_trade_content();
CREATE TRIGGER schedule_response_immutable BEFORE UPDATE OR DELETE ON "TradeScheduleResponse" FOR EACH ROW EXECUTE FUNCTION protect_trade_content();
CREATE TRIGGER trade_share_retained BEFORE UPDATE OR DELETE ON "TradeFileShare" FOR EACH ROW EXECUTE FUNCTION protect_trade_content();
CREATE TRIGGER trade_file_retained BEFORE UPDATE OR DELETE ON "StoredFile" FOR EACH ROW EXECUTE FUNCTION protect_trade_content();
CREATE TRIGGER trade_conversation_immutable BEFORE UPDATE OR DELETE ON "Conversation" FOR EACH ROW EXECUTE FUNCTION protect_trade_content();
