-- CreateEnum
CREATE TYPE "PurchasingType" AS ENUM ('PURCHASE_ORDER', 'WORK_ORDER');

-- CreateEnum
CREATE TYPE "PurchasingStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'APPROVED', 'ISSUED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ChangeOrderStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'READY', 'ISSUED', 'ACCEPTED', 'REJECTED', 'VOID', 'SUPERSEDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Capability" ADD VALUE 'PURCHASE_ORDER_VIEW';
ALTER TYPE "Capability" ADD VALUE 'PURCHASE_ORDER_EDIT';
ALTER TYPE "Capability" ADD VALUE 'PURCHASE_ORDER_APPROVE';
ALTER TYPE "Capability" ADD VALUE 'PURCHASE_ORDER_ISSUE';
ALTER TYPE "Capability" ADD VALUE 'WORK_ORDER_VIEW';
ALTER TYPE "Capability" ADD VALUE 'WORK_ORDER_CREATE';
ALTER TYPE "Capability" ADD VALUE 'WORK_ORDER_EDIT';
ALTER TYPE "Capability" ADD VALUE 'WORK_ORDER_APPROVE';
ALTER TYPE "Capability" ADD VALUE 'WORK_ORDER_ISSUE';
ALTER TYPE "Capability" ADD VALUE 'CHANGE_ORDER_VIEW';
ALTER TYPE "Capability" ADD VALUE 'CHANGE_ORDER_EDIT';
ALTER TYPE "Capability" ADD VALUE 'CHANGE_ORDER_APPROVE_INTERNAL';
ALTER TYPE "Capability" ADD VALUE 'CHANGE_ORDER_ISSUE';
ALTER TYPE "Capability" ADD VALUE 'CHANGE_ORDER_ACCEPT';
ALTER TYPE "Capability" ADD VALUE 'COMMITMENT_VIEW';
ALTER TYPE "Capability" ADD VALUE 'COMMITMENT_MANAGE';
ALTER TYPE "Capability" ADD VALUE 'ACTUAL_COST_RECONCILE';

-- AlterTable
ALTER TABLE "ActualCost" ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedById" TEXT;

-- AlterTable
ALTER TABLE "BudgetVersion" ADD COLUMN     "changeOrderRevisionId" TEXT;

-- AlterTable
ALTER TABLE "Commitment" ADD COLUMN     "purchasingDocumentId" TEXT;

-- AlterTable
ALTER TABLE "CommitmentLine" ADD COLUMN     "sourceLineKey" TEXT;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "changeOrderPrefix" TEXT NOT NULL DEFAULT 'CO',
ADD COLUMN     "changeOrderTerms" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "nextChangeOrderNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nextPurchaseOrderNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nextWorkOrderNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "purchaseOrderPrefix" TEXT NOT NULL DEFAULT 'PO',
ADD COLUMN     "purchasingTerms" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "workOrderPrefix" TEXT NOT NULL DEFAULT 'WO';

-- CreateTable
CREATE TABLE "PurchasingDocument" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "PurchasingType" NOT NULL,
    "number" TEXT NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PurchasingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchasingRevision" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "PurchasingStatus" NOT NULL DEFAULT 'DRAFT',
    "vendorContactId" TEXT NOT NULL,
    "billingContactId" TEXT,
    "changeOrderRevisionId" TEXT,
    "scheduleTaskId" TEXT,
    "attachmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "title" TEXT NOT NULL,
    "scope" TEXT,
    "terms" TEXT,
    "internalNotes" TEXT,
    "vendorNotes" TEXT,
    "expectedDate" DATE,
    "taxRate" DECIMAL(7,6) NOT NULL,
    "snapshot" JSONB,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "issuedById" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "issuedAt" TIMESTAMPTZ(3),
    "acknowledgedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PurchasingRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchasingLine" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "costCodeSnapshot" TEXT NOT NULL,
    "costCodeNameSnapshot" TEXT NOT NULL,
    "costType" "CostCodeType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "internalNotes" TEXT,

    CONSTRAINT "PurchasingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrderRevision" (
    "id" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ChangeOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "internalNotes" TEXT,
    "scope" TEXT,
    "terms" TEXT,
    "clientId" TEXT,
    "attachmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduleDays" INTEGER NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(7,6) NOT NULL,
    "snapshot" JSONB,
    "costTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "issuedById" TEXT,
    "acceptedById" TEXT,
    "acceptedByName" TEXT,
    "acceptanceMethod" TEXT,
    "acceptanceReference" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "issuedAt" TIMESTAMPTZ(3),
    "acceptedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChangeOrderRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrderLine" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "costCodeSnapshot" TEXT NOT NULL,
    "costCodeNameSnapshot" TEXT NOT NULL,
    "costType" "CostCodeType" NOT NULL,
    "description" TEXT NOT NULL,
    "clientDescription" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "markupMethod" "MarkupMethod" NOT NULL DEFAULT 'NONE',
    "markupValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChangeOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAdjustment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchasingDocument_number_key" ON "PurchasingDocument"("number");

-- CreateIndex
CREATE INDEX "PurchasingDocument_projectId_type_idx" ON "PurchasingDocument"("projectId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "PurchasingRevision_documentId_revision_key" ON "PurchasingRevision"("documentId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "PurchasingLine_revisionId_lineKey_key" ON "PurchasingLine"("revisionId", "lineKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrder_number_key" ON "ChangeOrder"("number");

-- CreateIndex
CREATE INDEX "ChangeOrder_projectId_idx" ON "ChangeOrder"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrderRevision_changeOrderId_revision_key" ON "ChangeOrderRevision"("changeOrderId", "revision");

-- CreateIndex
CREATE INDEX "ChangeOrderLine_revisionId_idx" ON "ChangeOrderLine"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAdjustment_changeOrderId_key" ON "ContractAdjustment"("changeOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAdjustment_revisionId_key" ON "ContractAdjustment"("revisionId");

-- CreateIndex
CREATE INDEX "ContractAdjustment_projectId_idx" ON "ContractAdjustment"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetVersion_changeOrderRevisionId_key" ON "BudgetVersion"("changeOrderRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Commitment_purchasingDocumentId_key" ON "Commitment"("purchasingDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "CommitmentLine_commitmentId_sourceLineKey_key" ON "CommitmentLine"("commitmentId", "sourceLineKey");

-- AddForeignKey
ALTER TABLE "PurchasingDocument" ADD CONSTRAINT "PurchasingDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasingRevision" ADD CONSTRAINT "PurchasingRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PurchasingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasingRevision" ADD CONSTRAINT "PurchasingRevision_vendorContactId_fkey" FOREIGN KEY ("vendorContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasingRevision" ADD CONSTRAINT "PurchasingRevision_billingContactId_fkey" FOREIGN KEY ("billingContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasingRevision" ADD CONSTRAINT "PurchasingRevision_changeOrderRevisionId_fkey" FOREIGN KEY ("changeOrderRevisionId") REFERENCES "ChangeOrderRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasingRevision" ADD CONSTRAINT "PurchasingRevision_scheduleTaskId_fkey" FOREIGN KEY ("scheduleTaskId") REFERENCES "ProjectTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasingLine" ADD CONSTRAINT "PurchasingLine_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PurchasingRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasingLine" ADD CONSTRAINT "PurchasingLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderRevision" ADD CONSTRAINT "ChangeOrderRevision_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderRevision" ADD CONSTRAINT "ChangeOrderRevision_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderLine" ADD CONSTRAINT "ChangeOrderLine_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ChangeOrderRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderLine" ADD CONSTRAINT "ChangeOrderLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAdjustment" ADD CONSTRAINT "ContractAdjustment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAdjustment" ADD CONSTRAINT "ContractAdjustment_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAdjustment" ADD CONSTRAINT "ContractAdjustment_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ChangeOrderRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetVersion" ADD CONSTRAINT "BudgetVersion_changeOrderRevisionId_fkey" FOREIGN KEY ("changeOrderRevisionId") REFERENCES "ChangeOrderRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_purchasingDocumentId_fkey" FOREIGN KEY ("purchasingDocumentId") REFERENCES "PurchasingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial bounds; the existing CommitmentLine check already enforces 0 <= consumed <= committed.
ALTER TABLE "PurchasingLine" ADD CONSTRAINT "PurchasingLine_values_check" CHECK ("quantity" >= 0 AND "unitCost" >= 0 AND "amount" = round("quantity" * "unitCost", 2));
ALTER TABLE "ChangeOrderLine" ADD CONSTRAINT "ChangeOrderLine_values_check" CHECK ("quantity" >= 0 AND "unitCost" >= 0 AND "markupValue" >= 0);
ALTER TABLE "PurchasingRevision" ADD CONSTRAINT "PurchasingRevision_totals_check" CHECK ("subtotal" >= 0 AND "taxAmount" >= 0 AND "total" = "subtotal" + "taxAmount" AND "taxRate" BETWEEN 0 AND 1 AND "version" > 0 AND "revision" >= 0);
ALTER TABLE "ChangeOrderRevision" ADD CONSTRAINT "ChangeOrderRevision_totals_check" CHECK ("costTotal" >= 0 AND "subtotal" >= 0 AND "taxAmount" >= 0 AND "total" = "subtotal" + "taxAmount" AND "taxRate" BETWEEN 0 AND 1 AND "scheduleDays" BETWEEN -3650 AND 3650 AND "version" > 0 AND "revision" >= 0);

-- Immutable issued content. Lifecycle/acceptance metadata may advance, content cannot.
CREATE FUNCTION protect_issued_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."issuedAt" IS NOT NULL THEN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Issued documents cannot be deleted'; END IF;
  IF (to_jsonb(OLD) - ARRAY['status','version','updatedAt','acceptedAt','acceptedById','acceptedByName','acceptanceMethod','acceptanceReference','acknowledgedAt'])
     IS DISTINCT FROM
     (to_jsonb(NEW) - ARRAY['status','version','updatedAt','acceptedAt','acceptedById','acceptedByName','acceptanceMethod','acceptanceReference','acknowledgedAt'])
  THEN RAISE EXCEPTION 'Issued document content is immutable'; END IF;
  IF to_jsonb(OLD)->>'status' = 'ACCEPTED' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW)
  THEN RAISE EXCEPTION 'Accepted change orders are immutable'; END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER purchasing_issued_immutable BEFORE UPDATE OR DELETE ON "PurchasingRevision" FOR EACH ROW EXECUTE FUNCTION protect_issued_document();
CREATE TRIGGER change_order_issued_immutable BEFORE UPDATE OR DELETE ON "ChangeOrderRevision" FOR EACH ROW EXECUTE FUNCTION protect_issued_document();

CREATE FUNCTION protect_issued_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE locked boolean;
BEGIN
 IF TG_OP != 'INSERT' THEN
  IF TG_TABLE_NAME = 'PurchasingLine' THEN SELECT "issuedAt" IS NOT NULL INTO locked FROM "PurchasingRevision" WHERE id = OLD."revisionId";
  ELSE SELECT "issuedAt" IS NOT NULL INTO locked FROM "ChangeOrderRevision" WHERE id = OLD."revisionId"; END IF;
  IF locked THEN RAISE EXCEPTION 'Issued document lines are immutable'; END IF;
 END IF;
 IF TG_OP != 'DELETE' THEN
  IF TG_TABLE_NAME = 'PurchasingLine' THEN SELECT "issuedAt" IS NOT NULL INTO locked FROM "PurchasingRevision" WHERE id = NEW."revisionId";
  ELSE SELECT "issuedAt" IS NOT NULL INTO locked FROM "ChangeOrderRevision" WHERE id = NEW."revisionId"; END IF;
  IF locked THEN RAISE EXCEPTION 'Issued document lines are immutable'; END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER purchasing_lines_immutable BEFORE INSERT OR UPDATE OR DELETE ON "PurchasingLine" FOR EACH ROW EXECUTE FUNCTION protect_issued_line();
CREATE TRIGGER change_order_lines_immutable BEFORE INSERT OR UPDATE OR DELETE ON "ChangeOrderLine" FOR EACH ROW EXECUTE FUNCTION protect_issued_line();

CREATE FUNCTION protect_contract_baseline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."contractAmount" IS DISTINCT FROM OLD."contractAmount" AND EXISTS(SELECT 1 FROM "ContractAdjustment" WHERE "projectId"=OLD.id)
 THEN RAISE EXCEPTION 'Original contract is locked after accepted change orders'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contract_baseline_immutable BEFORE UPDATE ON "Jobsite" FOR EACH ROW EXECUTE FUNCTION protect_contract_baseline();
CREATE FUNCTION protect_contract_adjustment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Contract adjustments are immutable'; END $$;
CREATE TRIGGER contract_adjustment_immutable BEFORE UPDATE OR DELETE ON "ContractAdjustment" FOR EACH ROW EXECUTE FUNCTION protect_contract_adjustment();
