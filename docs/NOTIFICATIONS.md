# Notifications

Notifications are durable per-user inbox records with type, title, message, action URL, project/entity context, created time, and nullable `readAt`. The inbox supports unread count, mark read/unread, and mark all read.

Phase 2 generates targeted notifications when a user is assigned to a project or schedule task. It deliberately does not generate a notification for every edit. Future due/overdue scanners, email, and push delivery should consume the same notification/event semantics and record delivery attempts separately rather than overloading the inbox record.
