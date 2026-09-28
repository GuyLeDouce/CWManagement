# Deficiencies / punch items

Deficiency stores project, settings-based number, title, trade-visible description, location, priority, due date, optional task, assigned Contact, internal notes, attachments and version. Internal notes are never projected to trades. Trade sees only its own assigned items on an active explicit project grant.

Lifecycle: OPEN (unassigned) → ASSIGNED → IN_PROGRESS → READY_FOR_REVIEW → CLOSED. Trade may start/submit assigned or reopened work; Cedar Winds alone verifies/closes. CLOSED or READY_FOR_REVIEW may be REOPENED with a comment. Active unclosed records may be CANCELLED. Reopening clears completion/verification timestamps. Each transition checks an optimistic version and inserts an immutable DeficiencyUpdate with actor, recipient, status, comment and timestamp.

DEFICIENCY_CREATE creates records; assigning requires DEFICIENCY_ASSIGN; verifying/reopening/cancelling requires DEFICIENCY_VERIFY. Internal reads require DEFICIENCY_VIEW. All require project scope. Assigning a previously assigned item to a different Contact is deliberately rejected: create a replacement so prior trade discussions/evidence do not leak across identities.

The trade can upload completion photos/PDFs associated with the deficiency before submitting Ready for review. Uploaded evidence retains uploader Contact and TRADE_UPLOAD origin, remains available through protected downloads and is locked against archive/reclassification. Staff sees uploads, reviews and records verification or reopening comments. Closing is never an external action.

Changes produce safe internal project activity and event-triggered notifications. No deficiency state change modifies financial ledgers. Scheduled overdue reminders and client-facing deficiency publishing are not implemented.
