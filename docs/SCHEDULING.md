# Scheduling V1

Phase 5 publishing is explicit: clientVisible, clientTitle and clientDescription provide a dedicated safe projection of dates/status/milestones. Internal names/descriptions/assignees never fall back into the client schedule. Project → Clients controls publishing with CLIENT_CONTENT_PUBLISH and previews the result.

`ProjectTask` is the dated project-schedule entity. It supports planned and actual dates, status, milestone flag, manual ordering, archival, creator, and multiple internal or contact assignees. External contacts do not require authentication.

Dependencies are separate `ProjectTaskDependency` records with Finish-to-Start, Start-to-Start, Finish-to-Finish, and Start-to-Finish types plus lag days. The service prevents self-dependencies and graph cycles. Dependencies never shift dates automatically; the application exposes constraints without silently rewriting the project schedule.

Schedule V1 provides a responsive list/card view, filtering, create/edit, completion, archival, assignments, and a predecessor indicator. A true Gantt/critical-path engine is deferred until real Cedar Winds scheduling use establishes calculation and baseline requirements.
