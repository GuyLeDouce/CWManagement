# Database Source of Truth

## Core records

- `User`: login identity with multiple roles and explicit capability grants/denials.
- `Employee`: optional one-to-one employment data. A user need not be an employee.
- `Company` and `Contact`: CRM/address-book data. Contacts carry multiple types and need no login.
- `Project`: the Project aggregate, mapped to the existing `Jobsite` PostgreSQL table for a data-safe transition. It contains project number, identity, type, status, stage, address, dates, contract amount, notes, and archive state.
- `ProjectContact`: many-to-many project contacts with a contextual role and primary flag.
- `ProjectAssignment`: flexible internal staffing with contextual role and primary flag.
- `AccountingCode`: current time/accounting dimension. It is the seed of the future first-class cost-code hierarchy.
- `WorkDay`, `TimeSegment`, `Approval`, and `ExportBatch`: audited timekeeping pipeline.
- `AccountingSyncMapping`: QuickBooks IDs, direction, state, timestamps, and error metadata without implementing synchronization.

## Project status

`LEAD`, `PRECONSTRUCTION`, `DESIGN`, `ESTIMATING`, `CONTRACT_PENDING`, `ACTIVE`, `ON_HOLD`, `SUBSTANTIALLY_COMPLETE`, `WARRANTY`, `COMPLETE`, `ARCHIVED`.

Archived projects use `archivedAt`; status communicates lifecycle. Normal lists require `archivedAt IS NULL`.

## Financial direction

Phase 3 adds versioned `Estimate`/`EstimateLine`, approved `Budget`/`BudgetLine`, and a cost-code hierarchy. Phase 4 adds commitments, purchase orders, change orders, and actual costs. Financial transaction records must be immutable after approval/sync; corrections use reversals or revisions. Reports calculate Budget, Committed, Actual, Forecast, and Variance from these ledgers.

## Migration policy

Migration `202609220001_cwmanagement_foundation` is additive and keeps existing time data. Production uses `prisma migrate deploy`; never use `db push`. Backups and a staging deploy are required before production migration.
