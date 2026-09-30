# Production readiness report

Status: **LIVE VALIDATION IN PROGRESS — not a blanket production-readiness sign-off**.

## Commit / deployment

Phase 8A commit `4737970dfe3b154f406fc92e699070881c283890` was pushed and deployed successfully to the existing CWManagement Railway production service. Readiness commit `746d476c0ac366da41e314b0c8fdfaef718c770e` deployed successfully as `78b881c9-0751-433c-a436-2ba3a62f9ccb`. Latest tested deployment is `0e52ae432d392232aa450948b06ae68f09b26d90`, deployment `10d7fda0-b48b-49b0-8ce6-fda66a145693`, SUCCESS. Startup logs show all 16 migrations current before Next.js serves requests.

## Production migration state / database

All 16 migrations applied using `npm run db:migrate` inside the application environment; Prisma reported up to date. The earlier Railway pre-deploy hook was skipped. Startup now includes an idempotent migration guard before serving. No reset, db push, migration deletion or production destructive test was used. Fresh isolated chain validated separately.

## Login

**LIVE_TESTED**: Nelson confirmed login works. OWNER_PASSWORD was already absent; no password reset or credential change was performed.

## Storage

**LIVE_TESTED / VERIFIED** against the configured private Railway bucket. Diagnostic `60ff1a8b-c5bb-477e-8e2b-7a66d2ad7bf6` passed real upload/readback, metadata, internal authenticated download, anonymous denial, authorized client access, internal/unrelated-client denial, assigned-trade access, unrelated-trade/client-file denial, archive denial and cleanup. Temporary access was revoked and bytes removed. Archived evidence remains. Production inventory found zero active legacy local file records before the pilot. Bucket recovery policy still requires review.

## SMTP

**LIVE_TESTED with operator-confirmed inbox receipt**. First test failed before SMTP connection with EDNS. Read-only comparison with the working CWTimeClock service found only SMTP_HOST differed. Corrected that single variable; credentials remain unchanged. Retest `91eaf4b3-cdf5-4920-b322-1d2a763e986d` was accepted by SMTP on 2026-09-30. Nelson confirmed receipt; confirmation was recorded through the authorized readiness action. Password-reset, client/trade invitation and opted-in digest delivery remain separate checks.

## Automation

**LIVE_TESTED for controlled execution, deduplication and actual hourly cron firing**. Diagnostic `5ee92f98-b7f3-4d06-924b-415762ac595e` created one delivery record; repeated calls and a fresh container process created zero more, with no lease left behind. Strong scheduler credential configured without displaying it. Production rollout stage zero. Company automation and email are not enabled by this pass. A protected diagnostic exercises the durable lease and one in-app DeliveryRecord without email. The packaged cron runner was also executed inside the app container and exited successfully with DISABLED. This is not proof of an actual scheduled Railway firing. The existing CWManagement Scheduler service was deployed with the isolated HTTP runner as `dcdba246-1575-4b55-a6c8-25dadd3cde36`. It exited successfully with DISABLED. APP_URL and AUTOMATION_SECRET match the app. Railway read the uploaded config paths but did not apply cronSchedule initially. Nelson set it directly; the service now reports `0 * * * *` and next run 2026-09-30 13:00 UTC. A real timed firing completed at 2026-09-30 13:02:01 UTC with DISABLED and exited; Railway advanced nextCronRunAt to 14:00 UTC. Recurring execution is LIVE_TESTED, while reminder/email rollout intentionally stays disabled. The service currently uses a CLI-uploaded runner; updating scripts/run-scheduler.mjs requires deliberate redeployment of that small bundle unless GitHub source/config is subsequently connected.

## CRM / Warranty / Reports / Client Portal / Trade Portal / Client Vision / Time

**LIVE_TESTED for the controlled API pilot**, ID `fd0d9238-de7f-4320-8fcb-8012a028a3b5`, project `cmuo3blgh000qlq0191qxfbbx` (now archived):

- Actual password logins succeeded for six disposable Owner/PM/client/trade identities.
- CRM opportunity and follow-up created, marked Won, converted through the real setup API; repeated conversion returned the same project.
- Client submitted service request; PM accepted/assigned; trade marked ready; PM completed; client verified; PM closed.
- Other client/trade could not see or act on that service; trade could not close it. Cross-project and cross-portal requests were rejected.
- Client Vision projection equalled the actual authorized client's projection; forbidden-key check passed.
- Project/task/financial/CRM/time/warranty reports ran; PM project filter did not expose an unrelated project.
- Test projects archived; users deactivated/password hashes cleared, sessions/tokens revoked, portal grants revoked and test stage deactivated. Audit/warranty/opportunity history retained.

This API pilot did **not** complete the full visual/mobile business walkthrough, warranty attachment upload, estimate/proposal/CO/PO approval sequence or actual employee clocking. Time report success is not time-entry validation. Those remain explicitly pending in PRODUCTION_PILOT_WORKFLOW.md.

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

## Deployment variable changes

Names only: `STORAGE_DRIVER`, `AUTOMATION_SECRET`, `AUTOMATION_ROLLOUT_STAGE`, `SMTP_HOST`. Existing SMTP credentials were not changed. Diagnostic interval configured to match the hourly schedule: `AUTOMATION_EXPECTED_INTERVAL_MINUTES`. No secret values are committed or recorded here.
