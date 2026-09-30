# Production go-live checklist

Record operator, date, deployed commit and actual result for every live check. A local test pass is **CODE_VALIDATED**, configuration alone is **CONFIGURED**, a successful real operation is **LIVE_TESTED**, and **READY** requires the applicable operational checks and owner sign-off. Missing dependencies are **BLOCKED**.

## Application and migration

- [x] Phase 8A committed as `4737970dfe3b154f406fc92e699070881c283890` and pushed to main.
- [x] Correct Railway CWManagement application/production service and linked Postgres inspected.
- [x] All 16 migrations applied in production using migrate deploy; no reset/db push.
- [x] Nelson confirmed existing Owner login works.
- [ ] Deploy readiness changes; verify deployed SHA and startup migration log.
- [ ] Confirm health, login and scoped pages on the new deployment.
- [ ] Verify backup schedule, retention and most recent successful backup before broader use.

Migration risk: no table drops or data resets were found. Earlier migrations replace selected Change Order constraints and AccountingSyncMapping uniqueness; those are not purely additive changes. Phase 8A adds domains, fields, checks and retention guards. The entire 16-migration chain was applied to a fresh isolated database. No new schema migration is introduced by this readiness pass. Code rollback does not undo migrations.

Railway skipped the earlier configured pre-deploy hook; production migrations were applied explicitly. The application start script now runs `prisma migrate deploy` before loading the server and exits on failure. Keep the pre-deploy hook as well. Do not bypass a failed migration to get a green health check.

## Configuration requirements — variable names only

| When required | Names / conditions |
|---|---|
| BEFORE LOGIN | `DATABASE_URL`, `APP_URL`, `APP_SECRET`, `APP_TIMEZONE`; migrations and seeded active Owner |
| Initial Owner setup only | `OWNER_EMAIL`, `OWNER_PASSWORD`; password removed after successful login; do not reset a working account |
| BEFORE FILE UPLOAD | `STORAGE_DRIVER`, `STORAGE_S3_BUCKET`, `STORAGE_S3_REGION`, `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY`; Railway bucket also needs `STORAGE_S3_ENDPOINT` |
| BEFORE EMAIL | `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` |
| BEFORE AUTOMATION | `AUTOMATION_SECRET`, `APP_URL`; external scheduler provisioned; company enablement and deployment rollout stage deliberately selected |
| BEFORE QUICKBOOKS | `APP_URL`, `APP_SECRET`; separately configured connection, company binding, mappings, pilot allowlist and QBWC credentials in the app/Windows connector |
| OPTIONAL | `STORAGE_S3_PATH_STYLE`, `STORAGE_MAX_BYTES`, `AUTOMATION_ROLLOUT_STAGE`, `AUTOMATION_EXPECTED_INTERVAL_MINUTES`, `NEXT_PUBLIC_LOGO_URL`, `OWNER_FIRST_NAME`, `OWNER_LAST_NAME` |

`APP_URL` must be the exact public HTTPS origin, not `/login`. `APP_SECRET` must meet the application's 32-character minimum. Initial/reset `OWNER_PASSWORD` must be 12–128 characters. No credentials belong in this checklist.

## Storage

- [ ] Settings → Production readiness: run private storage test.
- [ ] Provider round-trip, metadata, authenticated download, anonymous denial, client isolation, trade record isolation and archive denial all pass.
- [ ] Diagnostic bytes removed; temporary sessions/users/grants revoked; archive/audit evidence retained.
- [ ] Retry any pending cleanup shown in Settings before treating the test as verified.
- [ ] Inventory legacy local metadata and reconcile missing bytes; never silently switch metadata providers.
- [ ] Document actual bucket recovery/retention capabilities; private does not mean backed up.

Railway's current buckets normally use virtual-hosted URLs; use the bucket Credentials tab's endpoint and URL style, not an invented endpoint. See [Railway storage guidance](https://docs.railway.com/storage-buckets).

## Email

- [ ] Send exactly one operator-requested test from Settings.
- [ ] SMTP accepts the message; operator confirms inbox receipt.
- [ ] Test password reset without changing an existing working password unnecessarily.
- [ ] Test one explicitly designated client invitation and one trade invitation.
- [ ] Test one reminder, then one opted-in digest only after internal delivery validation.
- [ ] Review ambiguous provider outcomes before retry; never assume a timeout means no delivery.

The test has a durable request ID and does not repeat the same request. SMTP acceptance is recorded separately from inbox confirmation. Scheduled delivery already retains uncertain sends in REVIEW_REQUIRED; retries need an audit reason and duplicate-risk acknowledgement.

## Automation rollout

- [ ] Run internal diagnostic twice with the same request ID: one notification and one DeliveryRecord total.
- [ ] Repeat in a fresh process: zero additional delivery records; lease released.
- [ ] Confirm unauthorized scheduler request returns 401.
- [ ] Configure external Railway Cron, verify one scheduled invocation, record time.
- [ ] Keep company automation/email disabled until diagnostics pass and operator authorizes rollout.
- [ ] Stage 1: internal diagnostic only; stage 2: internal task/follow-up; stage 3: internal warranty; stage 4: trades; stage 5: clients; stage 6: opted-in digest; stage 7: opted-in project summary.

Production defaults to rollout stage zero. Stage selection never enables the company setting or email by itself. A read of the dashboard never runs jobs. See [AUTOMATION.md](AUTOMATION.md).

## Business, portals and security

- [ ] Complete [PRODUCTION_PILOT_WORKFLOW.md](PRODUCTION_PILOT_WORKFLOW.md) with named test identities.
- [ ] Client, trade and Client Vision publish rules checked on actual content.
- [ ] No client/trade access to internal reports/readiness or another identity's project/records.
- [ ] CRM, warranty, reports and time checked in the deployed app.
- [ ] Mobile navigation, HOW TO and no-content screens reviewed; findings logged.
- [ ] Archive test project and revoke temporary access; preserve approvals/audit/accounting evidence.
- [ ] QuickBooks remains DISCOVERY/PILOT; no unrestricted activation during this pass.

## Sign-off

Operator/date: ____________________
Outstanding blockers accepted or resolved: ____________________
Backup/recovery owner and escalation contact: ____________________
Approved rollout stage and users: ____________________
