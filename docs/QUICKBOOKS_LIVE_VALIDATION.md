# Live QuickBooks Desktop acceptance

Status: **NOT LIVE VALIDATED**. Record edition/year/country, Web Connector version, company-file copy, date, operator and evidence for each step. Automated fixtures do not replace this checklist.

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
- [ ] 19. Deliberately activate; queue one small zero-tax issued test PO (taxable POs remain blocked).
- [ ] 20. Confirm Vendor, Customer:Job, quantities, rates, subtotal, number/Memo and returned TxnID in QuickBooks.
- [ ] 21. Queue one approved, closed test TimeSegment.
- [ ] 22. Confirm Employee, date/timezone, Customer:Job, Service Item and duration in QuickBooks; confirm payroll preference compatibility.
- [ ] 23. Choose an explicit import start date; create a small test Bill with project Item lines and a reliable PO link.
- [ ] 24. Run Web Connector and inspect Bill query/iterator results.
- [ ] 25. Confirm one normalized ActualCost per mapped project Bill line; no overhead import.
- [ ] 26. Verify consumption: $25,000 commitment / $10,000 actual / $15,000 remaining; compare report forecast/variance.
- [ ] 27. Modify the test Bill amount/lines in QuickBooks.
- [ ] 28. Confirm old actual reversal, restored/reapplied consumption and new active amount; test overage rejection.
- [ ] 29. Repeat queries/responses/runs and verify no duplicate actuals, POs or time.
- [ ] 30. Review logs/issues, foreign-currency/tax/group controls, expired tickets, password rotation and wrong-file protection.
- [ ] 31. Validate a reviewed PO modification and an external EditSequence conflict; uncertain-write recovery must never resend Add blindly.
- [ ] 32. Test revoked browser permissions and external Client/Trade isolation.
- [ ] 33. Resolve Canadian purchase-tax-code support, deleted-Bill reconciliation and applicable time/payroll preferences before depending on those workflows.
- [ ] 34. Only after Controller sign-off enable the validated scope for broader production use.

Do not mark the roadmap “LIVE VALIDATED” until actual Cedar Winds environment results and remaining restrictions are recorded here. No production accounting write was performed during development.
