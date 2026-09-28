# Permissions

Phase 7.5 reuses QUICKBOOKS_VIEW/CONFIGURE/QUEUE/RECONCILE plus ACTUAL_COST_RECONCILE and project authorization. Preview and run diagnostics stay behind accounting capabilities. Manual Bill allocation, unlink, hold/reversal and restore require reasons and audit records; QB actuals cannot bypass these through generic ActualCost reconciliation. Only OWNER may override incomplete pilot exit evidence, additionally requiring CONFIGURE, explicit activation and a reason. The override does not claim live validation. Client/trade accounts remain denied.

## Decision

Roles provide baseline capability bundles. `UserCapability` provides explicit per-user allow or deny overrides. Server code calls `requireCapability`; hardcoded role checks remain only in legacy time/admin paths until migrated.

## Roles

Business roles are `OWNER`, `CONTROLLER`, `PROJECT_MANAGER`, `ESTIMATOR`, `DESIGNER`, `OFFICE`, `FIELD`, `SHOP`, `CLIENT`, `SUBTRADE`, and `VENDOR`. Legacy `PM`, `SITE`, and `ADMIN` remain temporarily for compatible accounts and are mapped to equivalent permissions.

## Capabilities

Project: `PROJECT_VIEW_ALL`, `PROJECT_VIEW_ASSIGNED`, `PROJECT_CREATE`, `PROJECT_EDIT`, `PROJECT_FINANCIALS_VIEW`, `PROJECT_FINANCIALS_EDIT`.

Time: `TIME_CLOCK`, `TIME_EDIT`, `TIME_APPROVE`.

Operations: `PROJECT_ASSIGN`, `PROJECT_CONTACT_MANAGE`, `PROJECT_SCHEDULE_EDIT`, `DAILY_LOG_CREATE`, `DAILY_LOG_EDIT`, `FILE_UPLOAD`, `FILE_VIEW_INTERNAL`, `CONTACT_MANAGE`, and `NOTIFICATION_MANAGE`.

Restricted: `CLIENT_PORTAL_ACCESS`, `ACCOUNTING_ACCESS`, `SETTINGS_MANAGE`.

## Scope

`PROJECT_VIEW_ASSIGNED` requires a ProjectAssignment or retained legacy time assignment. Clients instead require explicit ClientProjectAccess linked to their Contact. Trades require explicit TradeProjectAccess and Contact-scoped record authorization. Financial, payroll, internal-note and cross-project fields must never enter portal DTOs.

Internal operations check capabilities and requireProjectAccess. Notifications are restricted by userId. Internal downloads require FILE_VIEW_INTERNAL and project scope; client downloads require an active portal grant and CLIENT visibility. UI checks are never the authorization boundary.

## Remaining role checks

Roles remain legitimate for clock modes (`SHOP`, `SITE`, `OFFICE`) and for the Owner-only accounting-export override/Owner-role escalation invariant. The legacy locate/report controller-clock-in rule and PM employee/project intersection still use role context because they encode timekeeping workflow, not generic application access. Administration, imports, QR management, project operations, daily logs, files, and normal time approval now enter through capabilities.

## Financial capabilities

Financial authorization uses `COST_CODE_VIEW`, `COST_CODE_MANAGE`, `ESTIMATE_VIEW`, `ESTIMATE_CREATE`, `ESTIMATE_EDIT`, `ESTIMATE_APPROVE_INTERNAL`, `PROPOSAL_VIEW`, `PROPOSAL_CREATE`, `PROPOSAL_ISSUE`, `PROPOSAL_ACCEPT`, `BUDGET_VIEW`, `BUDGET_EDIT`, `JOB_COST_VIEW`, `ACTUAL_COST_VIEW`, `ACTUAL_COST_MANAGE`, and `FINANCIAL_MARGIN_VIEW`. Owner receives all capabilities. Controller receives broad accounting/job-cost access. Estimator receives estimate/proposal and margin access. PM receives assigned-project financial reporting without accounting mutation or margin access. Field, shop, clients, and trades receive no financial capabilities.

## Phase 4 capabilities

## Phase 5 capabilities and client boundary

Internal capabilities are CLIENT_ACCESS_MANAGE, CLIENT_CONTENT_PUBLISH, SELECTION_VIEW, SELECTION_CREATE, SELECTION_EDIT, SELECTION_PUBLISH, SELECTION_APPROVE_INTERNAL, CLIENT_MESSAGE_VIEW and CLIENT_MESSAGE_SEND. Owner receives all; Admin, Controller, PM and Project Manager receive this bundle subject to existing project scope. Estimator receives selection view/create/edit. Field, Shop, Client and trades gain none. Internal overrides remain available.

CLIENT is a separate restricted identity: no internal capability can be granted through an override or mixed role bundle. Dedicated portal authorization additionally requires exactly the CLIENT role, active contact/user/project and an explicit active ClientProjectAccess grant. Issued CO approval also requires the revision's named client Contact. All portal/file endpoints enforce this on the server; internal API paths are denied before dispatch. Client content is selected through allowlisted DTOs and never receives internal ledgers or margins.

## Phase 4 purchasing capability details

PO and WO independently use `PURCHASE_ORDER_*` and `WORK_ORDER_*` VIEW/CREATE/EDIT/APPROVE/ISSUE capabilities. CO uses CHANGE_ORDER_VIEW/CREATE/EDIT/APPROVE_INTERNAL/ISSUE/ACCEPT. Ledgers use COMMITMENT_VIEW, COMMITMENT_MANAGE and ACTUAL_COST_RECONCILE in addition to existing ACTUAL_COST_VIEW/MANAGE. Reversal requires ACTUAL_COST_RECONCILE plus project access and a reason. Cancelling an issued purchasing family requires its APPROVE capability and COMMITMENT_MANAGE. Attachment selection additionally requires FILE_VIEW_INTERNAL.

Owner has all. Controller has full purchasing/CO approval and ledger reconciliation. PM/PROJECT_MANAGER has assigned-project PO/WO/CO view/create/edit and commitment view, but no default issuing/approval/acceptance or reconciliation. Estimator has CO view/create/edit/internal approval. Office gains no default financial powers; targeted overrides can grant limited operations. Field, Shop, Client, Subtrade and Vendor gain no purchasing capabilities. Grants/denials continue to override role bundles; every service enforces project scope. Generic activity omits financial audit payloads, and project DTOs hide baseline contract from readers without PROJECT_FINANCIALS_VIEW.

## Phase 6 trade boundary

SUBTRADE/VENDOR have zero internal capabilities, including when an override or mixed external role would otherwise grant them. Portal access requires exactly one compatible external role, a deliberately linked active Contact, active project/company and explicit active TradeProjectAccess. Project access is necessary but record-level Contact scope is also mandatory. Company membership grants no additional visibility. Client and trade route guards and dispatchers reject the other identity.

Internal capabilities: TRADE_ACCESS_MANAGE, TRADE_CONTENT_PUBLISH, SITE_INSTRUCTION_VIEW/CREATE/ISSUE, DEFICIENCY_VIEW/CREATE/ASSIGN/VERIFY, TRADE_MESSAGE_VIEW/SEND. OWNER receives all; PM/PROJECT_MANAGER and CONTROLLER receive this operational bundle subject to existing project scope. ADMIN/OFFICE/FIELD receive no new bundle by default; explicit internal overrides may be configured. Purchasing visibility and issue/approval retain their separate Phase 4 capabilities. Internal Trades sections enforce their own read capabilities. External actions use dedicated grant/record authorization, never internal capability bundles.

## Phase 7 accounting capabilities

QUICKBOOKS_VIEW, QUICKBOOKS_CONFIGURE, QUICKBOOKS_MAP, QUICKBOOKS_QUEUE and QUICKBOOKS_RECONCILE are bundled for OWNER and CONTROLLER. Internal overrides remain available; CLIENT/SUBTRADE/VENDOR identities cannot gain internal capabilities. Browser APIs enforce capabilities and the existing origin boundary. SOAP uses independent credentials and expiring tickets, never browser cookies. Bill application also requires ACTUAL_COST_RECONCILE and existing project access.

## Company standards

TEMPLATE_VIEW/TEMPLATE_MANAGE are bundled for Owner, Controller, Estimator, PM/Project Manager and Admin. COST_CATALOG_VIEW is bundled for those management roles; COST_CATALOG_MANAGE is for Owner, Controller and Estimator. Overrides still apply. Applying a template additionally requires each destination capability (ESTIMATE_EDIT/CREATE, PROJECT_SCHEDULE_EDIT, SELECTION_CREATE) and project access; template access does not bypass financial permissions. New project setup requires PROJECT_CREATE/PROJECT_ASSIGN; contact creation requires CONTACT_MANAGE and existing-client association requires PROJECT_CONTACT_MANAGE. External identities remain blocked before dispatch. Specifications use selection capabilities and require CLIENT_CONTENT_PUBLISH to publish or change published content. Client DTOs explicitly select only published specification identity/wording/date.
