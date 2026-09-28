# Company templates

Templates is an internal top-level workspace. CompanyTemplate supports PROJECT, ESTIMATE, SCHEDULE, SELECTION, PROPOSAL, SCOPE, ASSEMBLY, DAILY_LOG and COMMUNICATION. Validated typed JSON contains reusable content, not a financial ledger. Editing uses an expected version and audited serializable transaction; archive prevents future use while preserving existing copies.

Project templates can bundle saved non-project templates. References are resolved and copied when the bundle is saved. Use unique task keys across bundled schedules. A project setup transaction creates the project, explicit staff/client associations, draft estimate sections/lines, private tasks/dependencies, draft selections/options and a TemplateApplication snapshot. No portal invitation, publication, approval, budget, commitment, actual, time or accounting mapping is copied or created.

TemplateApplication preserves template version, content snapshot, actor, project, time and unique application request key. Concurrent retries of the same application do not duplicate items. Changing a standard does not propagate to projects. Reapplying deliberately uses a new request key and appends content; it does not merge existing items.

## Schedule rules

Calendar-day offsets use project start, with inclusive start and an elapsed duration in days. Milestones have zero duration. Finish-to-start dependencies use predecessor finish plus lag; dependency order in the template does not matter. Missing keys, duplicate keys and cycles are rejected. Capturing a schedule with multiple predecessors or non-finish-to-start links is blocked rather than silently losing dependencies. Client and trade publishing and named assignees are not inherited.

## Capture and selective use

Project schedule, latest estimate revision, selection sheet and proposal wording can be captured for review before saving. Capture excludes client identities, passwords, attachments, messages, decision/approval evidence, actual costs, commitments and accounting records. Free-form wording can still contain project-specific language: staff must review it before saving.

Estimate use supports selected items/sections and repeated additions from different templates. Assembly line quantity is a per-base-unit factor; entered base quantity multiplies it with Decimal arithmetic and four-place rounding. Locked estimate revisions cannot receive template/catalog edits.

Project duplication uses the same validated capture/copy pipeline for explicitly selected structures. It does not transfer the original client/team, financial history or portal access. The new manager and creator receive explicit project assignments.

Proposal structure is the existing supported introduction/scope/exclusions/assumptions/terms format. Scope templates populate PO/WO scope/terms only. Company folder names are retained as a project setup checklist, not storage directories. Template defaults never publish project content automatically.

Estimate, schedule and selection-sheet CSV headings are downloadable in the editor. Preview reports row errors and schedule-graph problems; reviewed rows are added to the editor and are not persisted until Save. Project templates may require internal team roles; setup validates members and resolves task assignee roles. Specifications are reusable information-only items, copied privately and published separately.
