# Client communication

Conversation belongs to Project with explicit INTERNAL or CLIENT audience and optional Selection/ChangeOrderRevision references. ProjectMessage stores author, timestamp and plain text, protected against edits/deletion by a database trigger. ConversationRead holds per-user read time. AuditLog records activity, never message contents.

Internal reads/sends require CLIENT_MESSAGE_VIEW/CLIENT_MESSAGE_SEND plus project scope. Clients require active ClientProjectAccess. General CLIENT conversations are shared among authorized clients for that project, not private direct messages. INTERNAL threads are excluded in the database query. CO-linked conversations require the named client; selection conversations require publication. Cross-project object IDs are rejected.

Portal and Project → Messages support thread creation, replies and read state. Selection/CO cards start contextual questions. Client messages notify scoped staff. Staff CLIENT messages create project-client inbox notifications and best-effort email containing a generic notice and portal link, not message bodies or financial data.

Message uploads, private participant lists, edits/deletes, email reply ingestion, realtime sockets and scheduled reminders are deferred. Queries cap at 100 conversations and 500 messages per thread; pagination is follow-up work for larger histories. Share files through explicit CLIENT file publishing.

## Separate trade audience (Phase 6)

ConversationAudience.TRADE requires an exact trade Contact and optionally an issued purchasing revision, issued instruction or assigned deficiency. The dedicated trade messaging service validates both project grant and record scope. The client/internal service explicitly excludes TRADE conversations even for staff; Project ? Trades is the internal entry point. ProjectMessage and ConversationRead are reused; attachment IDs are independently authorized and retained. No client or other trade can read/post to a TRADE thread. See TRADE_PORTAL.md.
