# Productization — Templates & UX

This work sits between Phase 7.5 and future Phase 8. It improves existing operational entry rather than introducing accounting or portfolio analytics.

## Main workflows

1. Templates: create standards or capture reviewed project structures. Keep prices, wording and schedules grounded in Cedar Winds' actual practices.
2. Projects → New project: choose/create client, identify project, assign PM, set dates, choose project template or selected structure from an existing project, review and create atomically.
3. Estimate: use selected template items, add assemblies by base quantity, search the catalog, edit quantity/cost/markup inline, then save a row with optimistic version checking. Published financial records still require new revisions.
4. Schedule: copy relative tasks/dependencies, view the timeline, change status inline, or select tasks for a deliberate date shift. Moving dates does not automatically cascade to unselected tasks.
5. Selections: start with private drafts from a template. After a proposal is accepted, create source-linked allowance selections without retyping contractual values. Publication and client decisions retain the existing Phase 5 workflow.

Dashboard and My Work aggregate accessible tasks, selection follow-up, deficiencies ready for review and the current user's notifications. My Work limits the task list to the current user's assignments; project-level decision/review queues remain visible where authorized rather than falsely claiming personal ownership. Search uses project scope and capability-gated contacts, purchasing numbers, Change Orders, selections and documents. Recent projects store only IDs in session storage and resolve names through authorized project queries. It does not search raw audit data or portal-private payloads.

## Deliberate limits

This is an initial substantial productization pass, not a claim that every management screen is polished. The library editor and selection forms need further density/keyboard refinement. Information-only specifications now support explicit client publishing; they are separate from financial approval records. Folder names are a checklist, not managed file folders. No critical-path scheduling, drag-to-reschedule, workday calendar engine, live template propagation, automatic reminders, or Phase 8 functionality is added. Existing production uploads still require durable object storage.

## Product review — September 28, 2026

| Workflow         | Before                                          | After                                                                                                          |
| ---------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Project setup    | Blank project followed by separate manual entry | Guided client/PM/team/dates setup with a snapshotted project bundle or selective copy from an existing project |
| Estimating       | Repeated line dialogs and retyped prices        | Searchable catalog, selected template items, factor-based assemblies and explicit inline row saves             |
| Schedule setup   | Recreate dates and dependencies                 | Copy relative tasks and dependencies from a standard; adjust status inline or shift selected dates together    |
| Selections       | Separate financial allowance and decision entry | Private template drafts and source-linked selections from accepted estimate allowances                         |
| Repeated wording | Rewrite proposal and trade scope text           | Review captured proposal wording and reuse scope, daily-log and communication standards                        |

The next Productization pass should concentrate on estimator keyboard navigation, compact selection/trade editors, fuller proposal composition, managed document folders, and approval ownership in My Work. It should use Cedar Winds' real standards and staff feedback. Phase 8 remains future work.

## Executed local validation

- Prisma format, validate and generate passed.
- All 11 migrations applied successfully to a fresh isolated PostgreSQL test database; migration status reported up to date.
- Lint and standalone typecheck passed.
- 88 unit tests passed.
- 103 integration tests passed, including 12 new company-standards tests and existing financial/client/trade/accounting coverage.
- 33 focused QuickBooks tests passed (overlapping the unit/integration suites, not additional unique tests).
- All 13 browser workflows passed. The new workflow covers template-based project creation, catalog and assembly entry, inline estimate editing, schedule status and selection publishing.
- Production build passed; git whitespace validation passed.

Two migrations were added: `202609280002_company_standards` and `202609280003_standards_safety`. No new environment variables or package dependencies are required. This validation used local isolated databases, not Railway production. Production deployment and live QuickBooks validation are separate operations.
