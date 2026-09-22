ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PROJECT_MANAGER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ESTIMATOR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DESIGNER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FIELD';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLIENT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUBTRADE';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'VENDOR';

CREATE TYPE "Capability" AS ENUM ('PROJECT_VIEW_ALL','PROJECT_VIEW_ASSIGNED','PROJECT_CREATE','PROJECT_EDIT','PROJECT_FINANCIALS_VIEW','PROJECT_FINANCIALS_EDIT','TIME_CLOCK','TIME_EDIT','TIME_APPROVE','CONTACT_MANAGE','ESTIMATE_CREATE','PURCHASE_ORDER_CREATE','CHANGE_ORDER_CREATE','CLIENT_PORTAL_ACCESS','ACCOUNTING_ACCESS','SETTINGS_MANAGE');
CREATE TYPE "ProjectStatus" AS ENUM ('LEAD','PRECONSTRUCTION','DESIGN','ESTIMATING','CONTRACT_PENDING','ACTIVE','ON_HOLD','SUBSTANTIALLY_COMPLETE','WARRANTY','COMPLETE','ARCHIVED');
CREATE TYPE "ProjectAssignmentRole" AS ENUM ('PRIMARY_PROJECT_MANAGER','SECONDARY_PROJECT_MANAGER','ESTIMATOR','DESIGNER','CONTROLLER','FIELD_STAFF','OTHER');
CREATE TYPE "ContactType" AS ENUM ('CLIENT','PROSPECT','SUBTRADE','VENDOR','CONSULTANT','ENGINEER','ARCHITECT','DESIGNER','OTHER');
CREATE TYPE "ProjectContactRole" AS ENUM ('CLIENT','ARCHITECT','ENGINEER','DESIGNER','CONSULTANT','SUBTRADE','VENDOR','OTHER');
CREATE TYPE "SyncDirection" AS ENUM ('IMPORT','EXPORT','BIDIRECTIONAL');
CREATE TYPE "SyncStatus" AS ENUM ('NOT_SYNCED','PENDING','SYNCED','ERROR','CONFLICT');

ALTER TABLE "Jobsite"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "projectType" TEXT,
  ADD COLUMN "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "stage" TEXT,
  ADD COLUMN "municipality" TEXT,
  ADD COLUMN "province" TEXT DEFAULT 'ON',
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "startDate" DATE,
  ADD COLUMN "targetCompletion" DATE,
  ADD COLUMN "actualCompletion" DATE,
  ADD COLUMN "contractAmount" DECIMAL(14,2),
  ADD COLUMN "internalNotes" TEXT,
  ADD COLUMN "clientVisibleNotes" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMPTZ(3),
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "Employee" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "employeeNumber" TEXT, "title" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true, "quickBooksListId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
CREATE UNIQUE INDEX "Employee_employeeNumber_key" ON "Employee"("employeeNumber");
CREATE UNIQUE INDEX "Employee_quickBooksListId_key" ON "Employee"("quickBooksListId");

CREATE TABLE "UserCapability" (
  "userId" TEXT NOT NULL, "capability" "Capability" NOT NULL, "granted" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "UserCapability_pkey" PRIMARY KEY ("userId","capability"),
  CONSTRAINT "UserCapability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Company" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "legalName" TEXT, "email" TEXT, "phone" TEXT, "website" TEXT,
  "address" TEXT, "municipality" TEXT, "province" TEXT, "postalCode" TEXT, "notes" TEXT, "quickBooksListId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");
CREATE UNIQUE INDEX "Company_quickBooksListId_key" ON "Company"("quickBooksListId");
CREATE TABLE "Contact" (
  "id" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL, "companyId" TEXT, "email" TEXT, "phone" TEXT,
  "address" TEXT, "municipality" TEXT, "province" TEXT, "postalCode" TEXT, "notes" TEXT,
  "types" "ContactType"[], "active" BOOLEAN NOT NULL DEFAULT true, "portalUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Contact_portalUserId_key" ON "Contact"("portalUserId");
CREATE INDEX "Contact_lastName_firstName_idx" ON "Contact"("lastName","firstName");
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");
CREATE TABLE "ProjectAssignment" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "userId" TEXT NOT NULL, "role" "ProjectAssignmentRole" NOT NULL,
  "primary" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProjectAssignment_projectId_userId_role_key" ON "ProjectAssignment"("projectId","userId","role");
CREATE INDEX "ProjectAssignment_userId_role_idx" ON "ProjectAssignment"("userId","role");
CREATE TABLE "ProjectContact" (
  "projectId" TEXT NOT NULL, "contactId" TEXT NOT NULL, "role" "ProjectContactRole" NOT NULL, "primary" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ProjectContact_pkey" PRIMARY KEY ("projectId","contactId","role"),
  CONSTRAINT "ProjectContact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProjectContact_contactId_idx" ON "ProjectContact"("contactId");
CREATE TABLE "AccountingSyncMapping" (
  "id" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, "quickBooksListId" TEXT, "quickBooksTxnId" TEXT,
  "direction" "SyncDirection" NOT NULL DEFAULT 'BIDIRECTIONAL', "status" "SyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
  "lastSyncedAt" TIMESTAMPTZ(3), "lastError" TEXT, "projectId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AccountingSyncMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingSyncMapping_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccountingSyncMapping_entityType_entityId_key" ON "AccountingSyncMapping"("entityType","entityId");
CREATE INDEX "AccountingSyncMapping_status_idx" ON "AccountingSyncMapping"("status");
