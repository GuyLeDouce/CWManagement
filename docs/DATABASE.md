# Database Source of Truth

## Core records

- `User`: login identity with multiple roles and explicit capability grants/denials.
- `Employee`: optional one-to-one employment data. A user need not be an employee.
- `Company` and `Contact`: CRM/address-book data. Contacts carry multiple types and need no login.
- `Project`: the Project aggregate, mapped to the existing `Jobsite` PostgreSQL table for a data-safe transition. It contains project number, identity, type, status, stage, address, dates, contract amount, notes, and archive state.
- `ProjectContact`: many-to-many project contacts with a contextual role and primary flag.
- `ProjectAssignment`: flexible internal staffing with contextual role and primary flag.
- `ProjectTask`: schedule work with dates, actual dates, milestone state, internal/external assignees, ordering, archive state, and typed dependencies. It is not a clocking `Task`.
- `DailyLog`: one author’s structured project/site report for a date, with optional sections and a future client-visible flag.
- `StoredFile`: provider-neutral document/photo metadata. Bytes are addressed by an opaque `storageKey`; authorization is always project-scoped.
- `Notification`: per-user inbox item with read state, project/entity context, and action link.
- `CostCode`: hierarchical job-cost classification with type, parent, ordering, active state, and QuickBooks ListID preparation.
- `AccountingCode`: legacy time-export code retained during transition. It is not silently merged with `CostCode`.
- `WorkDay`, `TimeSegment`, `Approval`, and `ExportBatch`: audited timekeeping pipeline.
- `AccountingSyncMapping`: QuickBooks IDs, direction, state, timestamps, and error metadata without implementing synchronization.

## Project status

`LEAD`, `PRECONSTRUCTION`, `DESIGN`, `ESTIMATING`, `CONTRACT_PENDING`, `ACTIVE`, `ON_HOLD`, `SUBSTANTIALLY_COMPLETE`, `WARRANTY`, `COMPLETE`, `ARCHIVED`.

Archived projects use `archivedAt`; status communicates lifecycle. Normal lists require `archivedAt IS NULL`.

## Financial direction

Phase 3 adds versioned `Estimate`/`EstimateLine`, approved `Budget`/`BudgetLine`, and a cost-code hierarchy. Phase 4 adds purchasing and change-order revisions feeding the Phase 3 commitment and actual ledgers. Financial transaction records must be immutable after approval/sync; corrections use reversals or revisions. Reports calculate Budget, Committed, Actual, Forecast, and Variance from these ledgers.

The Phase 2 `CostCode` hierarchy is referenced by Phase 3 and Phase 4 financial records. `Task` remains a reusable time activity and may point to a default cost code. `TimeSegment.costCodeId` allows explicit job-cost classification while the legacy `accountingCodeId` remains available for existing payroll exports. A schedule `ProjectTask` may gain optional cost-code planning links later, but no automatic equivalence is assumed.

## Migration policy

Migration `202609220001_cwmanagement_foundation` is additive and keeps existing time data. Production uses `prisma migrate deploy`; never use `db push`. Backups and a staging deploy are required before production migration.

Migration `202609220002_project_operations` adds Phase 2 enums, capabilities, activity fields, schedule/dependency tables, daily logs, stored-file metadata, notifications, hierarchical cost codes, and optional cost-code links. Database checks prevent reversed task dates, self-dependencies, invalid assignee shapes, and negative file sizes.

## Phase 3 financial records

`Estimate` and `Proposal` are numbering/family records. Their revision records preserve versions; estimate lines snapshot cost-code labels, and proposal JSON snapshots preserve issued client wording and pricing. `BudgetVersion` stores deliberate ORIGINAL, CURRENT, REFORECAST, or future CHANGE_ORDER snapshots. `CommitmentLine.consumedAmount` and `ActualCost.commitmentLineId` prevent fulfilled commitments from being counted twice. `ActualCost` normalizes manual, time, and future QuickBooks sources with external idempotency keys. `ForecastAdjustment` records deliberate estimates-to-complete.

Migration `20260922211243_financial_backbone` adds financial capabilities/settings, estimate and proposal revisions, budget snapshots, commitments, actual costs, forecast adjustments, Decimal fields, idempotency indexes, and database financial checks.

## Phase 4 purchasing/change records

`PurchasingDocument`/`PurchasingRevision`/`PurchasingLine` support both purchase and work orders. `ChangeOrder`/`ChangeOrderRevision`/`ChangeOrderLine` retain client changes. `ContractAdjustment` is an immutable, uniquely sourced contract-revenue adjustment (not a second cost ledger). Purchasing commitment ownership and stable source-line keys preserve ActualCost links. BudgetVersion optionally references its accepted CO revision. ActualCost adds reversing user/reason. Company adds active state; Settings adds PO/WO/CO prefixes, counters and default terms.

Migration `202609240001_purchasing_change_management` is additive. It adds PurchasingType/PurchasingStatus/ChangeOrderStatus, capability values, fields, tables, indexes, foreign keys, financial checks, immutable issued-content triggers and contract-baseline/adjustment guards. Existing Project.contractAmount values are preserved as original contract baselines. Multiple legacy active budgets are not silently consolidated; CO acceptance requires exactly one active budget. New original-budget creation refuses an existing active budget.
