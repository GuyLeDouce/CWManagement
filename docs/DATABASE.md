# Database Source of Truth

## Phase 7.5 pilot additions

`202609280001_quickbooks_pilot` extends QuickBooksMode with PILOT/PAUSED, connection pilot scope/backup/live-validation/auth-failure fields, run mode and safe request status/result. Bill mirrors have reviewed line decisions and persistent suppression. Append-only `QuickBooksValidationResult` stores operator/version/record/company/scope evidence; triggers preserve completed request diagnostics and validation history. Existing ACTIVE connections are deliberately reset to DISCOVERY by this migration. No new financial ledger. See [pilot rules](QUICKBOOKS_PILOT.md).

## Phase 5 additions

Migration `202609240002_client_selections_portal` adds ClientProjectAccess, Allowance, Selection, SelectionOption, SelectionDecision, ClientApproval, Conversation, ProjectMessage and ConversationRead. Contact.portalUserId now references User; resolve any preexisting orphan portal IDs deliberately before deployment. Allowance source estimate/budget links and cost codes have foreign keys. Unique project/user and project/contact grants, one selection per allowance, one decision per selection and one client approval per CO revision prevent duplicate allocation/evidence.

ProjectTask adds clientVisible/clientTitle/clientDescription; DailyLog adds clientSummary; Project adds clientTargetCompletion. Triggers protect published options, decided selection wording, published allowances and approval/message evidence. Amount/version/action checks supplement application validation. CO constraints now permit signed costs/markup/totals for credits while preserving positive quantities and arithmetic/tax/version checks. Original Phase 4 migrations remain unchanged.

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
- `AccountingSyncMapping`: QuickBooks IDs, direction, state, timestamps and error metadata; Phase 7 adds connection-scoped synchronization and reconciliation evidence.

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

## Phase 5 and Phase 6 portal records

Phase 5 migration 202609240002_client_selections_portal adds explicit client grants, allowances/selections/options/decisions, immutable client approval, conversations/messages/read states and publishing fields. Phase 6 migration 202609240003_trade_portal adds TradeProjectAccess, TradeTaskRelease, TradeScheduleResponse, TradeFileShare, SiteInstruction/Recipient, TradeAcknowledgement, Deficiency/Update. Contact/Company remain the external identity source; no duplicate Vendor model exists.

Phase 6 adds TRADE ConversationAudience, FileOrigin, InstructionStatus, DeficiencyStatus, TradeResponseType and 11 capabilities. ProjectTask gains trade-safe wording; StoredFile gains origin, revision label, uploader Contact and optional related-record references; Conversation gains trade Contact/context; ProjectMessage gains attachment IDs. Settings adds SI/deficiency number counters and prefixes. Unique receipt-source/contact and schedule request keys prevent duplicate evidence. Triggers protect receipts, issued instruction content/recipients, original schedule responses, deficiency updates, trade conversations and retained file evidence. Existing financial ledger models and money calculations are unchanged.

## Phase 7 accounting records

Migration `202609240004_quickbooks_desktop` adds QuickBooksConnection, QuickBooksCandidate, QuickBooksSyncSession, QuickBooksSyncRun, QuickBooksSyncJob, QuickBooksRequest, QuickBooksSyncIssue and QuickBooksBillMirror. QuickBooksMode is DISCOVERY/ACTIVE; job states distinguish BLOCKED, FAILED and RECONCILIATION_REQUIRED. Existing AccountingSyncMapping gains nullable connection, EditSequence/FullName/type, source version, enabled state and metadata. A partial unique index preserves legacy mappings. Source/ListID/TxnID uniqueness is per connection; deterministic request keys prevent duplicate jobs. Immutable request evidence and TimeSegment conflict triggers enforce accounting safety. BillMirror is staging, never a second cost ledger. ActualCost uses existing source/reversal fields.

## Productization additions

`202609280002_company_standards` adds CompanyTemplate, TemplateApplication and CostCatalogItem, four capabilities, project setup-default snapshots and company province/markup defaults. `202609280003_standards_safety` adds ProjectSpecification with explicit client visibility and optimistic version. Existing ledger, accounting, approval and portal grants are untouched. TemplateApplication stores the applied version/content and unique request key; project copies are independent. Catalog costs use Decimal(18,4). No example production data is seeded.

## Client display preferences

Migration 202609290001_client_vision adds CLIENT_PREVIEW and ClientTaxDisplayMode. Settings has nonnullable clientTaxDisplayMode (FINAL_TOTAL_ONLY), clientFinancialSummaryEnabled (true), clientManagerVisible (false); Project has nullable overrides. Null means inherit the current company default. No historical financial values or snapshots are rewritten; displayed contract amounts derive from accepted proposal tax evidence and normalized contract adjustments.
