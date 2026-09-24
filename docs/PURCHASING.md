# Purchasing: Purchase Orders and Work Orders

## Identity and ownership

Purchasing uses existing Contact, Company, and ProjectContact records, not a separate Vendor table. Contacts support multiple types (VENDOR/SUBTRADE), independent contractors, company membership, email, phone, addresses, notes/responsibilities, and active status. The Contacts & Companies directory edits both record types. Purchasing selects a primary vendor contact and an optional billing contact from the same company. Other company contacts can represent estimating or trade coordination. ProjectContact retains project-specific business roles. Company.active and Contact.active are checked before drafting and issuing; existing historical documents remain available.

Company.quickBooksListId and AccountingSyncMapping remain future mapping anchors. No synchronization or vendor authentication is implemented.

## Documents and numbering

PurchasingDocument is the numbered project family, typed PURCHASE_ORDER or WORK_ORDER. Work Orders also represent subcontracts. PurchasingRevision owns title, scope, terms, vendor-visible/internal notes, expected date, vendor/billing contacts, optional project schedule task, optional issued/accepted CO reference, attachments, tax, issue/approval metadata, and lines. Settings maintains separate PO/WO prefixes and transactional counters; the browser never generates numbers.

PurchasingLine stores Cost Code and Cost Type, snapshotted code labels, quantity, unit, unit cost, rounded cost amount, tax flag, order, and optional internal notes. No client markup is applied. The editable line set is saved atomically with an optimistic revision version.

## Lifecycle

DRAFT → INTERNAL_REVIEW → APPROVED → ISSUED → PARTIALLY_FULFILLED → FULFILLED.

Review requires priced lines. Internal approval does not create exposure. Approved/review drafts may return to DRAFT, clearing approval. Issuance requires the appropriate issue capability. Issuance records a document state and produces a printable snapshot; it does not send an email or prove vendor delivery.

Only DRAFT content can be edited. Revising an approved/issued document creates the next numbered draft. Until replacement issuance, the previous issued commitment remains effective. Issuing the replacement supersedes the previous active revision. Revision history, issue identities, scope, pricing, project/vendor/company addresses, terms, and attachment references remain reproducible. Database triggers protect issued revisions and lines. Work Order acknowledgedAt is reserved for future trade acknowledgement; no portal action exists.

## Commitment integration

A unique Commitment.purchasingDocumentId gives each purchasing family one normalized Commitment. A stable PurchasingLine.lineKey maps to CommitmentLine.sourceLineKey, unique within the commitment. Issued costs, excluding recoverable tax, become committedAmount. Historical actuals always keep the same CommitmentLine ID.

A revision cannot change an existing ledger line's classification, reduce its amount below consumption, or remove a consumed line. Use a new line for different classification. Removed unconsumed lines are retained in the ledger with zero commitment. Vendor changes after first issue require cancellation and a new family.

Cancelling requires purchasing approval authority, a reason, and COMMITMENT_MANAGE if a commitment exists. It cancels the entire family, including any replacement draft, and marks the ledger CANCELLED. Reports exclude its remaining exposure while keeping actual costs. Cancelled documents cannot reopen; cancelled-ledger reversals never reinstate commitment.

## Fulfillment and overages

ActualCost can optionally reference a CommitmentLine. Both new manual invoices and reconciliation of existing unlinked actuals check capability, project, cost code, cost type, active commitment, positive amount, and remaining value. Creating/linking the actual, increasing consumedAmount, updating fulfillment, and writing audit events occur in one serializable transaction.

Example: a $10,000 commitment with a $4,000 invoice reports $6,000 remaining committed plus $4,000 actual, not $14,000 exposure. Full consumption becomes FULFILLED. Concurrent invoices cannot exceed the commitment.

Overages are rejected. There is no override. Revise, approve, and issue the PO/WO before retrying. After financial rollback, the rejected action creates an in-app notice for the acting reconciler and an audit event, deduplicated while an unread overage notice exists for that user/line. Page reads never create notifications.

Manual actual reversal requires ACTUAL_COST_RECONCILE and a reason. It marks reversedAt/reversedById/reversalReason, subtracts consumption, recalculates fulfillment, and audits in the same transaction. Duplicate reversal is rejected. Imported actuals must be corrected through their future source system; no import/sync workflow is provided here.

## Workspace and documents

Project → Purchase Orders contains both document types, search/status filters, history, draft editor, internal review/approval, issue/revise/cancel, and print. The commitment/actual register records invoices, reconciles unlinked actuals, and reverses manual costs. Existing manual actual entry remains in Project → Budget.

Issued PO/WO HTML uses Cedar Winds/company branding, identities and addresses, scope, quantity/unit pricing, tax, total, terms, notes and attachment names. Print/Save as PDF reuses proposal document styles with repeated table headers and page-break rules. It excludes internal notes and unrelated project finances. Attachments reference existing immutable stored objects; PDFs do not embed attachment bytes. Production upload availability still depends on the Phase 2 durable-storage adapter.
