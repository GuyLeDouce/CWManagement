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
- Audit: important changes append `AuditLog` rows; database protections from the original app remain in force.

## UI shell

Internal navigation is Dashboard, Leads, Projects, Schedule, Financials, Time, Contacts, Reports, and Settings/admin. Project workspaces establish stable module navigation. Unbuilt modules display honest empty placeholders, never invented data.

## Authorization rule

Every protected read and mutation is checked server-side. UI hiding is convenience only. Project queries use all-project or assigned-project scope. Portal boundaries will use separate scoped query services rather than filtering internal responses in the browser.
