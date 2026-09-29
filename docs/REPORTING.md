# Operational reporting

Reports is an internal capability-gated workspace with reusable user-owned filters, CSV and browser print. The report service checks REPORT_VIEW and the report-specific capability on every request. SavedReport stores filters, not result data or permissions. Exports contain only the authorized on-screen result. Formula-like CSV text is escaped; Decimal financial values remain strings.

Implemented families: projects; tasks/milestones; financial portfolio; cost codes; purchasing; Change Orders; selections; CRM pipeline; follow-ups; time segments; warranty; trade access; safe activity descriptions. Financial portfolio and cost codes call jobCost rather than build a second ledger. Profit/margin keys are omitted without FINANCIAL_MARGIN_VIEW. Purchasing documents additionally require their type-specific view capability. Time is constrained by existing segment scope and project scope; no wage, burden, overtime or payroll values are introduced.

Project queries start with projectScope. An explicitly supplied inaccessible project produces no rows; filters never expand scope. CRM uses its own owner/activity scope. The UI offers report/project/search/status/date/overdue/milestone filters, sortable columns, saved views and drill-through. Due/date filters apply to the displayed date field; financial snapshots are cumulative, not period accounting statements. Activity is limited to the latest 1,000 safe entries. Large-history pagination, pivoting, custom formulas, accounting-period reporting and richer grouped charts remain follow-up work.

Dashboard adds capability-scoped pipeline, service, schedule-target and QuickBooks exception cards, plus normalized portfolio forecasts where allowed. My Work adds owned CRM follow-ups and assigned service requests. These are operational queues, not a forecast of guaranteed sales or QuickBooks accounting statements.

Time can be grouped by project, employee, task or cost code; pipeline by stage, source or owner. Totals use Decimal arithmetic. Financial reports reject date/overdue filters rather than implying period accounting. Selection rows include immutable decision price and variance snapshots.
