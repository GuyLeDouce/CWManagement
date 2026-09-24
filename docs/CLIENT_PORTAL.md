# Client portal (Phase 5)

Portal users are authenticated `User` records linked deliberately to a contact or authorized trade identity. Creating a contact never creates access.

Client queries use separate allowlisted projections for overview, published schedule/updates, photos/files, selections, allowances, issued Change Orders and messages. They exclude costs, margins, employee/payroll data, vendor pricing, internal notes, accounting records and every unrelated project. Invoice/payment summaries and warranty are not implemented.

Trade Portal remains Phase 6. Client downloads use authenticated project-scoped routes, not public storage URLs.

## Identity and access

Clients use existing User, Session and hashed ActionToken password setup. Contact.portalUserId now has a foreign key. ClientProjectAccess records explicit project/user/contact grants, invitation, first authenticated acceptance, revocation and inviter. A contact or ProjectContact association alone grants nothing.

Project → Clients supports invite/resend, revoke and reactivate. First invitation creates a passwordless CLIENT user and sends a single-use 30-minute setup link. Already linked clients receive additional project access without duplication. An unrelated existing email is never automatically linked; staff must resolve identity deliberately. Development console email logs metadata only; SMTP is needed for invitation delivery.

requireClientProjectAccess checks an active dedicated CLIENT user, active matching contact, active nonrevoked grant and active nonarchived project on every read/write/download. CLIENT accounts cannot combine internal roles or gain internal permissions through overrides. The internal dispatcher rejects CLIENT before legacy time/admin/project handlers. Internal pages redirect to /client. Revocation does not erase historical evidence.

## Routes and DTO policy

/client lists accessible projects. /client/projects/[id]/[section] provides Home, Schedule, Selections, Change Orders, Updates, Photos, Documents and Messages in a separate mobile layout. /api/client/* never reuses internal workspace loaders. client-projections.ts uses Prisma select allowlists and strips unknown issued-snapshot fields with Zod. Raw Prisma financial records, User, StoredFile and AuditLog never become portal props.

COs are further restricted to their named client Contact. Staff preview uses the same projection with actions disabled and shows published content for all intended project recipients. Internal supplier pricing, markup, cost ledgers, notes, accounting mappings, storage keys and unrelated contacts are excluded server-side.

## Publishing

Project → Clients provides explicit controls and preview. Schedule requires clientVisible plus dedicated clientTitle/clientDescription; assignees and internal descriptions never appear. DailyLog.clientVisible also requires clientSummary; no internal log field is used as fallback. Legacy visible logs without this summary remain hidden. Project notes use clientVisibleNotes and clientTargetCompletion is separate from the internal target date.

Files/photos require CLIENT visibility and nonarchived status. Options can attach only CLIENT files from their project; supplier quotes remain INTERNAL. Publishing requires CLIENT_CONTENT_PUBLISH. Downloads recheck grants and visibility; only safe raster MIME types display inline. Other formats download with nosniff and sandbox CSP. Approved selection/accepted CO attachments cannot be unpublished or archived by application workflows. Durable production storage remains a deployment prerequisite.

## Approval evidence

CO approval submits revision, SHA-256 displayed-document hash, typed name and action. Server rechecks the latest issued revision and named client. ClientApproval preserves the displayed allowlisted snapshot, hash, user/contact, time and decision. Database triggers reject changes/deletion. This is authenticated approval evidence, not a regulated signature service; no IP/user-agent tracking was added.

The existing applyChangeOrderAcceptance helper and approval insertion run in one serializable transaction. Unique adjustment, approval and budget constraints plus retries prevent duplicate effects. Same-action retries are idempotent. Decline records evidence with no financial impact. Superseded issued history remains accessible; accepted revisions cannot be revised or unpublished.

## Notifications and scope

Event-triggered inbox entries accompany invitations, selection publication, CO issue, newly published content and staff messages. Email runs after commit, best effort; inbox is authoritative. Reads create no notifications. Client actions notify scoped staff and create safe activity entries. Home derives attention and recent updates only from published sources, never AuditLog.

Deadline reminders, email retry outbox, pagination of large histories, warranty, payments and Trade Portal are deferred. Project messaging includes read state; rich message attachments and private individual-client threads are not implemented.
