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
          Choose an actual-cost import start date. Activate outbound synchronization only after
          completing the live validation checklist.
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
