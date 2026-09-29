# CWManagement Architecture

QuickBooks Phase 7.5 uses the existing service/queue/ledger boundaries with `pilot.ts` for mode/allowlist/activation enforcement and `diagnostics.ts` for authorized previews/pre-flight/run details. See [controlled pilot](QUICKBOOKS_PILOT.md). No Phase 8 architecture has been introduced.

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

Internal navigation includes management and the retained Time module. Project workspaces expose operations, financials, purchasing, Selections, Clients and Messages. The separate /client experience exposes only deliberately published project content.

## Authorization rule

Every protected read and mutation is checked server-side. UI hiding is convenience only. Internal queries use all-project or assigned-project scope. Client services require explicit ClientProjectAccess and separate allowlisted DTOs, never internal responses filtered in React.

## Project operations services

`operations.ts` is the application-service boundary for project assignments, contacts, schedule tasks/dependencies, daily logs, files, activity, and notifications. Mutations validate input, verify both capability and project scope, run compound changes transactionally, and publish one meaningful project event. File bytes use dedicated multipart/download route handlers because the JSON compatibility dispatcher is intentionally size-limited.

## Financial services

`financial.ts` is the server-authoritative boundary for cost-code administration/import, Decimal calculations, estimate/proposal revision snapshots, budget creation, actual costs, and job-cost aggregation. Estimate screens use server-calculated totals. Project workspaces expose Estimate, Proposals, and Budget alongside operations.

## Phase 4 services

`purchasing.ts` owns shared PO/WO families, revisions and issuance into the existing Commitment ledger. `change-orders.ts` owns client change revisions and atomic acceptance into ContractAdjustment and BudgetVersion. `commitments.ts` owns consumption, reconciliation, reversal, and fulfillment states. Shared `financial-math.ts` preserves Phase 3 Decimal rules. `financial-documents.ts` handles numbering, identity snapshots, validated references and event-triggered notifications. `financial-api.ts` groups `/api/financial/operations/*` behind the existing authenticated dispatcher and origin/rate-limit protections.

Generic project/activity responses omit audit before/after payloads; nonfinancial project readers do not receive contract amounts. Internal document access uses capabilities plus project scope. Print snapshots omit internal notes and client margins. Phase 6 adds vendor authentication; Phase 7/7.5 adds internal QuickBooks synchronization. Payroll calculation remains deferred.

## Phase 5 services

client-access.ts owns grants and invitations using existing sessions/tokens. client-projections.ts defines client DTOs. selections.ts owns allowances, options, publication and immutable decisions; nonzero variance creates a draft in the existing CO domain. client-approvals.ts calls the same atomic acceptance function as internal acceptance. client-messages.ts owns audience-scoped threads/read states. client-api.ts dispatches portal and management actions behind origin/rate-limit checks. client-notices.ts creates transactional inbox records and sends best-effort email after commit.

CLIENT cannot inherit internal capabilities through mixed roles or overrides; the dispatcher blocks legacy internal endpoints. StoredFile downloads recheck client grants and visibility. Database triggers protect approval evidence, confirmed selections and published options. See CLIENT_PORTAL.md, SELECTIONS.md and CLIENT_COMMUNICATION.md.

## Phase 6 services

trade-access.ts owns explicit TradeProjectAccess and record scopes; trade-projections.ts defines the independent allowlisted DTO boundary. trade-workflows.ts owns receipt evidence, schedule responses, instructions and deficiencies. trade-messages.ts reuses audience-scoped messaging with exact trade Contact identity. trade-uploads.ts uses existing protected storage and content validation. trade-api.ts dispatches external trade and internal management routes. External identities have no internal capability escape through mixed roles or overrides. No new financial ledger is introduced. See TRADE_PORTAL.md, SITE_INSTRUCTIONS.md and DEFICIENCIES.md.

## Phase 7 QuickBooks boundary

`src/lib/quickbooks/` isolates SOAP/XML, QWC, configuration/mapping, persistent engine, request construction and reconciliation from financial.ts. The SOAP route uses independent connector credentials/tickets. Browser accounting administration requires explicit capabilities; client/trade DTOs never include accounting configuration. PostgreSQL owns connector state and existing ActualCost/Commitment tables remain reporting truth. See [QuickBooks Desktop](QUICKBOOKS_DESKTOP.md).

## Productization — company standards

`standards-schema.ts` defines bounded, typed template content and Decimal assembly/relative-date rules. `standards.ts` owns the library, catalog, preview imports and atomic copying into existing records. `project-setup.ts` owns the guided setup/selective-copy transaction; `productivity.ts` supplies scoped search/work queues and schedule bulk actions. `specifications.ts` separates information-only specifications from client decisions. `/api/standards/*` remains behind the internal identity, capability, origin and rate-limit boundaries. No template has financial effect until ordinary document approval/issue workflows run. See [Templates](TEMPLATES.md) and [Product UX](PRODUCT_UX.md).

## In-app operating manual

Version-controlled `src/lib/help` articles power internal `/how-to` and separate `/client/help` and `/trade/help` surfaces. Existing server identity guards remain authoritative; external help imports only external article content and no project loaders. The shared renderer provides local search, capability-aware action links and print layouts. No database changes. See [Help content](HELP_CONTENT.md).
