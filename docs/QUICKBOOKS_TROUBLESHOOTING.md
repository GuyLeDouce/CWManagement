# QuickBooks troubleshooting

Start with [Live Validation / pre-flight](QUICKBOOKS_PILOT.md). PAUSED continues authentication/queries but stops financial mutations. HELD Bills cannot reimport; restore to review after accounting-side verification. REVIEW_REQUIRED means a manual allocation/restore needs an exact preview and reasoned application. Inspect each run for safe source/request/status details. The deployment migration resets existing ACTIVE connections to DISCOVERY deliberately.

Open Financials → QuickBooks. Copy safe diagnostics (health, callback/contact, mode, version and blocked count). Never copy passwords, hashes, database URLs, raw authentication SOAP or unredacted accounting payloads into tickets.

| State | Action |
|---|---|
| NEVER_CONNECTED | Install QWC on the QuickBooks PC, authorize correct company, enter copy-once password, run Update Selected |
| STALE | Check PC/Web Connector running, Auto-Run interval and outbound HTTPS; CW cannot initiate a connection |
| COMPANY_MISMATCH | Stop transactions, restore intended company file, run discovery and explicitly reconfirm original identity; never rebind history casually |
| BLOCKED | Read prerequisite message, refresh lists/map missing identity, then retry |
| FAILED | Review safe QB status and fix source/configuration; retry only after review |
| RECONCILIATION_REQUIRED | Determine whether a write executed; do not resend blindly |
| Bill REVIEW | Fix mappings/overage, recheck staged Bill; prior actuals remain unchanged |
| Bill UNRECONCILED | Project actual exists but commitment match needs review in Project ActualCost workspace |
| TIME CONFLICT | Correct/review the entry in QuickBooks with Controller; CW does not automatically modify payroll-sensitive time |

Status 3100: existing name—discover/map. 3120/3140: missing/invalid reference—refresh lists. 3200: stale EditSequence—refresh PO, compare, explicitly authorize current CW revision. 3175/3176: record lock—bounded delayed retries, then operator review. 3260: insufficient permissions—review authorization, no automatic retry. 3250: unsupported/disabled feature. 3261/3262: sensitive-data permission/payroll subscription requirements; do not enable broad payroll access without Controller review. Raw status messages are not ordinary UI/log output.

Close the previous connector session before adopting an uncertain PO/time write. Supply its exact TxnID using “Verify uncertain transaction”; the next connector run queries it and checks original references/values before mapping it. A mismatch stays unresolved. “Record resolution” records an audit note only; it does not bypass job safety, change accounting or approve a resend. For rejected PO Mod with stale sequence, use “Refresh QuickBooks PO for review”, inspect both versions and authorize deliberately.

Password rotation requires explicit confirmation, returns a new copy-once value and expires tickets. Enter the new password in Web Connector. Old passwords are never displayed. Missing mappings, unavailable operators and expired tickets fail closed.

Current controls: taxable PO export, foreign-currency/tax-inclusive/grouped/negative Bills, deleted-Bill automation, employee creation and automatic time corrections are not supported. A company-file move/name change requires deliberate investigation. Archived request evidence is retained; implement a reviewed retention policy before very large historical imports.
