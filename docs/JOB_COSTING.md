# Job Costing

The report groups actual system records by Cost Code and Cost Type and shows Original Budget, Current Budget, remaining Committed, Actual, Forecast, and Variance. Original and current budgets are separate immutable `BudgetVersion` snapshots created from accepted estimate cost—not client price.

Remaining committed equals committed less consumed. Actual costs linked to commitment lines must increment consumption in the same Phase 4 transaction, preventing an invoiced portion from being counted twice. Current Phase 3 manual actuals are explicitly sourced `MANUAL`, capability-restricted, and audited.

Forecast per row is `max(current budget, actual + remaining commitment + forecast adjustment)`. Variance is current budget minus forecast, so a negative result is an overrun. Contract value minus forecast produces forecast gross profit; forecast margin divides that profit by contract value. Tax is excluded from internal cost and profit.

Approved time already accepts explicit Cost Code classification, but Phase 3 does not invent wages or burden. A future protected employee costing-rate history will generate labour ActualCost entries without exposing payroll compensation to ordinary PM or field views.
