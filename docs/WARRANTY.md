# Warranty / service operations

WarrantyRequest is separate from construction Deficiency. It uses the same project scope, contacts, storage abstraction and event patterns. Settings allocates SR numbers transactionally. Coverage dates are entered deliberately; no legal warranty periods are inferred.

Lifecycle: SUBMITTED → REVIEWING → ACCEPTED (or NOT_WARRANTY), then ASSIGNED/SCHEDULED → IN_PROGRESS → READY_FOR_REVIEW → READY_FOR_CLIENT → CLIENT_VERIFIED → CLOSED. Staff can complete internally performed work directly from accepted/assigned states. Rejection, comments and reopening require text. Staff decides coverage and verifies trade work. Only the reporting client verifies completion. Staff may close verified or rejected requests. Reopening returns to review and clears completion timestamps.

All actions check optimistic version and run in a serializable transaction. WarrantyUpdate is append-only in PostgreSQL. Audit and targeted notifications accompany changes. No warranty action modifies financial records.

## External boundaries

ClientProjectAccess plus exact reporting Contact scopes client requests, comments, photos, and downloads. Other clients on the same project do not receive these records. General Client Vision excludes identity-specific requests; selecting a client uses the same DTO as their actual portal. Preview cannot submit mutations.

TradeProjectAccess plus assigned Contact scopes trade work. Trade DTO includes only trade scope, location, status, due/appointment dates, TRADE updates and explicitly shared files. No reporting-client identity, client description, internal notes or financial values. Trades acknowledge/start/mark ready, comment, and upload evidence; they cannot determine coverage, verify for clients or close requests. An already assigned trade cannot be changed to another identity; use a replacement to preserve discussion isolation.

StoredFile gains a warranty association. External uploads force their own audience. Staff chooses INTERNAL, CLIENT or TRADE; recipient existence is validated. Signature/extension/MIME/size checks reuse trade upload validation. Protected download rechecks record scope. Evidence cannot be deleted, archived or reclassified; publish a separately reviewed copy when another audience needs it. File/project consistency has a database trigger.

Project → Warranty includes staff operations and manually entered dates/reminder configuration. Client and Trade Portal each include Warranty. Portfolio Reports includes service status, category, due date, age and expiration; My Work includes assigned requests. No repair scheduling optimization, coverage rules engine, third-party dispatch, service billing or service-level agreement engine is claimed.

An internal request with no reporting client can be closed by authorized staff after work completion with a recorded reason. This does not manufacture client verification; requests addressed to a client still require that client's verification before closure.
