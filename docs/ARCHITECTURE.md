# CWManagement Architecture

## Product boundary

CWManagement is the Cedar Winds operational system. QuickBooks Desktop remains the accounting ledger. The first release owns identity, people, projects, assignments, time capture/approval, operational dashboards, and audit history.

## Application structure

- Next.js 16 App Router provides the authenticated application and route handlers.
- React client modules power the mobile time clock and management workspace.
- PostgreSQL/Prisma is the source of truth. Mutations validate with Zod, authorize on the server, use transactions where multiple records change, and write audit events.
- `/api/[...route]` remains the compatibility boundary for the proven time module. New management handlers are grouped under `/api/management/*`; future phases should split these into domain route handlers as they grow.
- PWA assets and QR entry remain supported. Internet is required for authoritative time mutations.

## Domain boundaries

- Identity: `User`, `Session`, `ActionToken`, roles, and capability overrides.
- People: `Employee` is an employment profile; `Contact` and `Company` are business records. Authentication does not imply either.
- Projects: `Project` is the Prisma domain model. It maps to the existing `Jobsite` PostgreSQL table so mature time-history foreign keys remain safe while application code and product language use the correct domain name.
- Time: workdays and versioned segments reference the project record and cost/task dimensions. Exported segments stay immutable.
- Project operations: `ProjectTask`, `DailyLog`, and `StoredFile` are project-scoped aggregates with dedicated authorization and service functions.
- Audit/activity: meaningful actions publish through `publishProjectEvent`. `AuditLog` remains append-only and now carries project scope, a human-readable description, metadata, and useful before/after snapshots.
- Notifications: durable in-app notifications are created from useful domain actions. Assignment notifications are targeted; the event architecture can later fan out to email or push.
- Storage: business code depends on `StorageService`, never the Railway filesystem. Local disk is a development adapter only; production remains deliberately disabled until a durable object-storage adapter is configured.

## UI shell

Internal navigation is Dashboard, Leads, Projects, Schedule, Financials, Time, Contacts, Reports, Notifications, and Settings/admin. Project workspaces provide Overview, Schedule, Daily Logs, Files, Photos, Time, and Settings. Future financial/client modules remain honest placeholders.

## Authorization rule

Every protected read and mutation is checked server-side. UI hiding is convenience only. Project queries use all-project or assigned-project scope. Portal boundaries will use separate scoped query services rather than filtering internal responses in the browser.

## Project operations services

`operations.ts` is the application-service boundary for project assignments, contacts, schedule tasks/dependencies, daily logs, files, activity, and notifications. Mutations validate input, verify both capability and project scope, run compound changes transactionally, and publish one meaningful project event. File bytes use dedicated multipart/download route handlers because the JSON compatibility dispatcher is intentionally size-limited.

## Financial services

`financial.ts` is the server-authoritative boundary for cost-code administration/import, Decimal calculations, estimate/proposal revision snapshots, budget creation, actual costs, and job-cost aggregation. Browser totals are previews only. Project workspaces expose Estimate, Proposals, and Budget alongside operations.
