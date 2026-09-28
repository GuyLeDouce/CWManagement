# Product UX audit — current local application

Reviewed the local Phase 1–7.5 services, schema, migrations, internal React workspaces, portal projections, and accounting controls before introducing company standards. The baseline lint, typecheck and 84 unit tests passed. This is a source/workflow audit; it is not a claim of user research or a visual review of every screen in production.

| Area                      | Finding before this pass                                     | Product response                                                                           |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Dashboard                 | Counts and recent activity, little direct follow-up          | Add scoped task/decision/notification work queue                                           |
| Projects / creation       | Large flat form, blank records, no reusable setup            | Guided client/team/dates/template wizard; selective existing-project copy                  |
| Overview                  | Useful existing operations summaries but sparse identity     | Persistent address/client header, retained financial capability checks                     |
| Schedule                  | One-task-at-a-time entry and edit dialog; global placeholder | Relative templates, saved schedules, timeline, inline status and bulk date/status updates  |
| Estimates                 | Empty general section; line modal; read-only rows            | Partial template imports, assemblies, catalog quick-add, editable rows and save-to-catalog |
| Proposals                 | Repeat introduction/scope/exclusions/terms                   | Wording library and save/review existing wording                                           |
| Budget                    | Established ledger report; manual context switching          | Preserve ledger; improve shared table readability without alternate report math            |
| Purchase / Work Orders    | Re-enter vendor scope every job                              | Saved scope/terms picker, existing approval and issue paths retained                       |
| Change Orders             | Large pricing editor                                         | Keep controlled financial workflow; dense line editor still needs dedicated pass           |
| Selections                | Allowance and selection entered separately; long editor      | Private template copies; accepted-estimate allowance conversion                            |
| Contacts                  | Mixed card directory                                         | Category filters alongside existing search/company editing                                 |
| Financials                | Primarily setup and financial queues                         | Catalog separated into first-class company library                                         |
| Client / Trade management | Operationally complete, long form stacks                     | Preserve independent data boundaries; dedicated usability pass still needed                |
| Time                      | Existing field-oriented clock and approval workflows         | Preserve tested capture/approval behavior                                                  |
| Settings                  | Company conventions mixed with time/admin settings           | Explicit company defaults and links to existing tax/numbering controls                     |
| Navigation                | Repeated project lookup; future module placeholders          | Templates, My Work, scoped global search; remaining placeholder routes documented          |
| Files / photos            | Flat category list; production storage unconfigured          | Folder standards stored as a setup checklist, not represented as actual managed folders    |

## Standards policy

No invented prices, legal terms, company schedules or real projects are seeded. Staff create/import standards or review captured project structure. Templates are draft starting points, never approvals, contracts, portal grants or accounting transactions.

## Remaining weaknesses

The shared library editor is functional but becomes wide for complex estimate assemblies. It needs real estimator feedback before claiming spreadsheet-grade productivity. Selection and trade-management forms remain long. Full calendar editing, multi-predecessor relative scheduling, managed folders, comprehensive approval assignment and richer proposal section composition remain separate gaps. The company library must not mask these as completed functionality.
