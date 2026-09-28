# Controlled QuickBooks live pilot (Phase 7.5)

**IMPLEMENTED — LIVE QUICKBOOKS VALIDATION PENDING.** No Cedar Winds accounting company has been contacted or certified by automated tests. Phase 8 has not started.

## Modes and deployment

| Mode | QuickBooks requests | CW ActualCost mutations |
|---|---|---|
| DISCOVERY | Queries only | None; Bills are staged for review |
| PILOT | Only the explicit PO revision and approved TimeSegments; queries | Explicitly reviewed Bills, only the pilot Vendor/Project/Cost Codes |
| ACTIVE | Explicit eligible exports; configured Bill polling | Supported mapped Bills; held/review-required Bills remain manual |
| PAUSED | Authentication and diagnostic/read queries continue | None |

Migration `202609280001_quickbooks_pilot` deliberately returns existing connections to DISCOVERY. It does not cancel queued work, erase mappings or undo accounting transactions. Pending outbound records remain parked until mode and source checks permit processing. Pause is not a rollback of a write already delivered to QuickBooks: its response is retained to prevent accidental resending. It does stop new writes and Bill ledger application.

Apply migrations before deploying the corresponding application code. Retain HTTPS APP_URL and durable PostgreSQL on Railway. No new environment variables. No inbound access to the accounting PC is required.

## Pilot scope and pre-flight

Financials → QuickBooks → Live Validation is the dedicated pre-flight panel. Configure and bind the company, discover lists and map records, then save one Project, one Vendor Contact, one Employee User, selected Cost Codes, one issued PO revision and selected TimeSegments. A Contact may use its explicitly mapped Company Vendor. Save/revise scope only in DISCOVERY or PAUSED, with a reason and backup confirmation. Outstanding uncertain writes must be reconciled first.

PILOT activation requires explicit HTTPS APP_URL (including during pilot development), the pilot migration with no unfinished migration, a configured credential, matching bound company identity, backup attestation, healthy queue/no unresolved issues and valid active/recent mappings. Saving scope checks source relationships. Queueing and sending recheck the allowlist, current approval, mappings and financial eligibility. Mappings alone never authorize a record. List creation is disabled in PILOT.

The company binding is an audited operator confirmation of observed company name, legal name and path metadata. Changed identity/path latches COMPANY_MISMATCH and notifies accounting users. Original company identity must be observed again and explicitly reconfirmed; there is no automatic rebind. This is not a cryptographic fingerprint: identical metadata in copied company files still requires operator verification.

## Preview and first outbound records

“Preview QuickBooks Request” uses the same request builder with no queue insert, request write, source-version update or remote call. It displays mapped reference names/IDs, intended fields and optional qbXML to authorized accounting users. Preview is not a reservation: queue and send validate again. In PILOT, missing mappings, wrong scope, unapproved/currently edited time and unsupported taxes fail before queue insertion.

Issued POs expose their returned TxnID, EditSequence, status and sync timestamp. Locate the PO in Desktop by RefNumber and the full CW number/revision in Memo (RefNumber is limited to 11 characters). Compare Vendor, Job, Items, quantities, rates and total. Time has its own returned TxnID; compare Employee, date, Service Item and rounded duration. A synchronized time correction remains reconciliation-required, never another Add.

### Taxable PO policy — blocked

The current builder sends ItemRef, Quantity, Rate and CustomerRef. CW stores a taxable flag/rate; it does not yet map Canadian vendor/purchase SalesTaxCode references or verify the company's recoverable-tax configuration. Omitting this tax data could cause Desktop defaults to produce a financially different PO. A nonzero tax amount **or any taxable line** is therefore blocked:

> This Purchase Order includes tax behavior that has not yet been live validated with QuickBooks Desktop. It was not sent.

Do not mark a genuinely taxable transaction tax-free just to pass this control. Use a genuinely eligible, zero-tax test PO. Tax support requires a separate implementation and edition-specific live test. Reference: [Intuit PurchaseOrderAdd](https://developer.intuit.com/app/developer/qbdesktop/docs/api-reference/qbdesktop/purchaseorderadd).

## Bill preview, application and correction

PILOT Bill queries only stage records. Bill review displays transaction reference/date, Vendor ListID, lines/amounts/descriptions, allocation, commitment choices and existing actuals. Preview resolves Project/Cost Code/Cost Type and commitment links, validates the entire Bill including overages, and shows previous/new amounts. “Apply reviewed Bill” requires a reason and the exact preview hash of source content plus allocation decisions. A changed Bill or allocation invalidates the preview.

Application reverses previous active costs, restores consumption and inserts the new active costs within the existing serializable transaction. It preserves source history, TxnID/EditSequence and line/version identities. A changed Bill records previous total → updated total in a new accounting AuditLog entry; generic Project Activity does not expose financial amounts. Repeated requests do not add costs. Allocation-only changes have a distinct audit action and do not count as a modified-QuickBooks-Bill milestone.

Manual line decisions allow a Project and Cost Code (cost type follows the code), a validated commitment, explicit unlink, or “ignore as known non-project cost.” Reasons are required and decisions are audited. They do not alter amount/date or rewrite the QuickBooks Bill. Changed source versions clear prior line decisions and require renewed review where decisions existed. Reviewed allocation changes/restored Bills stay REVIEW_REQUIRED even in ACTIVE until deliberately applied. Direct use of the generic project reconciliation route for QB actuals is rejected; use Bill review so pilot/mode controls cannot be bypassed.

### Unsupported and unmapped formats

- Item and Expense lines can be mapped through Item or Account mappings. Missing Customer:Job is no longer silently discarded: explicitly allocate it or ignore it as overhead.
- Unmapped Job/Item/Account lines stay in reconciliation; repair mappings and preview/apply again without duplicates.
- Groups retain safe group description/amount evidence but cannot be automatically flattened.
- Tax-inclusive, foreign-exchange and negative Bills remain blocked. Splitting/guessing their monetary meaning is not supported. Correct or verify them in Desktop; record an audited hold if irrelevant.
- Project+Cost Code and commitment classification must agree. Overages require a purchasing revision; no financial override is introduced.
- A Bill with lines outside the pilot scope cannot partly mutate another Project. The entire transaction is preflighted before reversal/application.

### Deleted / voided Bills — explicit fallback

Normal BillQuery absence is **never** interpreted as deletion. The Desktop SDK has a [TxnDeletedQuery reference](https://developer.intuit.com/app/developer/qbdesktop/docs/api-reference/qbdesktop/txndeletedquery), but this implementation does not claim a verified deletion feed, retention window or live edition compatibility. Automated deletion polling remains disabled.

After verifying deletion/void in Desktop, use “Reverse imported Bill / hold non-project Bill,” with a reason naming the evidence. It reverses all active actuals for that source Bill, restores consumed commitments, records activity/audit, notifies accounting users, and persists a hold. Subsequent queries cannot reinstate held costs. “Restore to review” clears the hold but requires new explicit preview/application. Returned zero-value lines and removed lines are reconciled transactionally; a zero outstanding balance alone is NOT proof of zero cost or a void. Do not delete ActualCost rows. Reversal does not delete or modify the source QuickBooks Bill.

## Diagnostics, recovery and promotion

Each run records its starting mode, company and version. “Inspect run” shows requests, source IDs, completion times, safe status codes/results and blocked jobs; credentials, tickets and raw auth bodies are absent. Heartbeat is updated by authenticated callbacks. Dashboard distinguishes never connected, recent, overdue (three configured intervals), authentication failure, pause and company mismatch. These are observations, not a connection guarantee.

Intuit's [SDK status table](https://static.developer.intuit.com/qbSDK-current/doc/pdf/QBSDK_ProGuide.pdf) distinguishes locks (3175/3176) from permissions (3260). Only rejected lock requests get bounded backoff. Permission, reference and stale-EditSequence failures require operator action. An uncertain accounting write is never blindly resent: close the old run and verify the exact TxnID using the existing read/adoption workflow. Retry blocked/failed jobs after repair; resolution notes do not change ledger state or override company protections.

Live results are append-only database records with step, pass/fail, tester, timestamp, Desktop/Web Connector versions, record IDs, evidence notes, company binding and pilot-scope hash. Changing the scope prevents old results from satisfying the new scope. Automated transaction counters and human attestations are displayed separately. No successful HTTP callback fabricates a live result.

ACTIVE requires pre-flight plus explicit confirmation/reason, successful PO/time/Bill/modified-Bill records and passing attestations for connection/company/discovery/mappings/PO/time/Bill/modified Bill/duplicate retry/failure recovery. Only OWNER can override incomplete exit evidence, with a recorded reason; override does not set LIVE VALIDATED. Normal activation is capability-protected. A later failed live result clears validation and pauses an ACTIVE connection. An operator's attestation remains an attestation, not third-party certification.

## Current limits

Work Orders remain CW-only. No payroll accounting, wage import, Vendor Credit/check/card import or automatic corrected-time export. External PO edits require reviewed EditSequence handling; synchronized PO cancellation still needs accounting review. Historical import needs an explicit date; list discovery is size-bounded but not paginated. Dashboard histories are bounded (100 Bills/jobs, 20 runs); use a small pilot, not a historical bulk-import exercise. No scheduled stale-connector notification daemon or retention/purge policy is added. Pilot tests and browser fixtures do not establish live compatibility or enable unrestricted production sync.
