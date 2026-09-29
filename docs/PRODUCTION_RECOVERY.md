# Production recovery checklist

This is an operational runbook, not evidence of a tested restore. Assign a named operator and record each rehearsal result before relying on it.

## Before deployment

1. Confirm the Railway project, production environment and application/PostgreSQL services.
2. Verify the actual configured PostgreSQL backup schedule, retention and last successful backup in Railway. Do not assume backups exist because a database is provisioned.
3. Take/confirm a restorable backup before migrations. Record deployment commit, migration names and backup time without secrets.
4. Run `npm run db:migrate` in the application environment. Never use db push, migrate reset, DROP SCHEMA or migration squashing on production.
5. Verify `/api/health`, authenticated readiness, login, and a scoped read. A healthy HTTP process alone does not validate object storage or accounting integration.

## Database restoration

Restore a backup into an isolated replacement database first using Railway/provider-supported restore tooling. Keep production stopped or read-only during a coordinated recovery to avoid divergent writes. Verify migration history, owner access, project counts and financial relationships. Test on the isolated copy; never run destructive automated suites on production. Switch the application connection only after operator review. Keep the original database available for investigation until retention policy permits retirement.

Code rollback is not database rollback. Additive migrations generally permit an older image, but verify compatibility. Never delete applied migration history to make a failed deployment appear clean. Use a reviewed forward migration where possible. Do not replay accounting outbound requests as a recovery shortcut; preserve QuickBooks mapping, request evidence, mirror and pilot state, and reconcile uncertain transactions explicitly.

## Object storage

Use a private S3-compatible bucket with provider versioning/backup/retention configured and verified. Database backups do not contain file bytes. Record bucket/provider identity and backup/versioning policy separately from credentials. Preserve StoredFile IDs, keys, provider metadata and evidence associations. A file restore must restore the matching object versions as well as metadata.

Legacy local metadata is retained as `storageProvider=local`. No production-file inventory was performed in Phase 8A. Before switching, inventory existing records/bytes, copy to the private bucket under identical keys, verify byte count/content hashes, then deliberately update provider metadata. Retain the original bytes until verification and retention approval. Missing legacy bytes must be reported, not silently replaced. Production local storage stays disabled.

## Records to preserve

Archive projects and revoke portal grants; do not casually hard-delete contacts, users, messages, warranty history, files, financial documents, budgets, actuals, accounting mappings or audit records. Warranty updates and associated evidence are retained by database guards. An archive is not a legal retention policy: Cedar Winds must set retention periods and authorized deletion procedures. No automatic purge is introduced.

## Rehearsal log

Record date, operator, backup identifier, isolated target, application commit, migration status, record/financial checks, object checks, login checks, measured restore duration and result. Do not include database URLs, passwords, hashes, tokens or bucket credentials. Production restore, S3 compatibility and scheduled SMTP delivery remain live validation tasks.
