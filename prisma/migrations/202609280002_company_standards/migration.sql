-- CreateEnum
CREATE TYPE "CompanyTemplateKind" AS ENUM ('PROJECT', 'ESTIMATE', 'SCHEDULE', 'SELECTION', 'PROPOSAL', 'SCOPE', 'ASSEMBLY', 'DAILY_LOG', 'COMMUNICATION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Capability" ADD VALUE 'TEMPLATE_VIEW';
ALTER TYPE "Capability" ADD VALUE 'TEMPLATE_MANAGE';
ALTER TYPE "Capability" ADD VALUE 'COST_CATALOG_VIEW';
ALTER TYPE "Capability" ADD VALUE 'COST_CATALOG_MANAGE';

-- AlterTable
ALTER TABLE "Jobsite" ADD COLUMN     "setupDefaults" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "defaultMarkupMethod" "MarkupMethod" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "defaultMarkupValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "defaultProvince" TEXT NOT NULL DEFAULT 'ON';

-- CreateTable
CREATE TABLE "CompanyTemplate" (
    "id" TEXT NOT NULL,
    "kind" "CompanyTemplateKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CompanyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateApplication" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "TemplateApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCatalogItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "costCodeId" TEXT NOT NULL,
    "costType" "CostCodeType" NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "markupMethod" "MarkupMethod" NOT NULL DEFAULT 'NONE',
    "markupValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "vendorContactId" TEXT,
    "category" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyTemplate_kind_active_name_idx" ON "CompanyTemplate"("kind", "active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateApplication_requestKey_key" ON "TemplateApplication"("requestKey");

-- CreateIndex
CREATE INDEX "TemplateApplication_projectId_createdAt_idx" ON "TemplateApplication"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "CostCatalogItem_active_category_name_idx" ON "CostCatalogItem"("active", "category", "name");

-- AddForeignKey
ALTER TABLE "TemplateApplication" ADD CONSTRAINT "TemplateApplication_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CompanyTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateApplication" ADD CONSTRAINT "TemplateApplication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCatalogItem" ADD CONSTRAINT "CostCatalogItem_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
