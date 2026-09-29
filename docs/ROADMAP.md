# CWManagement Roadmap

## Phase 1 — Foundation (implemented)

Branding and scalable shell; project/contact/company model; flexible assignments; role-derived capabilities and overrides; project list/workspace; live dashboard; retained QR/mobile time capture and PM approval; additive migration; architecture documentation.

## Phase 2 — Project operations (implemented)

Meaningful project activity, project settings/relationships, Schedule V1 with dependencies and assignees, mobile daily logs, file/photo metadata and development storage, notification inbox, expanded capabilities, isolated PostgreSQL CI, and hierarchical cost-code foundation. Durable production object storage and automated due-date notification delivery remain follow-up deployment work.

## Phase 3 — Estimating and budget (implemented)

Cost-code administration/import, estimate and proposal snapshot revisions, print-ready proposal output, approved original/current budgets, commitment/actual ledgers, and Budget/Committed/Actual/Forecast/Variance reporting. Employee costing-rate configuration remains deferred until Cedar Winds defines protected rates and burden policy.

## Phase 4 — Purchasing and change management (implemented)

Shared PO/WO document families, immutable issued revisions, approvals, normalized commitments, atomic invoice consumption/reversal, controlled overage rejection, manually accepted COs, contract adjustments and budget snapshots, print output, scoped work queues and transactional/browser tests. Phase 5 adds credits and client approval. Phase 6 implements authenticated vendor receipt acknowledgements. Regulated electronic signatures and automatic document delivery remain follow-up work.

## Phase 5 — Selections and client portal (implemented)

Allowances and options, explicit client grants/invitations, allowlisted portal DTOs, published schedule/updates/files, immutable selection decisions, signed selection CO deltas, authenticated idempotent CO approval and scoped messaging are implemented. SMTP delivery uses existing configuration; production file storage, scheduled reminders and larger-history pagination remain follow-up work. Warranty remains later operational work.

## Phase 6 — Trade portal (implemented)

Separate Contact-scoped TradeProjectAccess, secure invitation/setup, mobile trade workspace, assigned/released schedule and structured conflict responses, exact-recipient PO/WO history and immutable receipts, explicitly shared documents, issued instructions, verified deficiencies, validated uploads and isolated trade conversations are implemented. Phase 5 client isolation remains independent. Production storage, scheduled reminders and broader company delegation remain follow-up work.

## Phase 7 - QuickBooks Desktop (implemented for documented scope; live validation pending)

Dedicated SOAP/QWC service, hashed credentials/tickets, discovery/company binding, PostgreSQL request evidence, operator mappings, zero-tax PO Add/reviewed Mod, approved TimeTrackingAdd and transactional Bill/ActualCost/commitment reconciliation are implemented with tests and an accounting dashboard. Work Orders remain local. [Supported scope and limits](QUICKBOOKS_DESKTOP.md): Canadian taxable PO mapping, deleted-Bill automation and unsupported Bill forms require follow-up before those workflows are production-ready. Complete the [live checklist](QUICKBOOKS_LIVE_VALIDATION.md) before claiming live compatibility.

## Productization Phase — Templates & UX

Company template library, project setup wizard/selective copy, relative schedules, estimate templates, catalog CSV/quick-add, assemblies, private selection/specification templates, proposal/scope wording, accepted-allowance conversion, company defaults, work queues/search/recent projects, inline estimating and schedule bulk/timeline controls are implemented locally. This is not Phase 8. See [Product UX audit](PRODUCT_UX_AUDIT.md), [Templates](TEMPLATES.md), [Cost catalog](COST_CATALOG.md) and [Product UX](PRODUCT_UX.md) for supported scope and remaining refinements. No production rollout is implied by local implementation.

## Productization ? HOW TO operating manual

Internal searchable help, separate client/trade help, contextual workspace links, role-aware starting guides and printable manuals describe current supported workflows. Content maintenance is documented in [HELP_CONTENT.md](HELP_CONTENT.md). This is not Phase 8 and does not change financial or portal authorization.

## Phase 8 — Reporting and automation

**Not started.** Phase 7.5 adds [controlled live validation](QUICKBOOKS_PILOT.md): pilot allowlists, pause, pre-flight, reviewed imports/reversals, append-only test results and guarded activation. Actual Cedar Winds live validation remains pending; automated tests do not change that status.

Close Phase 7 live-validation and tax/deletion gaps first. Then extend normalized portfolio reports and management dashboards; warranty/service operations through portal/file/message boundaries; scheduled selection/trade/connector reminders with durable deduplication; workflow automation; production hardening, monitoring, retention and recovery; and audited CoConstruct migration/retirement tools.
