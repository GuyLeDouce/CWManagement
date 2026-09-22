ALTER TYPE "Capability" ADD VALUE IF NOT EXISTS 'PROJECT_ASSIGN';
ALTER TYPE "Capability" ADD VALUE IF NOT EXISTS 'PROJECT_CONTACT_MANAGE';
ALTER TYPE "Capability" ADD VALUE IF NOT EXISTS 'PROJECT_SCHEDULE_EDIT';
ALTER TYPE "Capability" ADD VALUE IF NOT EXISTS 'DAILY_LOG_CREATE';
ALTER TYPE "Capability" ADD VALUE IF NOT EXISTS 'DAILY_LOG_EDIT';
ALTER TYPE "Capability" ADD VALUE IF NOT EXISTS 'FILE_UPLOAD';
ALTER TYPE "Capability" ADD VALUE IF NOT EXISTS 'FILE_VIEW_INTERNAL';
ALTER TYPE "Capability" ADD VALUE IF NOT EXISTS 'NOTIFICATION_MANAGE';
ALTER TYPE "ProjectContactRole" ADD VALUE IF NOT EXISTS 'ELECTRICIAN';
ALTER TYPE "ProjectContactRole" ADD VALUE IF NOT EXISTS 'PLUMBER';
ALTER TYPE "ProjectContactRole" ADD VALUE IF NOT EXISTS 'SUPPLIER';
ALTER TYPE "ProjectContactRole" ADD VALUE IF NOT EXISTS 'SUBCONTRACTOR';

-- Align the Phase 1 physical Project table with Prisma's @updatedAt semantics.
ALTER TABLE "Jobsite" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TYPE "ProjectTaskStatus" AS ENUM ('NOT_STARTED','READY','IN_PROGRESS','BLOCKED','COMPLETE','CANCELLED');
CREATE TYPE "DependencyType" AS ENUM ('FINISH_TO_START','START_TO_START','FINISH_TO_FINISH','START_TO_FINISH');
CREATE TYPE "FileKind" AS ENUM ('DOCUMENT','PHOTO');
CREATE TYPE "FileCategory" AS ENUM ('DRAWING','PERMIT','CONTRACT','ENGINEERING','SITE_PHOTO','INVOICE','WARRANTY','SELECTION','DAILY_LOG','OTHER');
CREATE TYPE "FileVisibility" AS ENUM ('INTERNAL','CLIENT','TRADE');
CREATE TYPE "NotificationType" AS ENUM ('PROJECT_ASSIGNED','TASK_ASSIGNED','TASK_DUE','TIME_APPROVAL','PROJECT_STATUS','DAILY_LOG','GENERAL');
CREATE TYPE "CostCodeType" AS ENUM ('LABOUR','MATERIAL','SUBCONTRACT','EQUIPMENT','OTHER');

ALTER TABLE "AuditLog" ADD COLUMN "projectId" TEXT, ADD COLUMN "description" TEXT, ADD COLUMN "metadata" JSONB;
CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId","createdAt");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CostCode" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "parentId" TEXT,
  "type" "CostCodeType" NOT NULL DEFAULT 'OTHER', "active" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "quickBooksListId" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CostCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CostCode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CostCode_code_key" ON "CostCode"("code");
CREATE UNIQUE INDEX "CostCode_quickBooksListId_key" ON "CostCode"("quickBooksListId");
CREATE INDEX "CostCode_parentId_sortOrder_idx" ON "CostCode"("parentId","sortOrder");
ALTER TABLE "Task" ADD COLUMN "defaultCostCodeId" TEXT;
ALTER TABLE "Task" ADD CONSTRAINT "Task_defaultCostCodeId_fkey" FOREIGN KEY ("defaultCostCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimeSegment" ADD COLUMN "costCodeId" TEXT;
ALTER TABLE "TimeSegment" ADD CONSTRAINT "TimeSegment_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProjectTask" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "status" "ProjectTaskStatus" NOT NULL DEFAULT 'NOT_STARTED', "startDate" DATE, "endDate" DATE,
  "actualStartDate" DATE, "actualEndDate" DATE, "milestone" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdById" TEXT NOT NULL, "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "project_task_date_order" CHECK ("endDate" IS NULL OR "startDate" IS NULL OR "endDate" >= "startDate"),
  CONSTRAINT "project_task_actual_date_order" CHECK ("actualEndDate" IS NULL OR "actualStartDate" IS NULL OR "actualEndDate" >= "actualStartDate")
);
CREATE INDEX "ProjectTask_projectId_archivedAt_startDate_idx" ON "ProjectTask"("projectId","archivedAt","startDate");
CREATE INDEX "ProjectTask_status_endDate_idx" ON "ProjectTask"("status","endDate");

CREATE TABLE "ProjectTaskAssignee" (
  "id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "userId" TEXT, "contactId" TEXT,
  CONSTRAINT "ProjectTaskAssignee_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectTaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectTaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectTaskAssignee_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "project_task_assignee_exactly_one" CHECK (("userId" IS NOT NULL)::int + ("contactId" IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX "ProjectTaskAssignee_taskId_userId_key" ON "ProjectTaskAssignee"("taskId","userId");
CREATE UNIQUE INDEX "ProjectTaskAssignee_taskId_contactId_key" ON "ProjectTaskAssignee"("taskId","contactId");
CREATE INDEX "ProjectTaskAssignee_userId_idx" ON "ProjectTaskAssignee"("userId");
CREATE INDEX "ProjectTaskAssignee_contactId_idx" ON "ProjectTaskAssignee"("contactId");

CREATE TABLE "ProjectTaskDependency" (
  "predecessorId" TEXT NOT NULL, "successorId" TEXT NOT NULL, "type" "DependencyType" NOT NULL DEFAULT 'FINISH_TO_START', "lagDays" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProjectTaskDependency_pkey" PRIMARY KEY ("predecessorId","successorId"),
  CONSTRAINT "ProjectTaskDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectTaskDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_task_no_self_dependency" CHECK ("predecessorId" <> "successorId")
);
CREATE INDEX "ProjectTaskDependency_successorId_idx" ON "ProjectTaskDependency"("successorId");

CREATE TABLE "DailyLog" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "date" DATE NOT NULL, "authorId" TEXT NOT NULL,
  "workCompleted" TEXT, "siteConditions" TEXT, "weatherNotes" TEXT, "manpowerNotes" TEXT, "delaysIssues" TEXT,
  "deliveries" TEXT, "visitors" TEXT, "inspections" TEXT, "generalNotes" TEXT, "clientVisible" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DailyLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DailyLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DailyLog_projectId_date_authorId_key" ON "DailyLog"("projectId","date","authorId");
CREATE INDEX "DailyLog_projectId_date_idx" ON "DailyLog"("projectId","date");

CREATE TABLE "StoredFile" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "uploaderId" TEXT NOT NULL, "dailyLogId" TEXT,
  "kind" "FileKind" NOT NULL, "category" "FileCategory" NOT NULL DEFAULT 'OTHER', "visibility" "FileVisibility" NOT NULL DEFAULT 'INTERNAL',
  "filename" TEXT NOT NULL, "originalFilename" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "size" BIGINT NOT NULL, "storageKey" TEXT NOT NULL,
  "description" TEXT, "caption" TEXT, "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "archivedAt" TIMESTAMPTZ(3),
  CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoredFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StoredFile_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StoredFile_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "stored_file_nonnegative_size" CHECK ("size" >= 0)
);
CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");
CREATE INDEX "StoredFile_projectId_kind_uploadedAt_idx" ON "StoredFile"("projectId","kind","uploadedAt");
CREATE INDEX "StoredFile_dailyLogId_idx" ON "StoredFile"("dailyLogId");

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "projectId" TEXT, "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL, "message" TEXT NOT NULL, "actionUrl" TEXT, "entityType" TEXT, "entityId" TEXT,
  "readAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Jobsite"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId","readAt","createdAt");
CREATE INDEX "Notification_projectId_idx" ON "Notification"("projectId");
