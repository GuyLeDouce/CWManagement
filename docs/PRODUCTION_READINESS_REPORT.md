# Production readiness report

Status: **LIVE VALIDATION IN PROGRESS — not a blanket production-readiness sign-off**.

## Commit / deployment

Phase 8A commit `4737970dfe3b154f406fc92e699070881c283890` was pushed and deployed successfully to the existing CWManagement Railway production service. Readiness commit `746d476c0ac366da41e314b0c8fdfaef718c770e` deployed successfully as `78b881c9-0751-433c-a436-2ba3a62f9ccb`. Startup logs show all 16 migrations current before Next.js serves requests.

## Production migration state / database

All 16 migrations applied using `npm run db:migrate` inside the application environment; Prisma reported up to date. The earlier Railway pre-deploy hook was skipped. Startup now includes an idempotent migration guard before serving. No reset, db push, migration deletion or production destructive test was used. Fresh isolated chain validated separately.

## Login

**LIVE_TESTED**: Nelson confirmed login works. OWNER_PASSWORD was already absent; no password reset or credential change was performed.

## Storage

**LIVE_TESTED / VERIFIED** against the configured private Railway bucket. Diagnostic `60ff1a8b-c5bb-477e-8e2b-7a66d2ad7bf6` passed real upload/readback, metadata, internal authenticated download, anonymous denial, authorized client access, internal/unrelated-client denial, assigned-trade access, unrelated-trade/client-file denial, archive denial and cleanup. Temporary access was revoked and bytes removed. Archived evidence remains. Bucket recovery policy still requires review.

## SMTP

**CONFIGURED; corrective live retest pending**. First test failed before SMTP connection with EDNS. Read-only comparison with the working CWTimeClock service found only SMTP_HOST differed. Corrected that single variable; credentials remain unchanged. No inbox-delivery claim until a successful retest and confirmation.

## Automation

**LIVE_TESTED for controlled execution/deduplication; external cron pending**. Diagnostic `5ee92f98-b7f3-4d06-924b-415762ac595e` created one delivery record; repeated calls and a fresh container process created zero more, with no lease left behind. Strong scheduler credential configured without displaying it. Production rollout stage zero. Company automation and email are not enabled by this pass. A protected diagnostic exercises the durable lease and one in-app DeliveryRecord without email. External scheduled invocation is a separate deployment acceptance item.

## CRM / Warranty / Reports / Client Portal / Trade Portal / Client Vision / Time

**CODE_VALIDATED; full production business workflow pending**. Deployed route/API smoke evidence is separate from the realistic full-project manual script. Do not infer approvals, time tracking or file workflows work merely from a 200 response.

## QuickBooks

Existing pilot restrictions remain intact. No outbound accounting transaction was queued and no ACTIVE promotion performed. Real QuickBooks Desktop/Web Connector compatibility remains pending its separate live checklist.

## Backups / recovery

**CONFIGURED by operator report**: Nelson reports backups enabled and point-in-time recovery staged. Staged is not applied/verified. Latest successful snapshot, retention, recoverable PITR point and bucket recovery policy remain unverified. No production restore performed. See PRODUCTION_RECOVERY.md; restoration into staging is instructed, not claimed tested.

## Security validation

Existing isolated portal/security suites plus added readiness permission, migration fail-closed, rollout, storage diagnostic/cleanup and email idempotency tests. Live storage isolation passed. Anonymous readiness/reports/file endpoints returned 401; unauthorized scheduler returned 401. Authenticated CRM/report/dashboard/warranty/state endpoints and health/login returned 200. These read smoke checks alone do not prove full business workflow completion.

## UX findings / test Project

See PRODUCTION_UX_FINDINGS.md and PRODUCTION_PILOT_WORKFLOW.md. Manual results remain explicitly pending until recorded by a tester.

## Known blockers / go-live recommendation

Permit controlled internal pilot use after deployment health is confirmed. Do not enable broad client/trade rollout, bulk email, normal automation or unrestricted accounting until their live acceptance steps pass. Missing backup evidence remains a material recovery risk. Passing automated tests alone does not establish CoConstruct replacement readiness.

## Automated validation during readiness pass

- Prisma format / validate / generate: passed.
- Fresh isolated PostgreSQL: all 16 migrations applied; repeat deploy reports no pending migrations.
- Lint / typecheck: passed.
- Unit: 108 passed.
- Integration: 125 passed, including portal, QuickBooks and readiness permissions/storage cleanup.
- Focused QuickBooks: 33 passed (overlaps the above suites).
- Dedicated scheduler recovery: 4 passed, including globally disabled diagnostic and fresh-connection dedupe.
- Existing browser workflows: all 24 individual tests passed; Windows Next.js teardown hung and required stopping the verified test server; Playwright then reported 24 passed with exit code zero.
- Added readiness-panel browser workflow: 1 passed, repeat action creates zero additional notifications.
- Production build: passed.

No production database was used for these automated suites. Logs are local ignored test output, not committed credentials.
