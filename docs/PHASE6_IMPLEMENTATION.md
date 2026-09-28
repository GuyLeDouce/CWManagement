# Phase 6 implementation report

## Current repository reviewed

Started from the clean local `main` at `13b82df` (Phase 5), with Phase 4 and financial-backbone commits already present. Local source, schema, migrations, tests, installed Next.js 16.3.5 guides and `/docs` were the baseline; remote state was not used as a substitute. Reviewed authentication/tokens, Contact/Company/ProjectContact, capabilities, purchasing/commitments, client projections/approvals, schedule, files, messages, notifications and project UI. Before major changes, lint, typecheck, 71 unit tests, 56 integration tests and the production build passed.

## Phase 5 architecture reused

Existing User/Session/ActionToken, Contact.portalUserId, serializable transactions/retries, protected downloads, immutable evidence pattern, Conversation/ProjectMessage/ConversationRead, Notification and SMTP service. Trade projections and authorization are independent of client services. Existing client tests still pass.

## Trade identity model

No duplicate vendor entity. User has exactly SUBTRADE or VENDOR; Contact represents the deliberate external identity and optionally belongs to Company. Company affiliation never grants access to coworkers' records. Mixed external/internal roles are denied; linked external account roles cannot be casually converted in staff administration.

## Trade Project authorization

TradeProjectAccess explicitly records project/user/contact, inviter, invited/accepted/revoked dates and active state. Every operation requires active user/contact/company/project and matching portal identity. Record scope further limits exact recipient/assignee/share. Revocation is enforced on the next request.

## Invitation/account setup

Project → Trades supports invite/resend/revoke/reactivate using existing project Contacts. New users receive secure single-use password setup; existing linked users receive a sign-in link. Email collisions are rejected for administrative resolution. No passwords or tokens enter audit records. Failed email leaves authoritative grants/inbox records intact.

## Portal routing/layout

Dedicated `/trade` chooser and `/trade/projects/[projectId]/[section]`, own header/navigation, mobile cards and network-confirmed actions. Separate `/api/trade/*`, upload handler and internal `/api/trade-management/*`. Internal routes redirect external identities to the appropriate portal; API access is denied before internal dispatch.

## Trade Home

Project/site address, primary PM work contact, outstanding work/instruction receipts, open deficiencies, upcoming work, unread conversation count and targeted recent notices. No contract value, client decisions, raw activity log or job-cost health.

## Trade Schedule

Existing ProjectTask/ProjectTaskAssignee plus explicit TradeTaskRelease. Contact assignment or release grants visibility; safe title/description, dates, milestone and status only. Client publishing fields are independent. Internal descriptions and other assignees never enter trade responses.

## Schedule response/conflict architecture

TradeScheduleResponse stores CONFIRMED/CONFLICT/QUESTION, comment, displayed schedule snapshot, request key and resolution. Original evidence is immutable; request retries are idempotent. Staff records resolution and separately edits authoritative dates if appropriate. Trade never changes master schedule dates.

## PO/WO exposure

Existing PurchasingDocument/Revision/Line remain authoritative. Exact vendorContactId and active project grant are required. Only issued history is exposed; draft/internal review/approved-but-unissued work is private. Allowlisted snapshot parser exposes agreed own pricing and scope, omitting client CO links, markups, budgets, commitments and actual costs.

## Purchasing acknowledgement

TradeAcknowledgement stores source revision, project, user, Contact, typed name, action, timestamp, displayed safe snapshot and SHA-256 hash. Unique source/contact plus serializable retry yields one immutable receipt under concurrent requests. PurchasingRevision.acknowledgedAt is a summary only. Superseded/cancelled history remains readable; it cannot receive a new active receipt. Newly issued revisions need fresh acknowledgement. No ledger changes occur.

## Document/drawing access

StoredFile retains protected byte streaming. TRADE classification also requires exact explicit share or same uploader Contact. Revision label, upload date and filename are visible; storage keys are not. Issued purchasing/instruction attachments are shared and locked for recipients. Database triggers retain evidence against archive, reclassification, edits or removal of shares. Replacement drawings use new files.

## Site Instruction architecture

Settings-numbered SiteInstruction with explicit recipients, safe/internal wording, optional task/purchasing context and attachments. Drafts can be edited; issuance snapshots content. Issued content/recipients are database-immutable. Substantive changes use a new numbered replacement linked by replacesId; staff explicitly closes/cancels the predecessor. Per-recipient receipts aggregate to ACKNOWLEDGED. Instructions never authorize additional cost automatically.

## Deficiency architecture

Settings-numbered Deficiency supports location, priority, due date, exact trade assignment, private notes and evidence. Trade starts work or marks READY_FOR_REVIEW; only staff verifies/closes or reopens with a comment. Optimistic versions prevent stale transitions. Immutable DeficiencyUpdate records preserve history. Moving an already assigned deficiency to a different trade is deliberately rejected to protect previous discussions/evidence; use a replacement item.

## Trade uploads

Existing StorageService, opaque keys, StoredFile with TRADE_UPLOAD origin and uploader Contact. Project/record authorization is checked before bytes and in the metadata transaction. JPEG/PNG/WebP/PDF require matching signatures/MIME/extensions, safe filenames and size limits. Failed metadata writes remove bytes. Optional PO/WO, instruction or deficiency context is validated. Completion evidence remains associated and protected.

## Trade messaging

ConversationAudience.TRADE requires one exact Contact. Existing message/read tables are reused, with immutable attachments and optional authorized operational context. Trade cannot read/post to another trade, CLIENT or INTERNAL conversation. Staff uses separate trade message capabilities/project scope. Client/internal message service explicitly excludes trade threads.

## Notifications/email

Transactional inbox events for invitations, issued/revised work, schedule assignments/changes/releases, instructions, deficiency changes, shared files, messages and resolved schedule requests. Generic portal-link emails run best effort after commit through existing SMTP. Internal capability-scoped inbox/activity records cover receipts, conflicts, uploads, messages and review requests. Reads do not emit events. Scheduled reminders/reliable email retry remain deferred.

## Internal trade management

Project → Trades shows Contact/company, invitation/access state, work receipt queue, instructions, deficiencies, completion evidence, file shares, schedule release/responses and messaging. Existing purchasing/contact/schedule editors remain authoritative. Internal section reads and every mutation enforce capabilities and project scope.

## Trade-safe DTO architecture

Explicit Prisma selects, mapping functions and recursive Zod snapshot stripping define the portal boundary. Browser types derive from the safe service return type. No internal Prisma object or UI-hidden financial payload is passed to portal components. Work unitCost is deliberately projected as the recipient's unitPrice. Snapshot hashes refer to safe displayed content.

## Client/trade isolation

CLIENT cannot enter Trade Portal/API; SUBTRADE/VENDOR cannot enter Client Portal/API. External users cannot enter `/desktop`, internal project endpoints or legacy dispatcher actions. Mixed roles/overrides cannot bypass these restrictions. Existing client financial approval/reconciliation tests remain green.

## Cross-trade isolation

Tests use two Contacts in the same Company/project and a third in another project. Purchasing, schedule, instructions, deficiencies, files, uploads and messages remain Contact-scoped. Knowledge of project, record, conversation or file IDs grants no access. Company membership does not broaden authorization.

## Prisma changes

New models: TradeProjectAccess, TradeTaskRelease, TradeScheduleResponse, TradeFileShare, SiteInstruction, SiteInstructionRecipient, TradeAcknowledgement, Deficiency and DeficiencyUpdate. New enums: FileOrigin, InstructionStatus, DeficiencyStatus and TradeResponseType; ConversationAudience adds TRADE. Added safe task fields, StoredFile origin/revision/context, Conversation trade context, ProjectMessage attachment IDs, numbering settings and relations. Existing financial ledger arithmetic/models remain unchanged.

## Migrations created

`202609240003_trade_portal`: additive schema, uniqueness/FKs/checks and immutable-evidence triggers. Successfully applied from an empty isolated database and as an upgrade to the populated Phase 5 test database. No reset/db-push or production migration was performed.

## Capabilities added

TRADE_ACCESS_MANAGE, TRADE_CONTENT_PUBLISH, SITE_INSTRUCTION_VIEW, SITE_INSTRUCTION_CREATE, SITE_INSTRUCTION_ISSUE, DEFICIENCY_VIEW, DEFICIENCY_CREATE, DEFICIENCY_ASSIGN, DEFICIENCY_VERIFY, TRADE_MESSAGE_VIEW, TRADE_MESSAGE_SEND. OWNER has all; PM/PROJECT_MANAGER and CONTROLLER receive the operational bundle with existing project scope. Other internal roles require explicit overrides. External roles receive no internal capabilities. Purchasing approval/issue capabilities remain separate.

## Audit/activity changes

Safe project events record invitations/grants/revocation, receipts, schedule responses/resolutions/publication, instruction drafts/issue/close/cancel, deficiency transitions, file sharing/uploads and messages. Generic descriptions omit financial internals; password/setup tokens are never audited. Trade Home uses its own projections and notices, not raw AuditLog.

## Tests added

4 unit tests: nested financial projection stripping, instruction stripping, deterministic evidence hashes, upload content/path checks and external role isolation. 11 integration workflows: secure invitation/setup, identity collision, active/revoked grants, role/project/cross-trade isolation, forbidden DTO fields, purchasing visibility/revision history, concurrent immutable receipts, assigned schedule conflicts, immutable instruction receipts, deficiency verification/upload evidence, guessed files, message isolation and staff scope. Tests are included in existing npm scripts and PostgreSQL CI.

## E2E workflow

Staff invites an existing trade and issues two separate trades' Work Orders, creates/issues an instruction and assigns a deficiency. A mobile trade logs in, sees only its own work/schedule, acknowledges work/instruction, reports a conflict, uploads a completion photo, submits Ready for review and messages staff. Staff sees the receipt/message and verifies/closes the deficiency. The same test checks forbidden DTO fields, direct unauthorized API/file requests and client/trade/internal route separation. All existing browser workflows remain included.

## Documentation updated

ARCHITECTURE, DATABASE, PERMISSIONS, ROADMAP, STORAGE, ACCOUNTING, PURCHASING, CLIENT_PORTAL, CLIENT_COMMUNICATION and README. Added TRADE_PORTAL, SITE_INSTRUCTIONS, DEFICIENCIES and this report. Roadmap marks Phase 6 implemented. Local upload artifacts are ignored by Git.

## Validation results

| Check             | Actual result                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| Prisma format     | Passed                                                                                                |
| Prisma validate   | Passed                                                                                                |
| Prisma generate   | Passed                                                                                                |
| Migrations        | Fresh database passed; populated Phase 5 upgrade passed; no pending migrations on final test database |
| Lint              | Passed                                                                                                |
| Typecheck         | Passed                                                                                                |
| Unit tests        | 75 passed                                                                                             |
| Integration tests | 67 passed                                                                                             |
| E2E               | 10 passed, Chromium; new trade workflow uses a 390×844 viewport                                       |
| Production build  | Passed; includes dedicated trade routes and protected upload handler                                  |

The existing Prisma package.json configuration deprecation notice remains; it is not a failure. Browser tests used local development storage and the development email provider, not live SMTP delivery.

## New environment variables

None.

## Railway deployment notes

Back up and stage the additive migration; existing predeploy `npm run db:migrate` applies it. Build/start configuration is unchanged. Keep existing APP_URL, APP_SECRET, DATABASE_URL and SMTP configuration. Explicitly grant trade access and review TRADE file classifications/recipients before invitations. Production uploads/downloads still require a durable StorageService adapter; local filesystem storage is deliberately disabled in production. No production deploy or external email was performed during implementation.

## Known limitations

- Durable production object storage remains an existing deployment prerequisite. Signature checks are not malware scanning.
- Email is best effort; scheduled deadline reminders and a persistent retry outbox are not implemented.
- The initial instruction form chooses one recipient; services/schema support multiple. Existing assigned deficiencies cannot transfer to a different Contact; create a replacement.
- Instruction replacements preserve both records; staff deliberately closes/cancels the preceding instruction.
- File revision metadata and retained historical files are basic document control, not drawing markup/transmittals. Acknowledgement records receipt, not regulated signing or authorization of extra cost.
- Large histories need future pagination. No offline mutation queue, company-wide delegation, binding trade change requests, warranty or QuickBooks synchronization was built.

## Recommended Phase 7 — QuickBooks Desktop

1. Add authenticated Web Connector transport and durable request/result queues with retries, idempotency and operator-managed secrets.
2. Map QuickBooks Customer:Job to existing Project and retain external mapping history.
3. Map Vendor to existing Company/Contact, independent of portal-user identity and access grants.
4. Map Employee to internal User/employee records, keeping payroll data out of portals.
5. Map Item to hierarchical CostCode and CostCodeType; validate Cedar Winds' code structure before bulk synchronization.
6. Synchronize approved/issued PO/WO revisions using PurchasingDocument source identity and stable commitment line keys. Trade receipts remain local immutable evidence.
7. Synchronize approved Time module entries with stable external idempotency keys.
8. Import bills/ActualCost through existing atomic commitment consumption and reversal services, preserving remaining commitment plus actual exposure.
9. Build reconciliation/error queues for mismatched codes/vendors/projects, overages and retries; never silently overconsume or duplicate actuals.
10. Add a capability-protected operator sync dashboard and reconciliation reports. QuickBooks Desktop remains accounting system of record; CWManagement retains operational project history.
