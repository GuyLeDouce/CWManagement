# QuickBooks Desktop integration

Software implementation is present; **live Cedar Winds QuickBooks validation is pending**. Start with a backup/test company, discovery mode and the [live checklist](QUICKBOOKS_LIVE_VALIDATION.md). The supported accounting scope and limitations below are intentional controls, not claims of compatibility with an untested company file.

## Authority and direction

| Entity | Authority | Implemented direction |
|---|---|---|
| Projects / Customer:Jobs | CW project operations; operator chooses QB identity | Discover/map existing; explicit CustomerAdd with optional parent |
| Vendors | Contact/Company operational identity; QB accounting identity | Discover/map; explicit VendorAdd for a Contact |
| Employees | Existing internal User and QB Employee | Discover/map only; no employee/payroll creation |
| Cost Codes | CW hierarchical classification | Map to discovered Item; optional separate Account mapping for expense lines |
| Issued Purchase Orders | CW immutable scope/approval; QB accounting representation | PurchaseOrderAdd; reviewed PurchaseOrderMod |
| Work Orders | CW commitments | CW-only; never automatically exported as another commitment |
| Approved time | CW approved TimeSegment | TimeTrackingAdd; corrections require reconciliation |
| Bills | QuickBooks | Read/import eligible Item and Expense lines into ActualCost |
| Budget, contract, CO, selection, portals | CW | Not exported/imported through this connector |
| GL, AP, AR, payroll, bank/payment/tax accounting | QuickBooks | No replacement ledger or automatic accounting entries |

## Transport and security

The Windows PC runs QuickBooks Web Connector, which makes outbound HTTPS requests to Railway `/api/quickbooks/web-connector`. No port forwarding, VPN, desktop agent, QBO OAuth or REST API is involved. The dedicated Node route accepts bounded SOAP 1.1 `text/xml` requests. Callback namespace is `http://developer.intuit.com`; parameter names follow Intuit's protocol: authenticate, serverVersion, clientVersion, sendRequestXML, receiveResponseXML, getLastError, connectionError and closeConnection. Browser cookies are not connector authentication.

`fast-xml-parser` is pinned. XML is validated, DTD/entity declarations rejected, nesting and entity expansion bounded, request bodies limited to 8 MiB. XML output is escaped by the builder. No raw SOAP, password or raw QuickBooks response logging is added. Persisted requests contain the normalized accounting request, accessible only through accounting services; they are not payroll compensation records. Completed request evidence is protected by a database trigger.

Connection passwords are random, copy-once values stored as scrypt hashes. QWC files contain username/GUIDs/URLs/interval, never passwords. Authentication is database rate-limited; unknown accounts still incur password verification. Tickets are random, stored only as SHA-256 hashes and expire after 30 minutes. Rotation expires existing tickets. Historical sessions/runs/requests remain audit evidence; a long-term retention/archive policy remains operational follow-up.

`APP_URL` supplies QWC URLs; production requires HTTPS. Development HTTP is limited to localhost/127.0.0.1. The support URL is `/quickbooks/setup`. Configuration defaults to DISCOVERY and a 30-minute schedule. The supported request version is qbXML 13.0; reported maximum versions below 13 are rejected. Canadian edition/tax behavior still requires live validation.

## Persistent state machine

Connection → SyncRun → SyncSession → SyncJob → Request. PostgreSQL advisory locks and serializable transactions serialize a connection. Only one active connector session is admitted. Request identity/body, queue status, response hash and completion percentage survive application restarts. A duplicate identical response returns its stored result; a conflicting response is rejected. Jobs use unique deterministic source keys for PO revisions, time and explicit list creation.

CompanyQuery is always first in a session. Company name/legal name and the actual connector company-file path form the observed identity. An operator explicitly binds it before activation/mapping. One connection may bind a given identity. A changed path/name latches COMPANY_MISMATCH and stops transactions. Restore the original file, obtain fresh CompanyQuery evidence and explicitly confirm it again; configuration cannot rebind existing accounting history to another company. A copied file with identical name/path metadata cannot be distinguished reliably without live operational verification.

Missing prerequisites are BLOCKED before any write. Confirmed QuickBooks errors become FAILED or RECONCILIATION_REQUIRED; error 3260 receives up to three bounded, delayed attempts. Other retries require an operator, with a five-attempt ceiling. A potentially executed write with no trustworthy response is **never automatically resent**. It becomes RECONCILIATION_REQUIRED. Supported PO/time uncertain writes can be adopted by querying an operator-supplied TxnID and comparing against the original persisted request. A note alone never changes financial effects. An uncertain Customer/Vendor creation must be resolved by discovering/mapping its existing ListID; it is not resent.

## Purchasing and time

PO export requires current issued state, Project mapping, Contact or Company Vendor mapping, and an active recently discovered Item for every Cost Code. Draft/review/approved-only and cancelled documents cannot export. Taxable POs are currently BLOCKED pending Canadian purchase-tax-code mapping; zero-tax documents are supported. No client prices, markup or margin enter requests. RefNumber is limited to QuickBooks' 11 characters; the full CW number/revision remains in Memo and mapping evidence.

A later revision queries the mapped PO, displays returned lines/EditSequence for Controller review, and requires explicit authorization. It queries again before Mod; any changed sequence returns to review. Stable CW line keys preserve returned TxnLineIDs; new lines use -1. QuickBooks rejects a concurrent sequence change rather than being overwritten. Internal issued revisions are never rewritten. Cancellation of an already synchronized PO requires accounting-side review; it is not automatically deleted/closed.

Time requires a closed segment, PM_APPROVED/EXPORTED status and an Approval for the current version. Employee, Project and Service Item mappings are mandatory. CostCode comes from the segment or Task.defaultCostCodeId. Duration rounds once to nearest minute and uses ISO duration (e.g. PT1H30M); entry date uses WorkDay.timezone. No wage/rate/payroll fields are exported. Source version is stored. A database trigger marks synchronized time CONFLICT when the version changes, and normal corrections notify accounting operators. There is no automatic TimeTrackingMod.

## Bill import and financial reconciliation

Bill querying requires an explicit import start date and a bound company. ACTIVE connector runs queue incremental Bill reads; operators can also queue them deliberately. Initial queries use transaction date; subsequent queries use modified timestamp with a five-minute overlap. Iterator pages contain at most 200 Bills. The completed query advances the cursor; line-level idempotency handles overlaps. Non-project overhead lines do not enter job costing. Older unseen Bills returned by an incremental query are excluded by the chosen start date.

QuickBooksBillMirror is staging/reconciliation evidence, **not a reporting ledger**. A complete Bill is normalized by TxnID/EditSequence/TxnLineID and hashed. Before any change, every project line must map and every commitment allocation must fit. If not, the Bill remains REVIEW and prior ledger values remain intact. Unsupported grouped, tax-inclusive, foreign-currency and negative Bill cases require review. Cheques, credit-card charges, Vendor Credits and payroll imports are not enabled.

On a changed Bill, one serializable transaction reverses old active ActualCost rows, restores their consumption, inserts the new version's line actuals, consumes linked commitments and recalculates fulfillment. Removed lines are reversed. A returned zero-amount/voided Bill removes its prior exposure accordingly. ActualCost unique external keys include connection, TxnID, line ID and version hash. Reporting reads only normalized Budget/Commitment/ActualCost, never staging mirrors.

Bill LinkedTxn PurchaseOrder identifiers can match a synchronized document; automatic line allocation requires one unique matching Project/CostCode commitment line. Ambiguous/no links import mapped actuals but flag commitment review. Existing Project ActualCost reconciliation provides explicit allocation; the accounting API additionally accepts reviewed line-ID→CommitmentLine overrides before application. No fuzzy vendor/amount matching occurs. Overbilling blocks application until an authorized PO revision increases the commitment. Example: $25,000 PO + $10,000 Bill → $15,000 remaining + $10,000 actual, not $35,000.

Deleted Bills that no longer appear in BillQuery are not automatically detected/reversed in this version. Reconcile deletions with the Controller; do not treat a missing incremental result as deletion. A future verified deletion-query workflow is required before unattended historical reconciliation.

## Operator interface and deployment

Use `/financials/quickbooks` or `/settings/quickbooks`: connection health, safe diagnostics, discovery queue, Project/Vendor/Employee/Item mappings, PO/time queue, blocked/failed jobs, reviewed PO modifications, uncertain-write verification, Bill rechecks, issues and run history. Queue means waiting for Web Connector; it cannot force an immediate PC connection. Mapping filters distinguish unmapped, mapped, disabled, conflict and stale data. No automatic name matching/creation occurs.

OWNER/CONTROLLER receive QUICKBOOKS_VIEW, CONFIGURE, MAP, QUEUE and RECONCILE. External roles receive none. Browser routes use ordinary authenticated capability checks and the existing write-origin boundary. SOAP uses only dedicated credentials/tickets. In-app notifications are event-triggered and deduplicated by unresolved issue key; successful records do not generate notification spam. Health reads do not emit alerts. Scheduled overdue-connector reminders remain future automation.

Apply `202609240004_quickbooks_desktop` after all existing migrations. Railway's existing predeploy migration and standalone Node/PostgreSQL setup remain valid. No new environment variables; retain APP_URL, APP_SECRET and DATABASE_URL. Do not put the connector password into environment variables or the QWC file. No live QuickBooks company was contacted during automated development.

Protocol references: [Intuit QBWC programmer guide](https://static.developer.intuit.com/qbSDK-current/doc/pdf/QBWC_proguide.pdf), [Intuit Desktop SDK programmer guide](https://static.developer.intuit.com/resources/QBSDK_ProGuide.pdf), [Intuit SDK samples](https://github.com/IntuitDeveloper/QBXML_SDK_Samples). Fixture tests establish application behavior, not certification against a live QuickBooks edition.
