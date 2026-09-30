# Production readiness report

Status: **LIVE VALIDATION IN PROGRESS — not a blanket production-readiness sign-off**.

## Commit / deployment

Phase 8A commit `4737970dfe3b154f406fc92e699070881c283890` was pushed and deployed successfully to the existing CWManagement Railway production service. Readiness changes are undergoing final validation; deployed evidence will be appended here.

## Production migration state / database

All 16 migrations applied using `npm run db:migrate` inside the application environment; Prisma reported up to date. The earlier Railway pre-deploy hook was skipped. Startup now includes an idempotent migration guard before serving. No reset, db push, migration deletion or production destructive test was used. Fresh isolated chain validated separately.

## Login

**LIVE_TESTED**: Nelson confirmed login works. OWNER_PASSWORD was already absent; no password reset or credential change was performed.

## Storage

**CONFIGURED; live test pending**. Operator supplied Railway private bucket credentials; STORAGE_DRIVER selected explicitly. No VERIFIED claim until the real round-trip/access/cleanup test passes. Existing local-file inventory and backup strategy still require review.

## SMTP

**CONFIGURED; live test pending**. Required SMTP variable names present. No inbox-delivery claim from configuration. The controlled test sends once to the operator, records SMTP success separately and requires inbox confirmation.

## Automation

**CODE_VALIDATED; live test pending**. Strong scheduler credential configured without displaying it. Production rollout stage zero. Company automation and email are not enabled by this pass. A protected diagnostic exercises the durable lease and one in-app DeliveryRecord without email. External scheduled invocation is a separate deployment acceptance item.

## CRM / Warranty / Reports / Client Portal / Trade Portal / Client Vision / Time

**CODE_VALIDATED; full production business workflow pending**. Deployed route/API smoke evidence is separate from the realistic full-project manual script. Do not infer approvals, time tracking or file workflows work merely from a 200 response.

## QuickBooks

Existing pilot restrictions remain intact. No outbound accounting transaction was queued and no ACTIVE promotion performed. Real QuickBooks Desktop/Web Connector compatibility remains pending its separate live checklist.

## Backups / recovery

**CONFIGURED by operator report**: Nelson reports backups enabled and point-in-time recovery staged. Staged is not applied/verified. Latest successful snapshot, retention, recoverable PITR point and bucket recovery policy remain unverified. No production restore performed. See PRODUCTION_RECOVERY.md; restoration into staging is instructed, not claimed tested.

## Security validation

Existing isolated portal/security suites plus added readiness permission, migration fail-closed, rollout, storage diagnostic/cleanup and email idempotency tests. Live controlled checks pending; anonymous endpoint denial is not equivalent to cross-project authenticated isolation.

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
- Existing browser workflows: all 24 individual tests passed; Windows Next.js teardown hung and required stopping the verified test server.
- Added readiness-panel browser workflow: 1 passed, repeat action creates zero additional notifications.
- Production build: passed.

No production database was used for these automated suites. Logs are local ignored test output, not committed credentials.
