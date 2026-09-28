# Phase 7.5 implementation report

Status: **IMPLEMENTED — LIVE QUICKBOOKS VALIDATION PENDING**. No actual Cedar Winds company file was contacted, no production synchronization was activated, and Phase 8 was not started. Changes are local and have not been committed or pushed in this development pass.

## Current Phase 7 implementation reviewed

Started on clean local `main` at `2bda56a`. Read the Phase 7 report, Desktop/mapping/troubleshooting/accounting/live-validation documentation, current schema/migrations, QuickBooks SOAP/queue/request/parser/mapping/import/reconciliation services, dashboard and protocol tests. Used installed Next.js documentation. Baseline lint/typecheck, 81 unit tests, 81 integration tests and production build ran before major changes. Existing normalized financial architecture and portal boundaries were retained.

## Live-validation mode architecture

DISCOVERY and PAUSED permit authentication/read queries but do not apply ActualCost. PILOT restricts exports and reviewed imports. ACTIVE is a deliberate operational promotion. Mode is enforced in queueing, request construction and Bill application, not just the dashboard. Responses to already-delivered writes remain evidence: pause cannot undo a write already executed in Desktop.

## Pilot allowlist

One Project, Vendor Contact, Employee User and PO revision, plus selected Cost Codes/approved TimeSegments. Source relationships and mappings are checked server-side; queue/send recheck eligibility. Scope changes require discovery/pause, no uncertain outstanding write, a reason and backup attestation. Pilot blocks explicit Customer/Vendor creation. Bill review constitutes an explicit per-version import authorization; Project/Vendor/Cost Codes must match the pilot scope.

## Company-file binding

Existing company name/legal name/path binding was retained. The UI displays the detected file and requires deliberate confirmation. Binding is audited with observed identity and operator. It is metadata binding, not proof that identically named copied files are the same physical file.

## Company mismatch protection

Existing latched mismatch blocks financial processing and creates accounting notices. There is no automatic rebinding. The original identity must be observed again and explicitly reconfirmed. Dashboard prominently reports stopped processing on mismatch.

## Pre-flight checks

Live Validation checks explicit HTTPS APP_URL, applied pilot migration/no failed migration, configured enabled credential, matching bound identity, backup confirmation, mapping freshness/availability and unresolved queue/issues. These conditions gate PILOT/ACTIVE transitions. No fake completion indicators or read-triggered notifications.

## PO pilot workflow

Request preview uses the real builder without mutation. It shows references, values and optional accounting-only qbXML. Queue/send validate issued state, pilot source scope, mapping availability and eligibility. Existing returned TxnID/EditSequence/status/sync time are displayed with Desktop comparison instructions. Existing source idempotency and uncertain-write adoption remain intact. Re-export of the same synchronized revision is blocked; later revisions retain reviewed modification semantics.

## Taxable PO policy

Policy B: block any nonzero tax amount or taxable line with the explicit “It was not sent” message. Current qbXML does not map Canadian purchase tax codes/company tax semantics, so dropping tax is not acceptable. A genuinely zero-tax test transaction is required. Do not alter a taxable source just to bypass validation. No claim of live Canadian tax compatibility.

## Time pilot workflow

Only allowlisted, closed, current-version-approved time with Employee/Job/Service Item mappings exports. Preview is side-effect-free. Source changes after synchronization remain reconciliation-required. Transaction identifiers are shown; concurrent/replayed requests are tested for one mapping/transaction source job.

## Bill pilot workflow

Queries stage Bills for explicit Controller review. Preview displays prior actuals, intended new Project/Cost Code/Cost Type amounts and commitment allocation. Apply requires a reason and an exact source-plus-allocation hash. Stale previews are rejected. Outside-scope lines prevent partial application. No ledger values are accepted from browser totals.

## Modified Bill reconciliation

Retained serializable reverse/reapply into ActualCost and CommitmentLine. Added exact preview authorization, reviewed allocation hashing, generation keys for restored/reallocated versions and previous→new amount audit evidence. Removed/returned zero lines restore exposure; duplicate responses/reviews do not double-apply. Allocation-only adjustments have their own audit action and do not count as source Bill modifications.

## Deleted/voided Bill policy

No deletion inference from ordinary query absence. Automated TxnDeletedQuery is not enabled or live validated. The operator verifies Desktop deletion/void and records a reasoned whole-Bill reversal/hold. It restores consumption, preserves history, records activity/audit and an accounting notification, and prevents automatic resurrection. Restore goes to REVIEW_REQUIRED and needs fresh explicit application. A paid Bill's zero balance is not treated as zero cost.

## Unsupported Bill handling

Missing Job lines are retained, not silently skipped. Item/Account mappings or explicit reviewed Project/Cost Code allocations can resolve ordinary lines; known overhead can be ignored with a reason. Groups retain safe metadata but cannot be guessed/flattened. Tax-inclusive, foreign-exchange and negative Bills remain blocked. Monetary overrides, split guessing, Vendor Credits/checks/cards and payroll costing are not added.

## Reconciliation controls

Existing retry, exact TxnID verification, reviewed PO modification and resolution notes remain. Added Bill preview, reasoned allocation, commitment link/unlink, ignore, reversal/hold and restore. Restored/allocated Bills require explicit review even in ACTIVE. Actual-cost capability/project checks remain mandatory. Generic project reconciliation now directs QB actuals to the accounting review service, preventing a mode/allowlist bypass. Audit entries preserve every intervention.

## Sync-run diagnostics

Run starting mode plus existing company/version/time information; request/source IDs, safe status codes/results and blocked jobs. Completed request diagnostics and live evidence have database immutability guards. Authentication failure timestamp and existing callback heartbeat drive observed health. Error 3260 was corrected from “busy” to permission denial; lock retries are bounded to 3175/3176. No credentials, tickets or authentication bodies are exposed.

## Live validation dashboard

Financials/Settings → QuickBooks contains pre-flight, scope configuration, evidence recording, transaction progress, staged Bill review and run inspection. Transaction progress is scoped to selected pilot records. Live evidence is append-only and tied to the company and scope hash, with tester, timestamp, Desktop/Web Connector versions and source IDs. The public setup page gives sequential PC instructions. Large histories remain bounded, appropriate to this small pilot.

## Active-mode guardrails

Required pre-flight, actual discovery/PO/time/Bill/modified-Bill evidence, ten passing live attestations and explicit activation confirmation/reason. Only Owner may override incomplete exit evidence, still subject to technical pre-flight, with an audited reason; override never marks live validated. A later failed live result clears validation and pauses ACTIVE. Existing missing mappings, tax limits, mismatch, overage, permanent errors and idempotency controls still apply after activation.

## Tests added

Three unit cases for modes, safe error meanings and unsupported-line retention. Ten integration workflows cover allowlists at queue/execution, preview side effects, tax blocking, concurrent time retries, stage-only modes, paused authentication, reviewed Bill edits/stale hashes, hold/restore/consumption, no-job allocation and cross-scope denial, zero-value Bills/unlinking, repaired mappings, permanent permissions, append-only evidence, run privacy and both normal/Owner-override activation. Existing Phase 7 fixture helpers seed ACTIVE deliberately; the new tests exercise real activation gates. Existing multi-project import test now explicitly reviews overhead.

One browser workflow adds observed pre-flight, PAUSED mode, blocked casual activation and run inspection. Existing eleven workflows remain, including client/trade isolation and financial operations. Browser tests use a local console email provider and no real email recipients or accounting software.

## Documentation updated

Created QUICKBOOKS_PILOT.md and this report. Updated README, live-validation checklist with actual-result/environment/sign-off tables, Desktop/mapping/troubleshooting/accounting docs, architecture/database/permissions/job costing/roadmap and the historical Phase 7 report. In-app setup instructions now direct operators through PILOT, not immediate ACTIVE. No document claims actual live results.

## Validation results

| Check | Actual outcome |
|---|---|
| Prisma format | Passed |
| Prisma validate | Passed |
| Prisma generate | Passed |
| Isolated migrations | All nine applied to fresh `cwmanagement_phase75_verified_test`; follow-up deploy found no pending migrations |
| Lint | Passed |
| Typecheck | Passed |
| Unit tests | 84 passed |
| Integration tests | 91 passed |
| Focused QuickBooks / protocol tests | 33 passed (9 unit + 24 database/protocol) |
| Browser workflows | 12 Chromium workflows passed |
| Production build | Passed |

Initial command retries encountered Windows npm.ps1 execution policy (used npm.cmd), PostgreSQL sandbox startup restrictions, and the expected isolated-database guard when a test command lacked DATABASE_URL. An initial browser run found an ambiguous mode label (fixed) and absent local email provider (configured console for tests). Playwright-owned Windows server teardown stalled; after stopping that verified test server, the final browser run reused a separately managed local server and exited successfully. No production configuration was changed. Existing Prisma package.json deprecation warnings remain.

## Migrations

`202609280001_quickbooks_pilot`: adds modes, connection scope/attestations/health fields, run/request diagnostic fields, Bill decisions/holds and append-only QuickBooksValidationResult. **Resets existing ACTIVE connections to DISCOVERY** for deliberate review; preserves accounting history, source IDs and queued jobs. Back up/stage before Railway migration deployment. Existing deployment topology is unchanged.

## New environment variables

None.

## Exact steps on the Cedar Winds QuickBooks Desktop computer

1. Back up the intended company and verify recovery. Prefer a Controller-approved test copy; keep other company files closed during the first test.
2. Have the application operator deploy the migration, confirm HTTPS APP_URL and configure DISCOVERY. Download CWManagement.qwc and securely obtain the copy-once connector password separately.
3. Open the intended Desktop company under the appropriate administrator account. Open compatible QuickBooks Web Connector, choose Add Application and select the QWC. Authorize the correct company and enter the password in Web Connector, never in the QWC/documentation.
4. Click **Update Selected**. In CWManagement inspect the run, compare observed company name/path against Desktop and explicitly bind it. Record Desktop edition/version and Web Connector version.
5. Queue list discovery in CWManagement, then click Update Selected again. Verify Customer:Job, Vendor, Employee and Item discoveries; map the small pilot set deliberately.
6. In CWManagement choose an explicit Bill import date, save the allowlist and backup attestation, resolve pre-flight blockers and select PILOT. Keep unrestricted synchronization disabled.
7. Preview and queue one genuinely eligible zero-tax issued PO. Click Update Selected. In Desktop locate it using RefNumber/Memo, compare all references/values and record TxnID/EditSequence.
8. Preview and queue one approved TimeSegment. Click Update Selected. In Desktop verify Employee, date, Job, Service Item, duration and returned transaction ID. Do not change payroll preferences casually.
9. Create one small test Bill in Desktop with the mapped Job/Item/Vendor and test PO link. Queue Bill query and click Update Selected. In CWManagement inspect the staged Bill, choose/verify allocation, preview and apply with a reason. Verify Actual + Remaining Committed.
10. Change the test Bill from X to Y in Desktop. Repeat query, preview and review. Verify Y replaces X; retry the query/application and confirm no duplicate. Test overage rejection and pause.
11. Verify a deletion/void scenario in the test copy, then use the reasoned Bill hold/reversal in CWManagement. Confirm restored commitment, retained history and no automatic reimport. Test restoration only after deliberate source review.
12. Record each result and failure/recovery attempt in the dashboard and QUICKBOOKS_LIVE_VALIDATION.md. Leave PILOT/PAUSED until Controller review; do not promote simply because automated tests passed. Review tax/deletion/time/accounting restrictions before any broader ACTIVE scope.
