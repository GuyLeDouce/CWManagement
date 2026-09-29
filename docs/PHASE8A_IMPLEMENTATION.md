# Phase 8A implementation record

## Scope and local state

Built on local main at d2e6377 after the audit in PHASE8A_AUDIT.md. This implementation is local; no production rollout, cron provisioning, bucket configuration, email activation or QuickBooks activation is implied.

## CRM and lead conversion

Leads now has configurable stages and sources, pipeline/list views, opportunity details, entered value/probability, consultation/close/follow-up dates, won/lost outcomes and internal activities. Contact remains a separate identity. Activity owners can see their assigned opportunities; company-wide CRM access requires configuration capability. Versioned updates and audits preserve changes. Won conversion uses the existing project wizard/templates in one serializable transaction and preserves the original contact. Retries return the same project after access checks.

## Warranty and portals

Warranty is distinct from construction deficiencies. Clients submit their own requests and evidence. Staff review coverage, assign staff/trades, schedule, share scoped comments and evidence, verify completed work and request client verification. Trades see assigned work only and can acknowledge, start, comment, upload evidence and mark ready for staff review. They cannot determine coverage or close requests. Clients verify their own completed work. Internal requests without a client can be closed after completion with a reason; that does not create client verification.

Client and trade DTOs explicitly select safe fields. Client Vision uses the same client projection and renderer with actions disabled. Warranty files cannot leak through the general project file list to another client. Evidence and update history have database retention guards. Warranty dates are entered operational dates, not calculated legal entitlements.

## Reporting and management

Reports covers project portfolio, tasks/milestones, financial portfolio, cost codes, purchasing, Change Orders, selections, CRM, follow-ups, time, warranty, trade access and safe activity descriptions. Project and domain authorization is applied server-side before projection/export. Financials reuse jobCost and Decimal values; margin fields are removed without permission. Saved views store each user's filters and rerun authorization. CSV escapes formula-like text; browser printing avoids a separate PDF system. Time/pipeline grouping uses Decimal totals.

Dashboard adds scoped pipeline, service, target-date and accounting-exception cards plus authorized portfolio financials. My Work includes assigned warranty and sales follow-ups alongside existing work queues.

## Scheduled operations

Automation is off by default. A protected POST endpoint is called by an external Railway cron service. PostgreSQL leases, run records and unique delivery keys survive restart and prevent concurrent claims/duplicate notifications. Sources include selection/task deadlines, trade acknowledgements/deficiencies/instructions, warranty review/due/expiry, sales follow-ups and QuickBooks health. Daily internal and weekly client reviews require opt-in; client summaries use the real safe portal projection.

Recipient access is checked at generation and delivery. Successful SMTP alone marks delivery complete. Configuration failures have bounded backoff. Uncertain SMTP or interrupted sends require authorized review and a reason before retry; the UI requires acknowledgement of duplicate risk. This is deliberately not a claim that SMTP itself provides exactly-once delivery.

## Storage and production hardening

Private S3-compatible storage implements the existing storage interface. Each StoredFile records its provider, preventing configuration changes from silently relocating legacy bytes. Local storage remains development-only. Uploads validate signatures, types, sizes, filenames and scope; downloads retain server-side authorization. No public bucket URLs or credentials are returned.

Authenticated readiness reports database access, latest migration, storage configuration and scheduled-worker configuration. PRODUCTION_RECOVERY.md describes database/object recovery, archive boundaries and rollback precautions. No live restore or production storage migration has been performed.

## Documentation and validation

Added CRM, WARRANTY, REPORTING, AUTOMATION and PRODUCTION_RECOVERY documentation. Updated architecture, database, permissions, storage, accounting, portal, Client Vision, notifications, roadmap and HOW TO content, including separate client/trade warranty guidance.

Validation results are recorded after the final commands below. Test databases are isolated local PostgreSQL databases with `_test` names; production has not been used for automated tests.

## Remaining mature-product gaps

CRM still lacks a pre-project document inbox, mailbox/calendar integration and estimates/proposals before project creation. Reporting lacks large-history pagination, advanced pivots, configurable date semantics and a report designer. Service operations lack technician dispatch/calendar integration, service costing and configurable coverage policies. Reminder cadence is initially company-wide with daily/weekly dedupe rather than a user-configurable rules engine. Digests summarize counts instead of reproducing rich project content. Storage migration and recovery remain deliberate operator procedures rather than tested one-click tools.

QuickBooks live validation/tax/deletion limitations remain; no payments, payroll engine, replacement ledger or CoConstruct migration has been added. These gaps and operational acceptance testing prevent claiming CoConstruct replacement readiness solely from automated tests.

### Validation executed
- Prisma format, validate and generate: passed.
- All 16 migrations applied to isolated local PostgreSQL; the original chain was also deployed into a blank dedicated scheduler test database.
- Lint and typecheck: passed.
- Unit tests: 104 passed.
- Integration suite: 120 passed; final warranty upload-origin service check passed in the seven-test business suite.
- Focused QuickBooks: 33 passed (overlapping unit/integration coverage).
- Dedicated scheduler protocol/recovery: 3 passed with mocked SMTP and real PostgreSQL state.
- Browser suite: 24 passed, including CRM conversion, mobile warranty and reports plus existing regressions.
- Production build: passed.
- Production dependency audit: zero reported vulnerabilities.

An initial browser timezone test collided with concurrently running integration fixtures; the complete sequential browser rerun passed. A Windows Prisma DLL lock was resolved by stopping the test server before generation. These results do not establish live S3/SMTP/cron, restore or QuickBooks validation.
