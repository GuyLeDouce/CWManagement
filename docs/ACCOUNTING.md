# Accounting and QuickBooks Desktop

QuickBooks Desktop is authoritative for the general ledger. CWManagement owns project operations, approvals, budgets, commitments, time allocation, and job-cost context.

`AccountingSyncMapping` records the CW entity/type, QuickBooks ListID or TxnID, sync direction, status, last successful timestamp, and sanitized error. It does not contain credentials. Synced financial transactions become immutable; changes create revisions/reversals and another audit event.

The Web Connector integration is deferred to Phase 7. It will expose a narrowly authenticated qbXML service, queue work idempotently, record request/response metadata without sensitive payload logging, and reconcile customers/jobs, vendors, employees, items/cost codes, time, purchase orders, bills, and actual costs. Conflicts require deliberate operator resolution. QuickBooks credentials and connector secrets live only in deployment environment variables.

## Cost-code decision

CWManagement uses one hierarchical `CostCode` table. A code has an unrestricted company code string, name, description, optional parent, type (`LABOUR`, `MATERIAL`, `SUBCONTRACT`, `EQUIPMENT`, or `OTHER`), sort order, active state, and optional QuickBooks ListID. This supports Cedar Winds codes—including suffix conventions such as labour `L`—without imposing an invented CSI format. Parent/child structure can represent sections and detailed codes when the source data supports it.

Three domains remain separate:

- `ProjectTask`: a dated schedule commitment, such as framing second-floor walls.
- `Task`: a reusable clocking activity, such as framing.
- `CostCode`: a financial classification, such as framing labour.

A time activity may have a default cost code, and each time segment may record an explicit cost code. The existing `AccountingCode` and `AccountingMapping` continue to support current exports during a deliberate Phase 3 mapping/migration; they are not automatically converted because Cedar Winds source-code semantics must be reviewed first.

## Phase 3 financial ledger

Internal estimated cost, client price, budget, remaining commitment, actual cost, and forecast are separate values. Money uses PostgreSQL Decimal; line cost and markup round half-up to cents before aggregation. Percentage markup means markup on cost, never target margin. Gross margin is `(client price - cost) / client price`. Tax is applied only to taxable included client-price lines using `Settings.taxRate`; it is not revenue or internal budget.

The initial forecast per Cost Code/Cost Type is `max(current budget, actual + remaining commitment + forecast adjustment)`. Remaining commitment is `committedAmount - consumedAmount`, so linked actuals do not double-count the original commitment. Phase 4 updates consumption transactionally when a manual invoice is linked or an existing actual is reconciled, and restores consumption on reversal.

QuickBooks remains ledger-authoritative. `ActualCost.externalSystem + sourceExternalId`, QuickBooks TxnID/EditSequence fields, and source types provide idempotent future imports into this normalized job-cost ledger.

## Purchasing and contract changes

Issued PO/WO revisions feed Commitment/CommitmentLine, excluding recoverable tax. Draft/approved documents have no exposure. Overage rejection requires purchasing revision, with no implicit override. Reversals preserve source actual rows and reconcile consumption. Accepted CO client price creates ContractAdjustment; estimated internal cost creates a new CHANGE_ORDER BudgetVersion. Project.contractAmount remains the original pre-tax contract. Tax is neither budget cost nor contract revenue here. No AP bills, AR, payroll, qbXML or connector services were added.
