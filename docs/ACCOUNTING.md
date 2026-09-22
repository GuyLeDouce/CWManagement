# Accounting and QuickBooks Desktop

QuickBooks Desktop is authoritative for the general ledger. CWManagement owns project operations, approvals, budgets, commitments, time allocation, and job-cost context.

`AccountingSyncMapping` records the CW entity/type, QuickBooks ListID or TxnID, sync direction, status, last successful timestamp, and sanitized error. It does not contain credentials. Synced financial transactions become immutable; changes create revisions/reversals and another audit event.

The Web Connector integration is deferred to Phase 7. It will expose a narrowly authenticated qbXML service, queue work idempotently, record request/response metadata without sensitive payload logging, and reconcile customers/jobs, vendors, employees, items/cost codes, time, purchase orders, bills, and actual costs. Conflicts require deliberate operator resolution. QuickBooks credentials and connector secrets live only in deployment environment variables.

