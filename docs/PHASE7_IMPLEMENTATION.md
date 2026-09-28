# Phase 7 implementation report

Historical Phase 7 report. Current Phase 7.5 controls and changed limits are documented in [QUICKBOOKS_PILOT.md](QUICKBOOKS_PILOT.md). Phase 7 was committed as `2bda56a`; this report's original local-state and test counts describe that earlier implementation run.

This report describes the implemented, restricted software scope. **Live QuickBooks validation is pending.** Taxable PO export and several accounting edge cases remain blocked or require Controller handling as listed below; this is not an unconditional production-readiness claim.

## Local repository state reviewed

Local HEAD was `13b82df` (Phase 5), with the completed Phase 6 working tree present locally. Those changes were preserved; remote GitHub state was not used as the baseline. Reviewed source-of-truth docs, schema/migrations, financial and time services, permissions, authentication, dispatcher, deployment and tests. Before Phase 7 edits: lint, typecheck, 75 unit tests, 67 integration tests and production build passed. No commit or push has been made for this phase.

## Phase 6 architecture detected

Contact/Company identities, explicit separate client/trade grants and projections, immutable purchasing revisions/receipts, scoped files/messages, internal capabilities, event notifications and normalized financial ledgers were retained. No portal receives QuickBooks administration data.

## QuickBooks integration architecture

Dedicated `src/lib/quickbooks/` boundary. QuickBooks owns GL/AP/AR/payroll/accounting; CW owns project operations, approved source documents/time and normalized job-cost reporting. No second ledger, QBO OAuth or Windows agent was introduced.

## Web Connector SOAP implementation

Dedicated `/api/quickbooks/web-connector` SOAP 1.1 route implements the eight standard callbacks with protocol-sensitive names/parameters. Bounded XML parsing rejects DTD/entity declarations and malformed input; responses use an XML builder. Browser JSON dispatch remains separate.

## QWC generation

Authenticated `/api/quickbooks/qwc?id=…` generates stable GUIDs, QBFS type, username, configured interval and APP_URL-derived endpoints. Production HTTPS is mandatory. No password is included. Public `/quickbooks/setup` provides installation guidance.

## Authentication/security

Copy-once random password, scrypt storage, rate-limited dedicated authentication, hashed 30-minute tickets and deliberate rotation. Browser session cookies cannot authenticate connector operations. Safe errors omit submitted passwords and raw accounting payloads.

## Sync-session architecture

Persistent runs/sessions, one active session per connection, serializable transactions/advisory locks and immutable persisted request evidence. Expired/interrupted writes are quarantined; they are not automatically replayed.

## Sync queue

Deterministic unique keys for source writes. PENDING, IN_PROGRESS, SUCCEEDED, BLOCKED, FAILED, RECONCILIATION_REQUIRED and CANCELLED distinguish operational states. Queue buttons wait for the next PC-initiated connector run.

## qbXML modules

`xml.ts`, `soap.ts`, `qwc.ts`, `requests.ts`, `queue.ts`, `engine.ts`, `mapping.ts`, `bills.ts`, `reconciliation.ts`, `state.ts`, `admin.ts`. Version 13.0 is the supported floor/request version. `fast-xml-parser` is pinned to 5.11.1.

## Company-file validation

CompanyQuery precedes transaction work. Explicit operator binding uses observed name/legal name/path identity. Unexpected changes latch COMPANY_MISMATCH; original identity must be observed and explicitly reconfirmed. Identical copied-file metadata still requires operational verification.

## Discovery sync

Company, Customer/Job, Vendor, Employee, Item and Account queries populate minimal mapping candidates. No source transaction is exported merely because it exists. Inactive/missing mapped list records become conflicts.

## Customer/Job mapping

Project ↔ Customer ListID, with explicit optional parent Customer on queued creation. No inferred name matching.

## Vendor mapping

Existing Contact/Company ↔ Vendor ListID. PO uses a Contact mapping or its Company fallback. Explicit Contact-based Vendor creation is available; unrelated portal fields are omitted.

## Employee mapping

Internal User ↔ existing Employee ListID. No employee creation or payroll/wage import.

## CostCode/Item mapping

CostCode ↔ Item ListID/subtype; time requires Service Item. Optional Account ↔ CostCode supports expense lines. Legacy AccountingCode/AccountingMapping CSV workflows remain intact and are not silently converted.

## Purchase Order synchronization

Current issued zero-tax POs export through PurchaseOrderAdd after all mappings validate. Existing document families use reviewed PurchaseOrderMod with TxnID, checked EditSequence and retained line IDs. External changes require review. Taxable POs remain blocked pending Canadian tax-code support. No internal issued record is rewritten.

## Work Order policy

Work Orders remain CW-only commitments. They are not automatically duplicated as QuickBooks POs.

## Approved Time synchronization

Closed, current-version-approved time exports once through TimeTrackingAdd. WorkDay timezone determines date; duration rounds once to nearest minute. A source-version trigger and correction notifications identify changed synchronized time; automatic TimeTrackingMod is not enabled.

## Bill/ActualCost import

Explicit historical start date, incremental modified-time overlap and iterator paging. Mapped project Item/Expense lines become existing ActualCost rows; overhead is excluded. BillMirror is staging evidence only.

## Commitment reconciliation

Known PO TxnID plus one matching classification, or reviewed explicit allocation, feeds existing commitment consumption. Ambiguity is flagged. $25,000 commitment and $10,000 actual leave $15,000 remaining; report exposure is not $35,000.

## Modified transaction reconciliation

Changed Bills preflight the full transaction, reverse prior active actuals/consumption and apply replacement lines atomically. Removed lines reverse correctly; repeated content is idempotent. Overages/unmapped lines preserve prior financial state. Deleted-Bill automation is not implemented.

## Retry/error handling

Missing mappings BLOCK before sending. Rejected QuickBooks requests use safe explanations; bounded busy-record retries/backoff. Stale sequences require new review. Uncertain PO/time writes can be adopted only through an exact transaction query; no automatic uncertain Add resend.

## Reconciliation Centre

Blocked/failed jobs, reviewed PO changes, uncertain-write verification, staged Bill rechecks, mapping conflicts and auditable resolution notes. Resolution notes never override financial state. Existing project ActualCost reconciliation handles unlinked actuals.

## Sync Dashboard

Financials → QuickBooks and Settings → QuickBooks show company/mode, last contact/callback/authentication, run history, mapping filters, queue and issues, plus copyable safe diagnostics. Health is based on real contact timing, not the presence of configuration.

## Capabilities/security

Five QUICKBOOKS capabilities are bundled for OWNER/CONTROLLER only. Existing internal overrides and external-role denial remain enforced server-side. Bill application additionally checks existing actual-cost/project permissions.

## Notifications

Actionable issues create deduplicated in-app notices for accounting viewers. Normal time corrections notify on synchronization conflict. No success-per-record notifications or notification creation on page reads. Scheduled stale-connector reminders remain future automation.

## Audit logging

Configuration/rotation, QWC download, mapping changes, queue/retry, completed requests, import/reconciliation and issue resolutions are recorded without secrets. Project activity receives a safe actual-cost update description.

## Prisma/schema changes

Eight QuickBooks models, QuickBooksMode/QuickBooksJobStatus, five capabilities, and connection-scoped extensions to AccountingSyncMapping. Existing financial tables remain the ledger. Unique keys, foreign keys, interval/attempt checks, request immutability and synchronized-time conflict trigger are included.

## Migrations created

`prisma/migrations/202609240004_quickbooks_desktop/migration.sql`; all eight repository migrations applied successfully to isolated PostgreSQL `cwmanagement_phase7_test`. Existing Phase 6 migration was preserved.

## Tests added

Six unit protocol/XML/QWC tests; fourteen PostgreSQL workflows covering SOAP transport, discovery, authentication/tickets, external authorization, company mismatch, concurrent queue/send, restart/response replay, uncertain-write adoption, PO Add/reviewed Mod, approved time/version conflict, Bill consumption/modification/overage, removed/multi-project lines and unmapped-line safety. One browser setup/QWC/fixture-SOAP/company-binding/discovery workflow. Added `npm run test:quickbooks`; unit/integration scripts include the new suites.

## Documentation created/updated

Created QUICKBOOKS_DESKTOP, QUICKBOOKS_MAPPING, QUICKBOOKS_TROUBLESHOOTING, QUICKBOOKS_LIVE_VALIDATION and this report. Updated ARCHITECTURE, DATABASE, ACCOUNTING, PERMISSIONS, ROADMAP, JOB_COSTING and README. Roadmap explicitly separates documented software scope from live validation.

## Validation results

| Check | Actual result |
|---|---|
| `npx prisma format` | Passed |
| `npx prisma validate` | Passed with isolated DATABASE_URL configured |
| `npx prisma generate` | Passed |
| Migrations | All eight applied to fresh isolated PostgreSQL; subsequent deploy reported no pending migrations |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 81 passed |
| `npm run test:integration` | 81 passed, including existing client/trade suites |
| `npm run test:quickbooks` | 20 passed (6 unit + 14 protocol/database workflows) |
| `npm run test:e2e` | 11 Chromium workflows passed |
| `npm run build` | Passed; production routes generated successfully |

Initial validation retries encountered an unset shell DATABASE_URL and a Windows Prisma DLL held by the completed Playwright development server. After configuring the isolated database and stopping the verified test-server process tree, validation/generation/build passed. Browser assertions passed; Windows server teardown required manual process cleanup. Prisma's existing package.json configuration deprecation warning remains; no Prisma major-version migration was attempted.

## New environment variables

None. Existing names used: APP_URL, APP_SECRET, DATABASE_URL.

## Railway deployment notes

Back up/stage and apply existing predeploy migrations. Keep HTTPS APP_URL and durable PostgreSQL. Node standalone deployment remains unchanged. The PC initiates outbound HTTPS; no inbound PC access or port forwarding is required. Do not activate live accounting writes before Controller validation.

## QuickBooks PC setup requirements

Compatible Desktop/Web Connector installation, intended company-file authorization, QWC import, separately entered generated password and an operator-controlled update interval. Test with a backup/staging company first.

## Live-validation steps

Follow [QUICKBOOKS_LIVE_VALIDATION.md](QUICKBOOKS_LIVE_VALIDATION.md): backup, install/connect, verify company, discover/map one test set, export one PO/time entry, import/modify a small Bill, confirm consumption/idempotency/errors, then obtain Controller sign-off. No live QuickBooks company was contacted during implementation.

## Known limitations

- Canadian taxable PO export is blocked pending explicit tax-code mapping and live validation.
- Grouped, tax-inclusive, foreign-currency and negative Bills require review; cheque/card/Vendor Credit/payroll imports are not enabled.
- Deleted Bills absent from queries are not automatically reversed. Returned removed/zeroed lines are handled.
- PO cancellation after synchronization and corrected exported time require Controller accounting-side reconciliation.
- List discovery is bounded by XML size but not iterator-paged; very large lists need pagination follow-up. Bill queries are paged.
- Session/request audit retention, scheduled health notifications and larger dashboard pagination need operational hardening.
- Company-file identity is conservative metadata binding, not a cryptographic fingerprint of the accounting file.
- Live QuickBooks edition, Canadian tax and payroll-preference compatibility remain unvalidated.

## Recommended Phase 8

First close the accounting restrictions/live-validation items. Then build portfolio reports from normalized Budget/Commitment/ActualCost; management action dashboards; warranty/service requests reusing portal grants/files/messages; durable scheduled reminders; explicit workflow automation; observability/retention/backup recovery hardening; and audited CoConstruct import, reconciliation and retirement tools.
