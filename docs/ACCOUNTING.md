# Accounting and QuickBooks Desktop

Phase 7.5 adds a [controlled live pilot](QUICKBOOKS_PILOT.md). Discovery/pause never mutate the job-cost ledger. Pilot Bills require exact reviewed versions and allowlisted identities. Reasoned allocation/unlink/reversal remains within existing ActualCost/Commitment transactions; holds prevent reimport. Missing Job lines stay in reconciliation. No unrestricted synchronization or live validation has been performed.

QuickBooks Desktop is authoritative for the general ledger. CWManagement owns project operations, approvals, budgets, commitments, time allocation, and job-cost context.

`AccountingSyncMapping` records the CW entity/type, QuickBooks ListID or TxnID, sync direction, status, last successful timestamp, and sanitized error. It does not contain credentials. Synced financial transactions become immutable; changes create revisions/reversals and another audit event.

Phase 7 implements a dedicated Web Connector SOAP/qbXML service with persistent sessions/queue, explicit mappings and discovery-first activation. Connector passwords are database scrypt hashes with copy-once setup, not plaintext environment configuration. See [QuickBooks Desktop](QUICKBOOKS_DESKTOP.md) for supported directions, transactional Bill reconciliation and limitations. Live QuickBooks validation remains pending.

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

QuickBooks remains ledger-authoritative. `ActualCost.externalSystem + sourceExternalId`, QuickBooks TxnID/EditSequence fields, and source types provide idempotent versioned imports into this normalized job-cost ledger.

## Purchasing and contract changes

Phase 5 adds allowance/selection traceability, not another ledger. Allowance is already included in contract; only selected client price minus included allowance becomes draft CO selling price. Internal CO cost is selected cost minus included cost baseline. Zero price difference approves the selection without ledger changes. Negative deltas preserve signed HST and reduce current contract/budget only on CO acceptance. Acceptance rejects negative resulting budget allocations or contract value. Authenticated portal approval calls the same transactional financial acceptance function as staff. ORIGINAL values remain untouched.

Issued PO/WO revisions feed Commitment/CommitmentLine, excluding recoverable tax. Draft/approved documents have no exposure. Overage rejection requires purchasing revision, with no implicit override. Reversals preserve source actual rows and reconcile consumption. Accepted CO client price creates ContractAdjustment; estimated internal cost creates a new CHANGE_ORDER BudgetVersion. Project.contractAmount remains the original pre-tax contract. Tax is neither budget cost nor contract revenue here. Those purchasing/CO operations do not create AP bills, AR or payroll. Phase 7/7.5 separately implements the Web Connector/qbXML service and supported Bill imports described above.

## Phase 6 operational boundary

Trade acknowledgements, schedule responses, instructions, deficiency status, uploads and messages have no automatic ledger effect. A site instruction is not approval of extra cost. Trade proposed changes must be reviewed through existing purchasing revisions and client Change Orders. The portal projects only the recipient's agreed vendor price, never client revenue, budget, commitments, actuals, forecasts or margin. Phase 7 preserves this isolation; trades have no accounting administration capabilities.
