# Controlled full-project pilot

This is a manual acceptance script, not a record of completed live testing. Use **TEST - CWManagement Full Workflow**, a unique TEST project number, and explicitly consenting internal/client/trade testers. Keep all test contacts unmistakably labelled. Do not invite real customers accidentally. QuickBooks stays DISCOVERY/PILOT and no record is queued to accounting in this script.

For each step record date, tester, record IDs, expected result, actual result, pass/fail and notes. Never record passwords, hashes, invitation tokens or connection strings. Attach real screenshots only after checking privacy.

| Step | Action and expected result | Actual / IDs / tester / date |
|---|---|---|
| CRM | Create test contact/opportunity using a company stage, add follow-up, complete it, move stage, mark Won. History and My Work agree. | Pending |
| Conversion | Convert once through Project wizard. Select test client, PM, dates and an existing real template. Repeat cannot create a duplicate. Sales notes are not exposed. | Pending |
| Project | Confirm copied schedule/estimate/selections and team; template changes do not alter project. | Pending |
| Estimate | Add template sections, catalog item, assembly and custom line. Change quantity; verify unit costs, markup, client price and HST using a hand calculation. | Pending |
| Proposal | Generate, preview, issue and accept test proposal. Issued evidence remains stable; budget baseline appears once. | Pending |
| Budget | Verify original/current budget, contract baseline and no actual/commitment duplication. | Pending |
| Selection | Create linked allowance/options, publish, open Client Vision and actual client. Verify only client prices and safe attachments appear. Decide once; retry has no duplicate effect. | Pending |
| Change Order | Create variance CO, issue, approve as correct client. Verify current contract/current budget change once and original baseline remains. | Pending |
| Purchasing | Create/approve/issue test PO and WO to designated trade; drafts stay private. Trade acknowledges exact revision; retry stays single. No QuickBooks queue action. | Pending |
| Operations | Create internal daily log and published client summary, upload internal/client/trade files and photos. Each portal sees only its allowed subset. | Pending |
| Warranty | Client submits test service request/photo. Staff accepts, assigns trade and due date. Assigned trade submits evidence/ready. Staff verifies completion; client verifies. Other client/trade cannot read or act. | Pending |
| Time | Designated employee uses genuine QR workflow, switches task/project and clocks out; PM corrects/reviews/approves. Verify hours/report; do not send payroll or QB test time. | Pending |
| Reports | Filter portfolio, financial, CRM, time and warranty reports. Verify known test totals, CSV and print; PM cannot gain another project's data through filters/export. | Pending |
| Client Vision | Eye opens new tab, correct client selector, final-only vs tax breakdown presentation, no private prices and no actionable client approvals/messages/warranty submission. | Pending |
| Mobile/help | Check client/trade help, photo upload, schedule and warranty on phone-sized viewport; internal HOW TO searches and links resolve. | Pending |
| Automation | Run only controlled internal diagnostic; same request repeated/fresh process yields one delivery. Later enable one reminder class at a time with explicit consent. | Pending |

## Cleanup

Archive the project; revoke client/trade grants; deactivate disposable users and contacts; clear their sessions/tokens. Keep immutable proposals, selections, approvals, COs, commitments, actuals, warranty history and audit evidence. Do not delete production records with SQL to make reports look clean. Label financial test records and filter/archive appropriately. If a test reached QuickBooks, stop and use the Controller's documented accounting reconciliation process; local deletion is not reversal.

Readiness storage diagnostics remove only their own small object bytes, archive metadata/project and revoke temporary identities. Interrupted cleanup can be retried in Settings using its recorded ID. Bucket/database recovery must preserve metadata-to-object correspondence.

## Optional controlled API pilot helper

`node scripts/production-business-smoke.mjs --run` inside the production app creates clearly labelled disposable users and a test project, exercises password login, CRM follow-up/conversion, warranty transitions, reports and portal isolation, then archives/revokes test access. It requires normal automation disabled, never queues accounting, never sends email, and preserves history. Run only with operator authorization. It is not a substitute for visual/mobile review, estimate/proposal/financial approval or real employee clock validation. Interrupted runs require review of TEST records/audit IDs before rerunning.
