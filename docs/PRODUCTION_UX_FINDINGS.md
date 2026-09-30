# Production UX findings

## Observed

- Nelson confirmed Owner login works on the production URL.
- Earlier deployment served successfully despite a skipped migration hook. This could appear as broken/blank data screens; the readiness pass adds a fail-closed startup migration guard.
- Live authenticated CRM, reporting, warranty and dashboard API reads returned 200; anonymous internal API requests returned 401. This is an API smoke check, not a visual walkthrough.
- Settings previously lacked a useful production test result view. The readiness panel now separates configuration, real tests, inbox confirmation and controlled scheduler results.

## Still to validate live

The controlled production API pilot passed CRM conversion, warranty lifecycle, report scope and Client Vision equivalence. Full visual business workflow, phone-sized warranty/photo flows, all HOW TO destinations, PDF/print/export usability and empty states still require the dedicated test-project walk-through. Existing local Playwright coverage is not evidence of a live browser walkthrough. Do not mark these complete from API status alone.

## Follow-up items

- Error recovery for failed uploads should be assessed on actual job-site connectivity.
- Confirm terminology with the Controller during the first Bill/commitment reconciliation; QuickBooks remains live-validation pending.
- Assess whether the readiness panel's diagnostics need shorter user-facing names after operator feedback.
- Verify the current company's real templates, catalog and default wording. Automated fixtures do not prove that real company standards are populated.

## Configuration blockers resolved during live checks

- SMTP_HOST differed from the working CWTimeClock service. Corrected only that variable; SMTP submission and Nelson's inbox receipt are confirmed.
- Railway did not apply the file-based cron setting; the operator applied the schedule directly. The first hourly firing was observed and exited safely while disabled.
- No active legacy local file metadata was found. The private Railway bucket passed real authenticated and isolation checks.
