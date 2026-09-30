# Scheduled reminders and delivery

Automation is off by default. Settings separately enables generation and email. Users opt in to daily digests; staff explicitly opts a project into weekly client review. QuickBooks remains read-only to this subsystem: health alerts do not activate, queue or change accounting transactions.

## Railway execution

Use an external Railway cron service to POST `/api/automation/run` with `Authorization: Bearer <AUTOMATION_SECRET>` on the configured HTTPS application origin. Set a randomly generated secret of at least 32 characters on the app and cron service. Do not print the secret or put it in version control. The endpoint accepts no browser-session substitute and returns 401 when absent/mismatched. A daily morning schedule is a reasonable starting cadence; the worker deduplicates by company-timezone date, or ISO week for client reviews.

The cron container can invoke a small HTTP client using environment variables, then exit. Do not add timers to the web process. Production cron provisioning is a deployment step and has not been performed by this implementation.

AutomationLease is database-backed, atomically acquired with a PostgreSQL advisory transaction lock, and renewed during generation/delivery. A concurrent invocation returns busy. Stale leases expire. AutomationRun records outcomes without payloads/secrets. DeliveryRecord has a unique kind/entity/recipient/period key, and the inbox record is created in the same serializable transaction. Reads create no notices.

Sources: published selections due within seven days/overdue; assigned or released tasks; unacknowledged issued purchasing work; deficiencies; instructions; open/due service requests and client verification; warranty expiration within thirty days; sales activities; connector stale/error checks. Authorized internal digests summarize My Work counts. Weekly client reviews derive counts exclusively from the real client projection and link to that portal; no internal content is embedded.

## Delivery policy

Recipient activity, project access, external grants and record scope are checked at generation and again at delivery. Email is a generic secure link or safe summary, never financial internals. A run delivers at most 15 queued emails. Configuration failures retry with a one-hour backoff, up to five attempts. Before SMTP, status becomes SENDING. Success alone records DELIVERED. An SMTP exception or restart during SENDING is REVIEW_REQUIRED because SMTP cannot guarantee exactly-once delivery after an uncertain acknowledgement. It is not blindly resent. Administrators can review/retry/cancel with an audit reason and explicit duplicate-risk acknowledgement where appropriate.

The durable inbox is authoritative even when email is disabled/fails. Production SMTP delivery and cron operation require live verification. Per-event/user cadence, richer digest layouts, push notifications and recurring workflow rules remain outside this initial scheduled system.

Connector health uses three configured polling intervals, with a minimum two-hour grace, rather than treating a configured connection as live. Weekly client review configuration also requires CLIENT_CONTENT_PUBLISH. WARRANTY_MANAGE remains required for warranty dates.

Scheduler protocol tests use npm run test:automation with DATABASE_URL pointing exclusively to the dedicated cwmanagement_phase8a_automation_test database after migration deployment. They mock SMTP but execute real PostgreSQL leases, scans, notifications, retries and delivery state. Run browser and other integration suites sequentially when sharing a test database, because company settings are shared fixtures.

## Controlled production rollout

Production defaults to stage 0; non-production defaults to all stages for isolated regression tests. `AUTOMATION_ROLLOUT_STAGE` permits progressively: 1 diagnostic only, 2 internal task/follow-up/health, 3 internal warranty, 4 trade reminders, 5 client reminders, 6 opted-in digest, 7 opted-in client summary. Invalid values fail closed. Generation and delivery both enforce the stage; company enablement and audience authorization still apply. Changing the stage never changes QuickBooks mode.

Settings ? Production readiness allows Owner/Controller to run one internal inbox diagnostic while company automation remains disabled. It uses the same database lease and delivery uniqueness and sends no email. Repeat the same request ID to verify no duplicate. The secured endpoint accepts an optional strict diagnostic body containing `userId` (active Owner/Controller only) and UUID `requestId`; omitted body performs the normal enabled job. Authentication occurs before parsing and authenticated calls are rate-limited. No secrets go in query strings.

### Exact Railway Cron service setup

Use a separate Cron service from this same repository/image, not the web application's start command. Set start command to `node scripts/run-scheduler.mjs`, remove its health check and pre-deploy command, and set Railway's cron schedule deliberately. Configure `APP_URL` and reference the application's `AUTOMATION_SECRET` through Railway's private variable reference mechanism. This process does not need database credentials; it POSTs the secured endpoint and exits. It logs only safe counts/status. Do not add a public domain or a persistent timer. Do not copy the web startup migration command onto the cron process.

Initially run it manually with company automation disabled and verify a DISABLED run, then use the explicit diagnostic path to verify one delivery and retry deduplication. Record a real scheduled firing before claiming cron LIVE_TESTED. Keep global email off until a single operator SMTP test and inbox confirmation succeed. Configure `AUTOMATION_EXPECTED_INTERVAL_MINUTES` on the app only if the actual schedule warrants overdue diagnostics; that variable does not schedule anything.

The container operator helper `node scripts/production-diagnostic.mjs scheduler <UUID>` performs the secured diagnostic twice and reports safe counts. Repeating it in a fresh process with the same UUID exercises persistent dedupe. It creates/revokes a five-minute audited operational session for the configured Owner; it does not validate their password, impersonate a client or alter normal enablement.
