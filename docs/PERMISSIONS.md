# Permissions

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

`PROJECT_VIEW_ASSIGNED` means a user must have a `ProjectAssignment` or a retained legacy time assignment. Client and trade access will additionally require a linked contact/company and a portal-specific project authorization. Financial, payroll, internal-note, and cross-project fields must never be selected into portal DTOs.

Every Phase 2 operation checks both a capability and `requireProjectAccess`. Notifications are always restricted by `userId`; file retrieval checks `FILE_VIEW_INTERNAL` and project scope before reading bytes. UI capability checks improve navigation but are never the authorization boundary.

## Remaining role checks

Roles remain legitimate for clock modes (`SHOP`, `SITE`, `OFFICE`) and for the Owner-only accounting-export override/Owner-role escalation invariant. The legacy locate/report controller-clock-in rule and PM employee/project intersection still use role context because they encode timekeeping workflow, not generic application access. Administration, imports, QR management, project operations, daily logs, files, and normal time approval now enter through capabilities.
