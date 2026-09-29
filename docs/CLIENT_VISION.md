# Client Vision

Client Vision is a read-only staff preview, not impersonation. The eye action in every Project header opens `/client-preview/projects/[projectId]/[section]` in a new tab with `noopener noreferrer`. The existing staff session stays unchanged. The Clients tab links to the same preview instead of embedding a second interface.

## Authorization and shared projection

The page, preview API and preview downloads require an active internal identity, CLIENT_PREVIEW and normal internal Project access. No ClientProjectAccess grant is needed to prepare a project before invitation. External users are rejected even if they have capability overrides.

`client-projections.ts::projectProjection` is the single project DTO builder for both real client access and preview. Prisma selects and Zod snapshot allowlists exclude internal cost, markup, margin, budget, actuals, forecasts, QuickBooks identifiers, storage keys, internal notes and assignees. Stored selection-decision snapshots are allowlisted too. `clientConversations` shares the recipient filter and message projection. The same ClientPortal, PortalContent, proposal/price/selection/change/message components render both experiences.

Preview metadata includes only associated active CLIENT contact IDs/names and the selected contact. Actual client DTOs contain no selector metadata. A selected contact's portal-linked user supplies notification/unread state without changing it. Preview does not set cookies, change identity, mark messages read or create access/approval evidence. Opening preview does not create AuditLog noise.

## Recipient scope

General view contains shared published content, shared client conversations and issued proposals without a named recipient. It excludes individually addressed proposals, Change Orders and related conversations. Select an active CLIENT ProjectContact to see that recipient's view. This works even before invitation. General conversations and project selections remain shared among all authorized project clients, as before; private individual-client messaging is not implemented.

A contract summary is withheld if its original proposal or an included contract adjustment belongs to another recipient. This prevents aggregate totals from disclosing targeted pricing indirectly. No partial total is presented as the complete contract.

## Client-facing prices and tax

Company Settings > Time & report settings > Client Portal defaults provides Final Total Only (default), financial summary enabled (default true), and PM name visibility (default false). Project > Settings > Client View offers nullable overrides; null resolves the current company default. Changing the default affects inheriting projects. All preference writes require SETTINGS_MANAGE (company) or CLIENT_CONTENT_PUBLISH plus Project access (project) and are audited.

FINAL_TOTAL_ONLY displays the recorded tax-inclusive total with no separate subtotal/HST line. SHOW_TAX_BREAKDOWN displays recorded subtotal, HST and total. There is no pre-tax-only contract mode. Scope and quantities remain visible; per-line proposal/CO pre-tax client prices are shown in breakdown mode. Internal estimating data is never projected.

The original `Project.contractAmount` remains pre-tax. A summary requires exactly one recipient-visible ACCEPTED proposal with a matching subtotal and consistent stored tax/total. It never estimates old tax from today's Settings.taxRate. Without reliable original tax evidence the summary is omitted; the settings screen explains this prerequisite. Approved adjustments come from ContractAdjustment and their linked revision's recorded tax. No redundant contract totals are stored. Current contract equals original plus approved changes, including their respective recorded taxes. No pending changes aggregate is added.

Selections and allowances remain explicitly labelled pre-HST estimates of the decision difference. Their existing model does not freeze a final tax rate; inventing tax-inclusive option totals would misstate the later issued Change Order. The issued Change Order shows the authoritative adjustment total under the chosen display policy. Only the allowance difference, never the full selected amount, enters that workflow.

New CO approval evidence includes the displayed tax mode in its allowlisted snapshot and hash. A mode change before approval requires refreshing/reviewing the document. Recorded approvals retain their original mode. Legacy approvals without a mode retain their immutable stored evidence; their original price/tax values are unchanged. This is presentation metadata, not a financial ledger modification.

## Published operations and files

Schedule still requires clientVisible and dedicated client wording; no assignees or dependency mechanics. Updates require clientVisible and clientSummary. Files/photos require CLIENT visibility and nonarchived state. PM name is opt-in; personal email/phone is not exposed. Site address and dedicated client target completion appear in the shared header/home. Preview file URLs add a scoped clientPreview project parameter; the server rechecks CLIENT visibility and project membership before the existing protected storage response. Internal file rights do not bypass this check.

Manage Client Visibility opens the relevant internal project tab in a separate tab. The preview itself has no editing controls. Selection/CO decisions, replies, new conversations and mark-read controls cannot submit in preview. Calling real client mutation APIs with the staff session is rejected by the existing dedicated client-role/grant authorization.

## Validation and limitations

Integration coverage compares staff and real-client DTOs, asserts forbidden keys/values, checks recipient and project isolation, settings audits, tax-only presentation, missing-tax safety, protected downloads and rejected staff approval/message/decision attempts. Browser coverage checks a genuine new tab, no opener, unchanged internal session, disabled actions, mobile layout and tax settings. Existing client/trade/accounting tests remain required.

Proposal portal acceptance remains staff-recorded; this feature provides viewing, not a new signing workflow. No invoice/payment balances, progress percentage, private per-client selections, document-review acknowledgements or financial estimates are invented. Durable production file storage remains an existing deployment prerequisite. Live QuickBooks validation remains pending and Phase 8 is unchanged.

## Implementation validation (2026-09-29)

- Prisma format, validate and generate passed.
- Migration `202609290001_client_vision` applied successfully to the isolated local `_test` database through `prisma migrate deploy`; no production database was used.
- Lint and typecheck passed.
- 98 unit tests passed, including three fixed-price presentation tests.
- 113 integration tests passed, including ten Client Vision security/financial tests and existing client, trade and financial regressions.
- 33 focused QuickBooks tests passed (overlap with the unit/integration suites).
- 21 browser workflows passed, including the new-tab/session-isolation/read-only preview and project tax-display override flows.
- Production build passed. Desktop/mobile previews were reviewed using real browser captures.

Deployment must apply the additive migration before serving the new code. No new environment variables are required. This validation does not establish live QuickBooks compatibility.
