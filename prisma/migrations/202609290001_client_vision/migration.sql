ALTER TYPE "Capability" ADD VALUE 'CLIENT_PREVIEW';
CREATE TYPE "ClientTaxDisplayMode" AS ENUM ('FINAL_TOTAL_ONLY', 'SHOW_TAX_BREAKDOWN');
ALTER TABLE "Settings" ADD COLUMN "clientTaxDisplayMode" "ClientTaxDisplayMode" NOT NULL DEFAULT 'FINAL_TOTAL_ONLY', ADD COLUMN "clientFinancialSummaryEnabled" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "clientManagerVisible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Jobsite" ADD COLUMN "clientTaxDisplayMode" "ClientTaxDisplayMode", ADD COLUMN "clientFinancialSummaryEnabled" BOOLEAN, ADD COLUMN "clientManagerVisible" BOOLEAN;
