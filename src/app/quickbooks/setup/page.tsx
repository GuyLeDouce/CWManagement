import Link from 'next/link';
export default function Page() {
  return (
    <main className="page">
      <h1>Cedar Winds QuickBooks Desktop setup</h1>
      <p>
        QuickBooks Web Connector initiates HTTPS requests to CWManagement. No inbound connection to
        your computer is needed.
      </p>
      <ol>
        <li>Back up your company file and use a staging copy for validation.</li>
        <li>Ask your Controller to configure discovery mode in CWManagement.</li>
        <li>Download CWManagement.qwc and open it with QuickBooks Web Connector.</li>
        <li>
          Open the intended QuickBooks company file, authorize access, and enter the separately
          generated password.
        </li>
        <li>
          Run Update Selected. Return to CWManagement to verify company identity, discover lists and
          confirm mappings.
        </li>
        <li>
          Choose an actual-cost import start date. In Live Validation, save the test Project,
          Vendor, Employee, Cost Codes, issued PO revision and approved time allowlist. Confirm the
          recoverable backup and resolve all pre-flight blockers before choosing PILOT.
        </li>
        <li>
          Preview and queue one eligible zero-tax PO, then run Update Selected and compare it in
          Desktop. Repeat for one approved time entry.
        </li>
        <li>
          Create a small test Bill in Desktop, linked to the test PO. Queue the Bill query, run
          Update Selected, then preview and explicitly apply the staged Bill in CWManagement.
        </li>
        <li>
          Modify the test Bill, repeat the query/review, and verify actual costs and remaining
          commitment. Test retries, pause, overages and manual reversal/hold without deleting
          history.
        </li>
        <li>
          Record Desktop/Web Connector versions, source IDs and actual results in Live Validation.
          Stay in PILOT or PAUSED until the Controller completes the exit checks. ACTIVE requires
          deliberate approval; it is not needed for the pilot.
        </li>
      </ol>
      <p>
        Queue for QuickBooks schedules work for the next Web Connector run. It does not immediately
        contact the accounting computer.
      </p>
      <Link href="/financials/quickbooks">Open accounting dashboard</Link>
    </main>
  );
}
