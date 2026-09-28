# Live QuickBooks Desktop acceptance

Status: **IMPLEMENTED — LIVE QUICKBOOKS VALIDATION PENDING**. No results below have been performed against Cedar Winds Desktop by this implementation. Record edition/year/country, Web Connector version, company-file copy, date, operator and evidence for each step. Automated fixtures do not replace this checklist. Use [the controlled pilot](QUICKBOOKS_PILOT.md), not unrestricted ACTIVE mode.

- [ ] 1. Back up the QuickBooks company file and confirm restore procedure.
- [ ] 2. Prefer an isolated staging/test copy; obtain Controller authorization for the chosen file.
- [ ] 3. Install/confirm a compatible supported QuickBooks Web Connector on the Windows accounting PC.
- [ ] 4. Deploy migrations; configure HTTPS APP_URL and DISCOVERY; generate copy-once connector password.
- [ ] 5. Download CWManagement.qwc and Add Application in Web Connector.
- [ ] 6. Enter the generated password; confirm QWC contains no password.
- [ ] 7. Authorize the intended company file under the appropriate QuickBooks administrator account.
- [ ] 8. Run Update Selected; inspect safe callback/run diagnostics.
- [ ] 9. Verify observed company name and file path, then explicitly bind the company.
- [ ] 10. Queue discovery only; verify no accounting transaction was created.
- [ ] 11. Confirm Customer/Customer:Job discovery and full names.
- [ ] 12. Confirm active/inactive Vendor discovery.
- [ ] 13. Confirm Employee discovery without wage/payroll values.
- [ ] 14. Confirm Item subtype and Account discovery.
- [ ] 15. Map one TEST Project to its exact Customer:Job ListID.
- [ ] 16. Map one TEST vendor Contact/Company.
- [ ] 17. Map one TEST employee User to an existing QB Employee.
- [ ] 18. Map required Cost Codes/Items; confirm Service Item for time.
- [ ] 19. Save the explicit pilot Project, Vendor Contact, Employee, Cost Codes, PO revision and TimeSegment allowlist; attest to a recoverable backup; pass pre-flight and select PILOT. Preview then queue one genuinely zero-tax issued test PO (taxable POs remain blocked).
- [ ] 20. Confirm Vendor, Customer:Job, quantities, rates, subtotal, number/Memo and returned TxnID in QuickBooks.
- [ ] 21. Queue one approved, closed test TimeSegment.
- [ ] 22. Confirm Employee, date/timezone, Customer:Job, Service Item and duration in QuickBooks; confirm payroll preference compatibility.
- [ ] 23. Choose an explicit import start date; create a small test Bill with project Item lines and a reliable PO link.
- [ ] 24. Run Web Connector and inspect Bill query/iterator results.
- [ ] 25. Open staged Bill review, verify line allocations/commitment matches, preview and apply the exact reviewed Bill with a reason. Confirm one normalized ActualCost per mapped project Bill line; explicitly ignore known overhead.
- [ ] 26. Verify consumption: $25,000 commitment / $10,000 actual / $15,000 remaining; compare report forecast/variance.
- [ ] 27. Modify the test Bill amount/lines in QuickBooks.
- [ ] 28. Preview/apply the new Bill version; confirm old actual reversal, restored/reapplied consumption and new active amount. Test stale-preview and overage rejection.
- [ ] 29. Repeat queries/responses/runs and verify no duplicate actuals, POs or time.
- [ ] 30. Review logs/issues, foreign-currency/tax/group controls, expired tickets, password rotation and wrong-file protection.
- [ ] 31. Validate a reviewed PO modification and an external EditSequence conflict; uncertain-write recovery must never resend Add blindly.
- [ ] 32. Test revoked browser permissions and external Client/Trade isolation.
- [ ] 33. Resolve Canadian purchase-tax-code support, deleted-Bill reconciliation and applicable time/payroll preferences before depending on those workflows.
- [ ] 34. Only after Controller sign-off enable the validated scope for broader production use.

- [ ] 35. Pause with queued work. Confirm authentication/reads continue, no new exports or ActualCost application occur, and in-flight write outcomes remain available for reconciliation.
- [ ] 36. Verify a deleted test Bill in Desktop; use reasoned manual reversal/hold and confirm restored commitment, unchanged history, notification and no resurrection after repeated queries. Restore only after source review.
- [ ] 37. Test explicit commitment unlink/relink; verify Actual + Remaining Committed without duplicated exposure.
- [ ] 38. Record all ten required live results in the dashboard (include versions, expected/actual results and source IDs). Review unresolved issues before deliberate ACTIVE promotion. Owner override must have a reason and is not LIVE VALIDATED.

## Test environment and sign-off

| Field | Operator entry |
|---|---|
| Date / timezone | Pending |
| Tester and reviewer | Pending |
| QuickBooks Desktop edition/year/version/country | Pending |
| QuickBooks Web Connector version | Pending |
| Company name / legal name / file path (no credentials) | Pending |
| CW connection ID / bound company hash | Pending |
| CW deployment commit / migration status | Pending |
| Backup date and restore verified by | Pending |
| Test vs production company copy | Pending |
| Pilot Project / Vendor / Employee / Cost Codes | Pending |
| PO revision / TimeSegment / Bill TxnID and line IDs | Pending |
| Controller approval to proceed / remaining restrictions | Pending |

Copy a row for every test, including failures and retries. Never replace a failed historical result with a pass; append the follow-up. Do not record connector passwords, tokens, database URLs or payroll compensation.

| Test / step | Date | Tester | Test record IDs | Expected result | Actual result | Pass/fail | Notes / evidence |
|---|---|---|---|---|---|---|---|
| CONNECTION | Pending | | | Authenticated ticket; no write | Not performed | Pending | |
| COMPANY | Pending | | | Intended company observed and deliberately bound | Not performed | Pending | |
| DISCOVERY | Pending | | | Customers, Vendors, Employees and Items returned; no writes | Not performed | Pending | |
| MAPPINGS | Pending | | | Pilot identities mapped to correct active ListIDs | Not performed | Pending | |
| PO | Pending | | | One eligible PO and one returned TxnID; values agree | Not performed | Pending | |
| TIME | Pending | | | One approved entry; date/duration/references agree | Not performed | Pending | |
| BILL | Pending | | | Reviewed X actual; committed remainder reduced by X | Not performed | Pending | |
| MODIFIED_BILL | Pending | | | Reviewed Y replaces X; no X+Y double count | Not performed | Pending | |
| DUPLICATE_RETRY | Pending | | | Repeat query/response produces no duplicate | Not performed | Pending | |
| FAILURE_RECOVERY | Pending | | | Pause/mismatch/overage/permissions/uncertain-write controls work | Not performed | Pending | |
| Deletion / void / hold | Pending | | | Reversed actual and restored consumption; no silent reimport | Not performed | Pending | |

Do not mark the roadmap “LIVE VALIDATED” until actual Cedar Winds environment results and remaining restrictions are recorded here. No production accounting write was performed during development.
