# QuickBooks mapping

For live validation use the [Phase 7.5 pilot allowlist](QUICKBOOKS_PILOT.md) in addition to mappings. A mapping is not permission to export. Bill lines without a Job or Item/Account mapping are retained for reasoned allocation/ignore, then exact-version preview/application. Allocation changes are audited and cannot bypass mode, Project or commitment checks.

Use Settings → QuickBooks after discovery and company verification. Select an existing local entity and an active discovered QuickBooks record, then confirm the link. Names are labels, not identity. Existing AccountingSyncMapping is extended with connection, EditSequence, FullName, subtype, source version, enabled state and metadata; legacy rows retain their uniqueness and are not silently attached to a new connection.

| CW entity type | Source | QB candidate |
|---|---|---|
| PROJECT | Project.id | Customer / Customer:Job ListID |
| VENDOR_CONTACT | vendor/subtrade Contact.id | Vendor ListID |
| VENDOR_COMPANY | Company.id | Vendor ListID |
| EMPLOYEE | internal User.id | Employee ListID |
| COST_CODE | active CostCode.id | Item ListID; time requires ItemServiceRet |
| ACCOUNT_COST_CODE | CostCode.id | Account ListID for expense-line imports |

A PO prefers a Contact mapping, otherwise its Contact's Company mapping. Company fallback requires its current name to match the issued vendor snapshot; a changed company requires explicit Contact mapping after review. Map accounting identities deliberately; a contact's portal identity is irrelevant and no portal credentials are exported. Items retain subtype rather than being forced into one type. Unlinked Bill lines use CostCode.type; a reviewed commitment match uses the actual CommitmentLine cost type. Code/type compatibility is enforced by the existing consumption service.

Mapping uniqueness is per connection/entity type/source and per connection/entity type/QB identifier. Multiple connections cannot bind the same observed company identity. Mappings cannot be silently redirected/unlinked after outbound transactions or imported Bills exist; disable and reconcile. This is deliberately conservative even for an otherwise unrelated mapping. Discovery refresh marks unavailable mapped candidates CONFLICT; reactivation requires operator confirmation. Seven-day discovery freshness is required for outbound mappings.

Legacy AccountingCode and AccountingMapping continue serving working time/CSV exports. They are not deleted or inferred into QB Item mappings. Phase 7 time export uses TimeSegment.costCodeId, falling back to Task.defaultCostCodeId, then the explicit Item mapping. Existing CostCode.quickBooksListId is not automatically trusted or copied into a connection.

Explicit Project/Vendor creation is queued only in ACTIVE mode. Parent Customer selection is optional for a Customer:Job. Employee creation is intentionally unsupported. If a create response is uncertain, discover/map the existing list record; never create again merely because CW lacks a response.
