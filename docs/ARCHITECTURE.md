# CWManagement Architecture

## Product boundary

CWManagement is the Cedar Winds operational system. QuickBooks Desktop remains the accounting ledger. The application owns identity, people, projects, assignments, time capture/approval, operational dashboards, estimating/proposals, purchasing, change orders, job-cost context, and audit history.

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

Internal navigation is Dashboard, Leads, Projects, Schedule, Financials, Time, Contacts, Reports, Notifications, and Settings/admin. Project workspaces provide Overview, Schedule, Daily Logs, Files, Photos, Time, and Settings. Estimate, Proposals, Budget, Purchase Orders/Work Orders and Change Orders are implemented; client modules remain deferred.

## Authorization rule

Every protected read and mutation is checked server-side. UI hiding is convenience only. Project queries use all-project or assigned-project scope. Portal boundaries will use separate scoped query services rather than filtering internal responses in the browser.

## Project operations services

`operations.ts` is the application-service boundary for project assignments, contacts, schedule tasks/dependencies, daily logs, files, activity, and notifications. Mutations validate input, verify both capability and project scope, run compound changes transactionally, and publish one meaningful project event. File bytes use dedicated multipart/download route handlers because the JSON compatibility dispatcher is intentionally size-limited.

## Financial services

`financial.ts` is the server-authoritative boundary for cost-code administration/import, Decimal calculations, estimate/proposal revision snapshots, budget creation, actual costs, and job-cost aggregation. Estimate screens use server-calculated totals. Project workspaces expose Estimate, Proposals, and Budget alongside operations.

## Phase 4 services

`purchasing.ts` owns shared PO/WO families, revisions and issuance into the existing Commitment ledger. `change-orders.ts` owns client change revisions and atomic acceptance into ContractAdjustment and BudgetVersion. `commitments.ts` owns consumption, reconciliation, reversal, and fulfillment states. Shared `financial-math.ts` preserves Phase 3 Decimal rules. `financial-documents.ts` handles numbering, identity snapshots, validated references and event-triggered notifications. `financial-api.ts` groups `/api/financial/operations/*` behind the existing authenticated dispatcher and origin/rate-limit protections.

Generic project/activity responses omit audit before/after payloads; nonfinancial project readers do not receive contract amounts. All new document access uses capabilities plus project scope. Print snapshots omit internal notes and client margins. Client/vendor authentication, selections, payroll and synchronization are not implemented.
