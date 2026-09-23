-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'READY', 'SENT', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MarkupMethod" AS ENUM ('NONE', 'PERCENT_ON_COST', 'FIXED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "BudgetVersionType" AS ENUM ('ORIGINAL', 'CURRENT', 'REFORECAST', 'CHANGE_ORDER');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('DRAFT', 'COMMITTED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialSourceType" AS ENUM ('MANUAL', 'PURCHASE_ORDER', 'SUBCONTRACT', 'VENDOR_COMMITMENT', 'TIME', 'QUICKBOOKS_BILL', 'QUICKBOOKS_CREDIT_CARD', 'QUICKBOOKS_CHEQUE', 'QUICKBOOKS_PAYROLL', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Capability" ADD VALUE 'COST_CODE_VIEW';
ALTER TYPE "Capability" ADD VALUE 'COST_CODE_MANAGE';
ALTER TYPE "Capability" ADD VALUE 'ESTIMATE_VIEW';
ALTER TYPE "Capability" ADD VALUE 'ESTIMATE_EDIT';
ALTER TYPE "Capability" ADD VALUE 'ESTIMATE_APPROVE_INTERNAL';
ALTER TYPE "Capability" ADD VALUE 'PROPOSAL_VIEW';
ALTER TYPE "Capability" ADD VALUE 'PROPOSAL_CREATE';
ALTER TYPE "Capability" ADD VALUE 'PROPOSAL_ISSUE';
ALTER TYPE "Capability" ADD VALUE 'PROPOSAL_ACCEPT';
ALTER TYPE "Capability" ADD VALUE 'BUDGET_VIEW';
ALTER TYPE "Capability" ADD VALUE 'BUDGET_EDIT';
ALTER TYPE "Capability" ADD VALUE 'JOB_COST_VIEW';
ALTER TYPE "Capability" ADD VALUE 'ACTUAL_COST_VIEW';
ALTER TYPE "Capability" ADD VALUE 'ACTUAL_COST_MANAGE';
ALTER TYPE "Capability" ADD VALUE 'FINANCIAL_MARGIN_VIEW';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "companyAddress" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "estimatePrefix" TEXT NOT NULL DEFAULT 'EST',
ADD COLUMN     "legalName" TEXT NOT NULL DEFAULT 'Cedar Winds Design~Build',
ADD COLUMN     "nextEstimateNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nextProposalNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "proposalPrefix" TEXT NOT NULL DEFAULT 'P',
ADD COLUMN     "proposalTerms" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "taxRate" DECIMAL(7,6) NOT NULL DEFAULT 0.13;

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateRevision" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "validUntil" DATE,
    "notes" TEXT,
    "internalNotes" TEXT,
    "taxRate" DECIMAL(7,6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EstimateRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateSection" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "showSubtotal" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EstimateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLine" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "sectionId" TEXT,
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
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "allowance" BOOLEAN NOT NULL DEFAULT false,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "internalNotes" TEXT,

    CONSTRAINT "EstimateLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "proposalNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalRevision" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "estimateRevisionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "issueDate" DATE,
    "expiryDate" DATE,
    "introduction" TEXT,
    "scope" TEXT,
    "exclusions" TEXT,
    "assumptions" TEXT,
    "terms" TEXT,
    "clientId" TEXT,
    "clientNameSnapshot" TEXT NOT NULL,
    "projectNameSnapshot" TEXT NOT NULL,
    "projectNumberSnapshot" TEXT NOT NULL,
    "companySnapshot" JSONB NOT NULL,
    "sectionsSnapshot" JSONB NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "taxRate" DECIMAL(7,6) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "acceptedById" TEXT,
    "acceptedByName" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProposalRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateRevisionId" TEXT,
    "proposalRevisionId" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetVersion" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "type" "BudgetVersionType" NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "budgetVersionId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "costCodeSnapshot" TEXT NOT NULL,
    "costCodeNameSnapshot" TEXT NOT NULL,
    "costType" "CostCodeType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorContactId" TEXT,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType" "FinancialSourceType" NOT NULL,
    "sourceId" TEXT,
    "reference" TEXT,
    "description" TEXT,
    "committedDate" DATE,
    "externalSystem" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitmentLine" (
    "id" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "costType" "CostCodeType" NOT NULL,
    "description" TEXT NOT NULL,
    "committedAmount" DECIMAL(18,2) NOT NULL,
    "consumedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "CommitmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActualCost" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "costType" "CostCodeType" NOT NULL,
    "commitmentLineId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "transactionDate" DATE NOT NULL,
    "sourceType" "FinancialSourceType" NOT NULL,
    "sourceExternalId" TEXT,
    "externalSystem" TEXT,
    "quickBooksTxnId" TEXT,
    "quickBooksEditSequence" TEXT,
    "vendorContactId" TEXT,
    "employeeId" TEXT,
    "description" TEXT NOT NULL,
    "createdById" TEXT,
    "reversedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActualCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastAdjustment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "costType" "CostCodeType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Estimate_projectId_updatedAt_idx" ON "Estimate"("projectId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_projectId_estimateNumber_key" ON "Estimate"("projectId", "estimateNumber");

-- CreateIndex
CREATE INDEX "EstimateRevision_estimateId_status_idx" ON "EstimateRevision"("estimateId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateRevision_estimateId_revision_key" ON "EstimateRevision"("estimateId", "revision");

-- CreateIndex
CREATE INDEX "EstimateSection_revisionId_sortOrder_idx" ON "EstimateSection"("revisionId", "sortOrder");

-- CreateIndex
CREATE INDEX "EstimateLine_revisionId_sortOrder_idx" ON "EstimateLine"("revisionId", "sortOrder");

-- CreateIndex
CREATE INDEX "EstimateLine_costCodeId_costType_idx" ON "EstimateLine"("costCodeId", "costType");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_projectId_proposalNumber_key" ON "Proposal"("projectId", "proposalNumber");

-- CreateIndex
CREATE INDEX "ProposalRevision_estimateRevisionId_idx" ON "ProposalRevision"("estimateRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalRevision_proposalId_revision_key" ON "ProposalRevision"("proposalId", "revision");

-- CreateIndex
CREATE INDEX "Budget_projectId_active_idx" ON "Budget"("projectId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetVersion_budgetId_version_key" ON "BudgetVersion"("budgetId", "version");

-- CreateIndex
CREATE INDEX "BudgetLine_budgetVersionId_idx" ON "BudgetLine"("budgetVersionId");

-- CreateIndex
CREATE INDEX "BudgetLine_costCodeId_costType_idx" ON "BudgetLine"("costCodeId", "costType");

-- CreateIndex
CREATE INDEX "Commitment_projectId_status_idx" ON "Commitment"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Commitment_externalSystem_externalId_key" ON "Commitment"("externalSystem", "externalId");

-- CreateIndex
CREATE INDEX "CommitmentLine_costCodeId_costType_idx" ON "CommitmentLine"("costCodeId", "costType");

-- CreateIndex
CREATE INDEX "ActualCost_projectId_transactionDate_idx" ON "ActualCost"("projectId", "transactionDate");

-- CreateIndex
CREATE INDEX "ActualCost_costCodeId_costType_idx" ON "ActualCost"("costCodeId", "costType");

-- CreateIndex
CREATE INDEX "ActualCost_quickBooksTxnId_idx" ON "ActualCost"("quickBooksTxnId");

-- CreateIndex
CREATE UNIQUE INDEX "ActualCost_externalSystem_sourceExternalId_key" ON "ActualCost"("externalSystem", "sourceExternalId");

-- CreateIndex
CREATE INDEX "ForecastAdjustment_projectId_costCodeId_costType_idx" ON "ForecastAdjustment"("projectId", "costCodeId", "costType");

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateRevision" ADD CONSTRAINT "EstimateRevision_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateRevision" ADD CONSTRAINT "EstimateRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateSection" ADD CONSTRAINT "EstimateSection_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "EstimateRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "EstimateRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "EstimateSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRevision" ADD CONSTRAINT "ProposalRevision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRevision" ADD CONSTRAINT "ProposalRevision_estimateRevisionId_fkey" FOREIGN KEY ("estimateRevisionId") REFERENCES "EstimateRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRevision" ADD CONSTRAINT "ProposalRevision_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRevision" ADD CONSTRAINT "ProposalRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRevision" ADD CONSTRAINT "ProposalRevision_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_estimateRevisionId_fkey" FOREIGN KEY ("estimateRevisionId") REFERENCES "EstimateRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_proposalRevisionId_fkey" FOREIGN KEY ("proposalRevisionId") REFERENCES "ProposalRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetVersion" ADD CONSTRAINT "BudgetVersion_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetVersion" ADD CONSTRAINT "BudgetVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetVersionId_fkey" FOREIGN KEY ("budgetVersionId") REFERENCES "BudgetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_vendorContactId_fkey" FOREIGN KEY ("vendorContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentLine" ADD CONSTRAINT "CommitmentLine_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentLine" ADD CONSTRAINT "CommitmentLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualCost" ADD CONSTRAINT "ActualCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualCost" ADD CONSTRAINT "ActualCost_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualCost" ADD CONSTRAINT "ActualCost_commitmentLineId_fkey" FOREIGN KEY ("commitmentLineId") REFERENCES "CommitmentLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualCost" ADD CONSTRAINT "ActualCost_vendorContactId_fkey" FOREIGN KEY ("vendorContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualCost" ADD CONSTRAINT "ActualCost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastAdjustment" ADD CONSTRAINT "ForecastAdjustment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastAdjustment" ADD CONSTRAINT "ForecastAdjustment_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastAdjustment" ADD CONSTRAINT "ForecastAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial invariants are enforced below the application layer as well.
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_taxRate_check" CHECK ("taxRate" >= 0 AND "taxRate" <= 1);
ALTER TABLE "EstimateRevision" ADD CONSTRAINT "EstimateRevision_taxRate_check" CHECK ("taxRate" >= 0 AND "taxRate" <= 1);
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_values_check" CHECK ("quantity" >= 0 AND "unitCost" >= 0 AND "markupValue" >= 0);
ALTER TABLE "ProposalRevision" ADD CONSTRAINT "ProposalRevision_totals_check" CHECK ("subtotal" >= 0 AND "taxAmount" >= 0 AND "total" = "subtotal" + "taxAmount");
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "CommitmentLine" ADD CONSTRAINT "CommitmentLine_consumption_check" CHECK ("committedAmount" >= 0 AND "consumedAmount" >= 0 AND "consumedAmount" <= "committedAmount");
