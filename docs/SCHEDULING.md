# Scheduling V1

Phase 5 publishing is explicit: clientVisible, clientTitle and clientDescription provide a dedicated safe projection of dates/status/milestones. Internal names/descriptions/assignees never fall back into the client schedule. Project → Clients controls publishing with CLIENT_CONTENT_PUBLISH and previews the result.

`ProjectTask` is the dated project-schedule entity. It supports planned and actual dates, status, milestone flag, manual ordering, archival, creator, and multiple internal or contact assignees. External contacts do not require authentication.

Dependencies are separate `ProjectTaskDependency` records with Finish-to-Start, Start-to-Start, Finish-to-Finish, and Start-to-Finish types plus lag days. The service prevents self-dependencies and graph cycles. Dependencies never shift dates automatically; the application exposes constraints without silently rewriting the project schedule.

Schedule V1 provides a responsive list/card view, filtering, create/edit, completion, archival, assignments, and a predecessor indicator. A true Gantt/critical-path engine is deferred until real Cedar Winds scheduling use establishes calculation and baseline requirements.

## Productization

Company schedule templates use validated relative calendar-day offsets and finish-to-start predecessor/lag calculation at copy time. Captured schedules preserve supported dependencies; unsupported graphs are explicitly rejected rather than flattened. Tasks default private, with team-role assignment resolved to the new project's assigned internal users. Internal UI adds a timeline, inline status, and selected-task date/status actions. Date shifts affect only selected records, retain dependency edges and publish an audit event. There is no critical-path or automatic work-week rescheduling engine.
