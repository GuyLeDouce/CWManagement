-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SHOP', 'SITE', 'OFFICE', 'PM', 'CONTROLLER', 'OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SegmentType" AS ENUM ('SHOP', 'SITE', 'OFFICE', 'TRAVEL');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('RECORDED', 'PENDING_PM_APPROVAL', 'PM_APPROVED', 'EXPORTED');

-- CreateEnum
CREATE TYPE "QrType" AS ENUM ('SHOP', 'TRUCK');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('RESET_PASSWORD', 'DESKTOP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "roles" "Role"[],
    "earliestStart" TEXT NOT NULL DEFAULT '07:00',
    "timezone" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeJobsite" (
    "userId" TEXT NOT NULL,
    "jobsiteId" TEXT NOT NULL,

    CONSTRAINT "EmployeeJobsite_pkey" PRIMARY KEY ("userId","jobsiteId")
);

-- CreateTable
CREATE TABLE "EmployeeTask" (
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,

    CONSTRAINT "EmployeeTask_pkey" PRIMARY KEY ("userId","taskId")
);

-- CreateTable
CREATE TABLE "PmEmployee" (
    "pmId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "PmEmployee_pkey" PRIMARY KEY ("pmId","employeeId")
);

-- CreateTable
CREATE TABLE "PmJobsite" (
    "pmId" TEXT NOT NULL,
    "jobsiteId" TEXT NOT NULL,

    CONSTRAINT "PmJobsite_pkey" PRIMARY KEY ("pmId","jobsiteId")
);

-- CreateTable
CREATE TABLE "Jobsite" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "address" TEXT,
    "overhead" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Jobsite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobsiteTask" (
    "jobsiteId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,

    CONSTRAINT "JobsiteTask_pkey" PRIMARY KEY ("jobsiteId","taskId")
);

-- CreateTable
CREATE TABLE "AccountingCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AccountingCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingMapping" (
    "id" TEXT NOT NULL,
    "jobsiteId" TEXT,
    "taskId" TEXT,
    "accountingCodeId" TEXT NOT NULL,

    CONSTRAINT "AccountingMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Truck" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "inferredJobsiteId" TEXT,
    "lastScanAt" TIMESTAMPTZ(3),

    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QrCode" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "QrType" NOT NULL,
    "token" TEXT NOT NULL,
    "truckId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "QrCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "originalStart" TIMESTAMPTZ(3) NOT NULL,
    "paidStart" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WorkDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSegment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDayId" TEXT NOT NULL,
    "type" "SegmentType" NOT NULL,
    "jobsiteId" TEXT NOT NULL,
    "taskId" TEXT,
    "truckId" TEXT,
    "travelOrigin" TEXT,
    "originalStart" TIMESTAMPTZ(3) NOT NULL,
    "originalEnd" TIMESTAMPTZ(3),
    "effectiveStart" TIMESTAMPTZ(3) NOT NULL,
    "end" TIMESTAMPTZ(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "accountingCodeId" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'RECORDED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TimeSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "segmentVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteVisit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobsiteId" TEXT NOT NULL,
    "start" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end" TIMESTAMPTZ(3),
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ActionToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetsAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunchReceipt" (
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PunchReceipt_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ExportBatch" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "csv" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "ExportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportItem" (
    "batchId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,

    CONSTRAINT "ExportItem_pkey" PRIMARY KEY ("batchId","segmentId")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'company',
    "timezone" TEXT NOT NULL DEFAULT 'America/Toronto',
    "reportRecipient" TEXT NOT NULL DEFAULT '',
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Jobsite_number_key" ON "Jobsite"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Task_name_key" ON "Task"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingCode_code_key" ON "AccountingCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Truck_name_key" ON "Truck"("name");

-- CreateIndex
CREATE UNIQUE INDEX "QrCode_token_key" ON "QrCode"("token");

-- CreateIndex
CREATE INDEX "WorkDay_userId_date_idx" ON "WorkDay"("userId", "date");

-- CreateIndex
CREATE INDEX "TimeSegment_userId_effectiveStart_idx" ON "TimeSegment"("userId", "effectiveStart");

-- CreateIndex
CREATE INDEX "TimeSegment_status_effectiveStart_idx" ON "TimeSegment"("status", "effectiveStart");

-- CreateIndex
CREATE INDEX "TimeSegment_jobsiteId_idx" ON "TimeSegment"("jobsiteId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ActionToken_tokenHash_key" ON "ActionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "EmployeeJobsite" ADD CONSTRAINT "EmployeeJobsite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeJobsite" ADD CONSTRAINT "EmployeeJobsite_jobsiteId_fkey" FOREIGN KEY ("jobsiteId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTask" ADD CONSTRAINT "EmployeeTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTask" ADD CONSTRAINT "EmployeeTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmEmployee" ADD CONSTRAINT "PmEmployee_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmEmployee" ADD CONSTRAINT "PmEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmJobsite" ADD CONSTRAINT "PmJobsite_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmJobsite" ADD CONSTRAINT "PmJobsite_jobsiteId_fkey" FOREIGN KEY ("jobsiteId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobsiteTask" ADD CONSTRAINT "JobsiteTask_jobsiteId_fkey" FOREIGN KEY ("jobsiteId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobsiteTask" ADD CONSTRAINT "JobsiteTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingMapping" ADD CONSTRAINT "AccountingMapping_jobsiteId_fkey" FOREIGN KEY ("jobsiteId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingMapping" ADD CONSTRAINT "AccountingMapping_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingMapping" ADD CONSTRAINT "AccountingMapping_accountingCodeId_fkey" FOREIGN KEY ("accountingCodeId") REFERENCES "AccountingCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_inferredJobsiteId_fkey" FOREIGN KEY ("inferredJobsiteId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDay" ADD CONSTRAINT "WorkDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSegment" ADD CONSTRAINT "TimeSegment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSegment" ADD CONSTRAINT "TimeSegment_workDayId_fkey" FOREIGN KEY ("workDayId") REFERENCES "WorkDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSegment" ADD CONSTRAINT "TimeSegment_jobsiteId_fkey" FOREIGN KEY ("jobsiteId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSegment" ADD CONSTRAINT "TimeSegment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSegment" ADD CONSTRAINT "TimeSegment_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSegment" ADD CONSTRAINT "TimeSegment_accountingCodeId_fkey" FOREIGN KEY ("accountingCodeId") REFERENCES "AccountingCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "TimeSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_jobsiteId_fkey" FOREIGN KEY ("jobsiteId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionToken" ADD CONSTRAINT "ActionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchReceipt" ADD CONSTRAINT "PunchReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportBatch" ADD CONSTRAINT "ExportBatch_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportItem" ADD CONSTRAINT "ExportItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ExportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportItem" ADD CONSTRAINT "ExportItem_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "TimeSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Business invariants also live in PostgreSQL, independent of the UI.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE UNIQUE INDEX "one_open_workday_per_employee" ON "WorkDay" ("userId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "one_open_segment_per_employee" ON "TimeSegment" ("userId") WHERE "end" IS NULL;
CREATE UNIQUE INDEX "one_active_visit_per_owner" ON "SiteVisit" ("userId") WHERE "end" IS NULL;
CREATE UNIQUE INDEX "accounting_mapping_unique_scope" ON "AccountingMapping" (COALESCE("jobsiteId", ''), COALESCE("taskId", ''));
ALTER TABLE "TimeSegment" ADD CONSTRAINT "nonnegative_segment" CHECK ("end" IS NULL OR "end" >= "effectiveStart");
ALTER TABLE "TimeSegment" ADD CONSTRAINT "required_labour_task" CHECK ("type" NOT IN ('SHOP','SITE') OR "taskId" IS NOT NULL);
ALTER TABLE "TimeSegment" ADD CONSTRAINT "no_task_on_travel_office" CHECK ("type" NOT IN ('TRAVEL','OFFICE') OR "taskId" IS NULL);
ALTER TABLE "TimeSegment" ADD CONSTRAINT "no_employee_time_overlap" EXCLUDE USING gist ("userId" WITH =, tstzrange("effectiveStart", "end", '[)') WITH &&);
ALTER TABLE "QrCode" ADD CONSTRAINT "qr_truck_identity" CHECK (("type" = 'SHOP' AND "truckId" IS NULL) OR ("type" = 'TRUCK' AND "truckId" IS NOT NULL));
ALTER TABLE "AccountingMapping" ADD CONSTRAINT "mapping_has_scope" CHECK ("jobsiteId" IS NOT NULL OR "taskId" IS NOT NULL);
ALTER TABLE "SiteVisit" ADD CONSTRAINT "nonnegative_visit" CHECK ("end" IS NULL OR "end" >= "start");
ALTER TABLE "User" ADD CONSTRAINT "valid_earliest_start" CHECK ("earliestStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
CREATE FUNCTION prevent_audit_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit entries are append-only'; END;
$$;
CREATE TRIGGER audit_is_append_only BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION prevent_audit_changes();
CREATE FUNCTION protect_time_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Historical time records cannot be deleted'; END IF;
 IF OLD."status" = 'EXPORTED' THEN RAISE EXCEPTION 'Exported records are immutable'; END IF;
 IF NEW."originalStart" IS DISTINCT FROM OLD."originalStart" OR (OLD."originalEnd" IS NOT NULL AND NEW."originalEnd" IS DISTINCT FROM OLD."originalEnd") THEN
   RAISE EXCEPTION 'Original timestamps are immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_time_history BEFORE UPDATE OR DELETE ON "TimeSegment" FOR EACH ROW EXECUTE FUNCTION protect_time_history();
CREATE FUNCTION enforce_segment_workday_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "WorkDay" WHERE "id"=NEW."workDayId" AND "userId"=NEW."userId") THEN RAISE EXCEPTION 'Segment employee must match workday employee'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER segment_workday_owner BEFORE INSERT OR UPDATE ON "TimeSegment" FOR EACH ROW EXECUTE FUNCTION enforce_segment_workday_owner();
