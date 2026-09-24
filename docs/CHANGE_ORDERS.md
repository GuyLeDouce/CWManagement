# Change Orders

## Separate contract domain

ChangeOrder is a project-scoped numbered family; ChangeOrderRevision preserves client modifications independently of purchasing. A revision contains title, description/category, client scope, internal notes, client contact, terms, schedule impact in whole days, attachment references, internal pricing lines, tax, approval/issue metadata and acceptance evidence. Settings owns CO prefix/counter/default terms.

ChangeOrderLine reuses financial-math.ts: quantity × unit cost rounded half-up, then fixed or percentage markup on cost. Internal cost, pre-tax client price, tax and total remain distinct. Phase 5 extends CO-specific validators for signed cost/markup credits; quantities remain nonnegative. Estimate and purchasing validators remain unchanged.

## Lifecycle and history

DRAFT → INTERNAL_REVIEW → READY → ISSUED → ACCEPTED, with explicit REJECTED, VOID and SUPERSEDED states.

Only drafts are editable. Review/ready revisions can return to draft, clearing approval. Issue requires internal approval and an active client linked to the project. Ready, issued or rejected revisions can produce a new draft revision; the previous revision is superseded immediately and can no longer be accepted. Old issued snapshots and line content remain immutable at application and database levels.

Manual acceptance remains available to authorized staff with client name and evidence/reference; acceptedById identifies the recorder and acceptanceMethod is MANUAL. Phase 5 portal acceptance records the authenticated client, acceptanceMethod PORTAL and the immutable ClientApproval reference. These are distinct evidence sources.

Accepted revisions cannot be edited, revised, voided or accepted twice. Later additions use a separate Change Order. Reject/void requires a reason and never applies financial effects.

## Exactly-once financial application

Acceptance requires a recorded original project contract and exactly one active budget containing ORIGINAL and current versions. Missing/ambiguous budgets block acceptance; no invented baseline is created.

One serializable transaction:

1. Validates capability, project scope, lifecycle and optimistic version.
2. Creates ContractAdjustment linked uniquely to both ChangeOrder family and accepted revision, for the pre-tax client price.
3. Copies the latest current budget rows and adds internal expected cost grouped by Cost Code/Cost Type.
4. Creates a CHANGE_ORDER BudgetVersion linked uniquely to the revision.
5. Records acceptance, contract/budget events and notifications.

Original Budget lines are never updated. Project.contractAmount remains the original contract baseline and is locked by a database trigger once contract adjustments exist. Current Contract is baseline plus normalized ContractAdjustment amounts. Tax is excluded from contract revenue and internal budget.

A $20,000 expected-cost change sold for $27,000 adds $20,000 to Current Budget and $27,000 to Current Contract. Duplicate or concurrent acceptance cannot double-apply either effect. Financial reports read BudgetVersion, CommitmentLine, ActualCost and ContractAdjustment; they do not reconstruct exposure from document UI state.

## Snapshots and purchasing traceability

At issue, a client-safe JSON snapshot freezes company/project/client identity and addresses, scope, terms, client descriptions, quantities, client prices, tax, total, schedule impact and attachment references. Internal unit cost, markup, internal notes and margins are excluded from the printable snapshot. Database triggers protect issued revisions/lines and accepted content. An issued snapshot survives contact/company/project/settings edits.

PurchasingRevision.changeOrderRevisionId optionally references an issued/accepted CO from the same project. Creating or accepting a CO never automatically creates a PO or labour actual.

Project → Change Orders provides creation, draft pricing, history, approval, issue, manual acceptance, rejection/void and print. Project Overview and Financials expose scoped queues. Phase 5 adds authenticated client approval, allowances and selections; third-party electronic signatures remain deferred.

## Phase 5 credits and authenticated approval

CO quantities remain nonnegative, but cost and fixed markup can be signed to represent independent internal-cost and client-price credits. Shared Decimal calculations preserve negative HST. Acceptance rejects a negative resulting current cost-code budget or current contract. The original contract and ORIGINAL budget remain unchanged.

Selection variance creates a DRAFT CO only. The client price delta excludes the already contracted allowance and internal cost delta excludes its included cost baseline. Normal review/approve/issue workflow applies. Accepted linked COs move selections to APPROVED.

ClientApproval uniquely references an issued revision and stores authenticated user/contact, typed name, action, timestamp, allowlisted displayed snapshot and SHA-256 hash. Portal approval is named-client/project scoped and uses applyChangeOrderAcceptance in the same serializable transaction as evidence creation. Retries/concurrency cannot double-apply. Decline records evidence without ledger effects; a new revision may be issued. Manual acceptance remains capability-protected. See CLIENT_PORTAL.md.
