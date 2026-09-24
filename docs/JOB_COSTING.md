# Job Costing

The report groups actual system records by Cost Code and Cost Type and shows Original Budget, Current Budget, remaining Committed, Actual, Forecast, and Variance. Original and current budgets are separate immutable `BudgetVersion` snapshots created from accepted estimate cost—not client price.

Remaining committed equals committed less consumed. Linked actual creation/reconciliation increments consumption in the same serializable transaction; reversal restores it. Manual actuals are explicitly sourced `MANUAL`, capability-restricted, and audited. Cancelled commitments contribute zero remaining exposure while their actual costs remain.

Forecast per row is `max(current budget, actual + remaining commitment + forecast adjustment)`. Variance is current budget minus forecast, so a negative result is an overrun. Contract value minus forecast produces forecast gross profit; forecast margin divides that profit by contract value. Tax is excluded from internal cost and profit.

Approved time already accepts explicit Cost Code classification, but Phase 3 does not invent wages or burden. A future protected employee costing-rate history will generate labour ActualCost entries without exposing payroll compensation to ordinary PM or field views.

## Phase 4 reporting

Job-cost reads use one serializable transaction for a consistent financial snapshot. Original/current budgets come from BudgetVersion; issued purchasing exposure comes from the normalized Commitment ledger, never directly from PO UI documents. Accepted COs contribute internal cost to the latest CHANGE_ORDER version. Summary now exposes Original Contract, Approved Change Orders, Current Contract, Original/Current Budget, Remaining Committed, Actual, Forecast and Variance. Current Contract = original Project.contractAmount + ContractAdjustment amounts. Forecast Profit/Margin remain gated by FINANCIAL_MARGIN_VIEW. Budget history lists immutable versions and their sources.

Project Overview provides concise purchasing/CO action counts. Global Financials adds scoped pending-document queues, remaining commitment, unreconciled actual counts, accepted CO totals and forecast-overrun links. An unlinked actual can be legitimate standalone cost; unreconciled does not automatically mean erroneous. No automated labour wages or burden are invented.
