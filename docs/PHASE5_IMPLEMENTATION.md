# Phase 5 implementation report

Implemented and validated locally on September 24, 2026. No production deployment was performed during implementation.

## Local repository state reviewed

Started from a clean local main at e768cc6 (Phase 4), with Phase 1–3 commits present. Reviewed source-of-truth architecture, database, financial, purchasing, permissions, portal, scheduling, storage, notification and testing docs; schema and migration history; auth/session/email; dispatcher/file handlers; internal workspace; unit, integration and browser tests. Baseline lint/typecheck/build, 65 unit tests and 43 PostgreSQL integration tests passed before major changes.

## Phase 4 architecture detected

Shared PO/WO document revisions feed Commitment/CommitmentLine. Actual consumption/reversal and job-cost reporting already use normalized ledgers. CO acceptance creates ContractAdjustment and a CURRENT/CHANGE_ORDER budget version transactionally. Issued revisions and original contractual history are protected. These structures were retained, with a shared CO acceptance helper and signed-credit support added.

## Allowance architecture

First-class project Allowance records separate contractual client value from included internal cost. Cost-code/type, optional accepted estimate allowance line and original budget allocation retain traceability. The UI provides source selectors. Published allowances are immutable; one allowance can fund one selection to prevent double subtraction.

## Selection architecture

Selections have categories, wording, deadline, required flag, private notes, publication/version state, decisions and optional CO linkage. Staff can create/edit drafts, publish/unpublish undecided records, inspect decisions and close approved records. Confirmed decisions cannot be replaced or unpublished.

## Selection option architecture

Options include product details, quantity/unit, supplier reference, allocation, private cost/markup and server-calculated client price. Existing CLIENT StoredFile references provide photos/specifications; internal quotes are excluded. Published options cannot be overwritten.

## Selection financial logic

Shared Decimal/half-up calculations produce selected price minus included allowance. Tested 12,000 → 12,000 = 0; 14,500 = +2,500; 10,000 = -2,000. No allowance means full additional client price. Internal cost remains separate. Tax is applied to the CO delta, not the already included allowance.

## Selection → Change Order behavior

A nonzero confirmed decision atomically creates a draft Phase 4 CO, with independent selling-price and internal-cost deltas. It has no immediate contract, budget or commitment effect. Existing internal review/approval/issue applies, then client or authorized staff acceptance. Zero price difference approves without ledger mutation. Signed credits cannot make a budget allocation or current contract negative.

## Client identity architecture

Uses existing User, hashed Session/ActionToken and Contact.portalUserId, now protected by a foreign key. Clients require a dedicated CLIENT account; matching an unrelated email never silently links accounts.

## Client Project authorization

ClientProjectAccess explicitly records project/user/contact grants, inviter, invitation, acceptance and revocation. Active user/contact/project and matching active grant are checked on every portal request and download. Merely creating a contact never grants access.

## Invitation/account setup workflow

Project → Clients supports invite/resend/revoke/reactivate. First invitation creates a passwordless account and sends a single-use 30-minute setup link. Linked users reuse their account for further projects. Successful login records first acceptance. SMTP failures leave grant/inbox state authoritative and return a resend instruction. No password or token is logged.

## Client-safe DTO architecture

Explicit Prisma select allowlists and Zod snapshot projections live in client-projections.ts. No internal Project/financial DTO is reused. Supplier cost, markup, ledgers, profit/margin, employee rates, internal notes, accounting IDs, storage keys and unrelated identities are excluded. Approved CO display uses the stored client approval snapshot.

## Portal routes/pages

/client provides project selection. /client/projects/[projectId]/[section] supplies Home, Schedule, Selections, Change Orders, Updates, Photos, Documents and Messages. A separate branded responsive shell includes attention items, recent updates/photos and unread notifications/messages. Internal project pages redirect clients to the portal.

## Client schedule publishing

ProjectTask.clientVisible and dedicated clientTitle/clientDescription expose only deliberate dates, milestones and status. Internal descriptions/assignees never appear. Project target completion has a separate published field.

## Client update publishing

DailyLog requires both clientVisible and a dedicated clientSummary. Internal work, manpower, delays, visitors and other operational fields are excluded. Legacy visible logs without a safe summary remain hidden.

## Client files/photos

Only nonarchived CLIENT files from authorized projects are listed/downloaded. Raster gallery images use protected routes. Other file formats download with nosniff/sandbox headers. Published selection attachments and accepted CO attachments cannot be archived/unpublished through services. Production storage still requires a durable adapter.

## Change Order client approval

Only the named client Contact with project access can decide the current issued revision. Typed acknowledgement and displayed-document hash are checked server-side. Shared acceptance and evidence insertion run atomically; unique constraints and serializable retries prevent duplicate contract/budget effects. Decline has no financial effect.

## Selection client approval

Clients choose an active option from the current published version and confirm with optional comments. Concurrent/repeated same-option submissions are idempotent. A different choice after confirmation is rejected and requires staff discussion/corrective scope.

## Approval snapshot architecture

SelectionDecision stores immutable client-visible title/product, price, allowance, variance and attachment references with user/contact/time. ClientApproval stores issued revision, authenticated identity, action, typed name, displayed snapshot and SHA-256 hash including visible document references. Database triggers reject edits/deletion. This is authenticated approval evidence, not a third-party signature platform.

## Communication/message architecture

Conversation has explicit INTERNAL/CLIENT audience and optional selection/CO context. Immutable ProjectMessage holds plain text; ConversationRead supplies read state. General client conversations are project-wide; CO discussions remain named-client scoped. Internal/client project authorization is enforced for reads and replies.

## Notifications/email behavior

Event-triggered inbox notices cover invitations, published selections/content/files, issued COs, acceptance and messages. Important client actions notify scoped staff. Publication/issue/message email is best effort after commit; accepted CO confirmation is in-app. Emails contain generic portal links, not internal financials or message bodies. Reads do not create notifications. Automated deadline reminders/email retry outbox are deferred.

## Security/privacy controls

CLIENT cannot inherit internal capabilities through overrides/mixed roles. The API dispatcher denies internal paths before legacy handlers. Existing session, origin, rate-limit and bounded-input protections remain. File access is server-authorized. Client content uses React text rendering and HTTP(S)-validated product URLs; active document formats are not served inline.

## Cross-project isolation

Integration/browser tests reject unrelated projects, selections, named-client COs, conversations, photos/files and internal APIs. Revocation removes subsequent access. Leakage assertions scan portal responses for private fields and sentinel content. No raw audit feed is exposed.

## Capability changes

Added CLIENT_ACCESS_MANAGE, CLIENT_CONTENT_PUBLISH, SELECTION_VIEW, SELECTION_CREATE, SELECTION_EDIT, SELECTION_PUBLISH, SELECTION_APPROVE_INTERNAL, CLIENT_MESSAGE_VIEW and CLIENT_MESSAGE_SEND. Owner has all; Admin/Controller/PM/Project Manager have the Phase 5 bundle subject to project scope. Estimator has selection view/create/edit. Client/field/shop/trade roles gain no internal financial capability.

## Audit/activity changes

Safe project events record invitations/grants/revocations, allowance/selection creation, publication, client decisions, draft CO creation, authenticated CO approval/decline, selection approval and messages. Generic descriptions omit prices, margins and raw message bodies. Immutable evidence is stored in domain models, not AuditLog.

## Prisma changes

Added ClientProjectAccess, Allowance, Selection, SelectionOption, SelectionDecision, ClientApproval, Conversation, ProjectMessage and ConversationRead; SelectionStatus and ConversationAudience; nine capabilities; Contact user relation; published task/update/project fields and supporting relations/checks/triggers. Existing CO/ledger models remain financial sources of truth.

## Migrations created

202609240002_client_selections_portal. Applied to a fresh isolated database and an existing Phase 4 test database. Prisma schema diff reports no differences. Existing migration files were not changed.

## Tests added

Six financial unit cases cover allowance variances, rounding and signed HST credits. Thirteen integration cases cover concurrent/idempotent decisions and approvals, ledger deltas, original-budget preservation, rollback on invalid credit, immutable evidence, publication/stale versions, no-allowance behavior, revocation, setup tokens, messaging, cross-project/named-client access and data leakage.

## E2E workflows

One combined staff/mobile-client browser workflow covers invitation, allowance/selection creation and publication, client selection, CO issue/approval, exact-once financial effects, private-data rejection and two-way messaging. All nine repository browser tests passed; the Phase 5 workflow was rerun successfully after final UI/security refinements.

## Documentation updated

Updated ARCHITECTURE, DATABASE, PERMISSIONS, ACCOUNTING, ROADMAP, CLIENT_PORTAL, CHANGE_ORDERS, STORAGE, SCHEDULING, NOTIFICATIONS and README. Added SELECTIONS, CLIENT_COMMUNICATION and this implementation report. Existing Time history remains intact.

## Validation results

| Check                     | Actual outcome                                            |
| ------------------------- | --------------------------------------------------------- |
| Prisma format             | Passed                                                    |
| Prisma validate           | Passed with isolated DATABASE_URL                         |
| Prisma generate           | Passed                                                    |
| Migrations                | Fresh install and Phase 4 upgrade passed; no schema drift |
| Lint                      | Passed, no warnings in final run                          |
| Typecheck                 | Passed                                                    |
| Unit tests                | 71 passed                                                 |
| Integration tests         | 56 passed                                                 |
| E2E                       | 9 passed; focused Phase 5 rerun also passed               |
| Production build          | Passed                                                    |
| Git diff whitespace check | Passed                                                    |

Prisma reports the preexisting package.json configuration deprecation warning. Real SMTP/provider delivery was not exercised; integration email uses mocks and browser tests use the development console provider.

## New environment variables

None.

## Railway deployment requirements

Back up and stage the additive migration; existing predeploy npm run db:migrate applies it. Resolve any legacy orphan Contact.portalUserId before adding the foreign key. Retain existing secure APP_SECRET/APP_URL and SMTP configuration. Production file bytes require the still-deferred durable StorageService adapter; Railway ephemeral disk is unsuitable. No production migration/deployment was performed during this work.

## Known limitations

No durable production file adapter, scheduled reminder job, email retry outbox, rich message uploads, private per-client participant lists, or large-history pagination was added. Messages cap at 100 conversations/500 messages per thread, and updates at 100. Confirmed selections are final; corrections use staff discussion and separate corrective scope/CO. One allowance funds one selection. Warranty, Trade Portal, payments, payroll and QuickBooks remain excluded.

## Recommended Phase 6

Trade / Subcontractor Portal → explicit scoped project access → published schedules → issued Work Orders / POs → drawings/documents → acknowledgement → site instructions → deficiencies → uploads → trade communication. Reuse client isolation patterns with separate trade-specific DTOs and grants.
