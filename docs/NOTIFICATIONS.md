# Notifications

Notifications are durable per-user inbox records with type, title, message, action URL, project/entity context, created time, and nullable `readAt`. The inbox supports unread count, mark read/unread, and mark all read.

Phase 2 generates targeted project/task assignment notifications. Phase 5 adds invitations, selection publication, issued COs, newly published content and client-facing staff messages. Client decisions, approvals and messages notify scoped internal staff. Client emails are generic portal links sent after commit; failures do not roll back authoritative inbox records. Repeated reads generate nothing. Phase 8A adds deadline scanners and durable scheduled delivery recovery. Push delivery remains future work.

## Phase 8A scheduled delivery
The scheduled system now supplements event notifications with opt-in durable generation, database leases, per-period dedupe and delivery review. See AUTOMATION.md. External grants and record visibility are rechecked before delivery. SMTP uncertainty is not treated as proof of failure or blindly retried.
