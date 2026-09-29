# Trade portal (Phase 6)

## Identity and authorization

`User → Contact.portalUserId → TradeProjectAccess → Project` is the explicit access path. Company is an affiliation, never an implicit authorization scope. A grant is unique per project/user and project/contact. Existing project Contacts with SUBTRADE or VENDOR types and a corresponding trade project role can be invited. ELECTRICIAN, PLUMBER, SUPPLIER and SUBCONTRACTOR project roles are also eligible. Association, purchasing recipient identity and project access are separate concepts.

The external user must have exactly one role: SUBTRADE or VENDOR. CLIENT uses its separate portal boundary. Mixed external/internal identities receive no internal capabilities and cannot enter either portal. Staff user editing rejects mixed roles and changing the role of an account linked to a Contact. Existing email accounts are never automatically attached to an unlinked Contact. Resolve identity collisions administratively; do not merge accounts by email.

Invitations reuse ActionToken RESET_PASSWORD and existing password/session infrastructure. No passwords are emailed. Staff may resend, revoke or reactivate project access. New accounts without passwords receive a 30-minute setup link; established accounts receive a sign-in link. Invitations are audited. Email failure does not roll back the authoritative grant/inbox entry. Login records first acceptance of active grants. Every project read/write/download rechecks active user, contact, company, project and nonrevoked grant. Revocation takes effect on subsequent requests without waiting for session expiry.

## Routes and projections

`/trade` is the project chooser. `/trade/projects/[projectId]/[section]` supports Home, Schedule, Work, Documents, Instructions, Deficiencies, Uploads and Messages. Supplier navigation hides instructions/deficiencies when there are none. Clients and trades redirect to their respective portal from internal routes and cannot call internal APIs. `/api/trade/*` and `/api/trade/upload` are separate from `/api/client/*` and internal `/api/trade-management/*`.

`trade-projections.ts` defines an allowlisted TradeProject response. Financial JSON is parsed through recursive stripping schemas. Only the recipient's agreed PO/WO unit price, amounts, tax and totals are included. No raw financial Prisma record, ledger, client Change Order, client identity, audit payload, internal description/note, storage key or password is serialized. The project projection includes site address and the primary PM's work name/email. Typed trade-safe descriptions are distinct from internal and client descriptions.

## Record-level policy

| Record       | Additional requirement after project grant                                      |
| ------------ | ------------------------------------------------------------------------------- |
| Schedule     | Contact assignment OR explicit TradeTaskRelease                                 |
| PO/WO        | Issued revision with exact vendorContactId matching grant Contact               |
| Instruction  | Issued instruction with explicit Contact recipient                              |
| Deficiency   | Exact assignedContactId                                                         |
| File         | TRADE visibility, active file, explicit TradeFileShare OR same uploader Contact |
| Conversation | TRADE audience and exact tradeContactId                                         |

Project and company membership never broaden these scopes. Files cannot be guessed by ID to bypass them. Trade uploads remain private to their uploader and authorized staff. The current sharing service conservatively refuses redistributing another trade's upload to a different Contact; staff should publish an independently reviewed document if broader distribution is needed.

## Purchasing receipts

Draft/review/approved-but-unissued purchasing revisions are absent. Issued history, including superseded/cancelled revisions, is readable only by its recipient. Acknowledgement is allowed only for an active issued/partially fulfilled/fulfilled revision. Drafting a replacement leaves the current issued revision effective; issuing the replacement supersedes it and requires a fresh acknowledgement.

TradeAcknowledgement stores exact source, user, contact, typed name, timestamp, action, allowlisted displayed snapshot and SHA-256 hash. PurchasingRevision.acknowledgedAt is a convenience field. Unique source/contact keys plus serializable retry prevent duplicate receipts. Evidence is immutable through database triggers. This records authenticated receipt; it is not a third-party signature product or financial acceptance. It never changes Commitment, ActualCost, Budget or ContractAdjustment.

TRADE-classified purchasing attachments are shared/locked to the exact recipient at issue. INTERNAL/CLIENT attachments are omitted. Acknowledgement freezes the safe document and visible attachment references. File metadata and shares retained as evidence cannot subsequently be edited, archived or removed. File bytes have opaque keys and no overwrite API.

## Schedule and communications

TradeTaskRelease adds deliberate publication without abusing clientVisible. Assignment also grants task visibility, using tradeTitle or the task's name and only tradeDescription. Start/end dates, milestone and status are visible. Internal descriptions and other assignees are absent. Removing a release does not remove independent assignment access.

TradeScheduleResponse records CONFIRMED, CONFLICT or QUESTION, comment, displayed dates/title and an idempotency request key. Responses never write ProjectTask dates. Staff resolves with a recorded reply, or separately edits the authoritative schedule. Original response content is immutable. Date changes/assignments and deliberate releases create targeted notices.

TRADE conversations reuse Conversation, ProjectMessage and ConversationRead with a required exact Contact recipient. Optional PO/WO, instruction or deficiency context is reauthorized before posting. Messages and attachment references are immutable. The Client/INTERNAL messaging service explicitly excludes TRADE threads, including for staff. The trade service checks TRADE_MESSAGE_VIEW/SEND plus project scope for internal users; clients/trades never receive these capabilities. Read states are per user.

## Uploads and notifications

Uploads use the existing StorageService and StoredFile, with TRADE_UPLOAD origin and uploader Contact. Optional purchasing/instruction/deficiency references must belong to the same authorized identity. Size, filename, MIME and magic signatures are checked; supported content is JPEG, PNG, WebP and PDF. Files use opaque server keys. Download uses authenticated byte streaming with nosniff, sandbox CSP and attachment disposition for PDFs. Magic checks are not antivirus scanning. Production still requires a durable storage adapter (see STORAGE.md).

Events create targeted in-app notices, with generic links and best-effort SMTP delivery after commit. This includes issuance, relevant schedule changes, instructions, deficiencies, shares, staff messages and schedule resolutions. Trade acknowledgements/conflicts/uploads/messages/ready-for-review events produce internal activity and capability-scoped inbox notifications. Reads do not create notifications. Automated deadline reminders, guaranteed email retry and pagination of long histories remain later work.

All portal actions require network confirmation. No financial receipts, status changes or uploads are silently queued offline. Site instructions and trade messages never authorize additional cost automatically.

## Internal workspace and limitations

Project → Trades manages invitations, access, issued-work acknowledgement queues, instructions and replacements, deficiencies and verification, explicit file sharing, schedule release/responses and communication. Existing Contact, purchasing and schedule editors remain authoritative. API supports multiple instruction recipients and contextual messages/uploads; the initial instruction form selects one recipient. Typed DTOs and transaction/security integration tests are mandatory when extending this surface. Phase 8A adds assigned warranty work and completion evidence. Full drawing markup, binding trade change requests and company-wide delegation remain unimplemented. Phase 7/7.5 accounting integration is internal-only and not part of the Trade Portal.

## Warranty
Assigned Warranty requests appear in the trade portal with trade-safe scope and explicitly shared evidence. A trade may acknowledge, start, comment, upload, or mark ready; coverage determination and closure are staff-only. Other trades and client-private request details remain excluded. See WARRANTY.md.
