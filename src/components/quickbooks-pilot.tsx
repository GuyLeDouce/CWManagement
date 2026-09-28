'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import type { dashboard } from '@/lib/quickbooks/admin';
import type { pilotDashboard, runDetail, previewRequest } from '@/lib/quickbooks/diagnostics';
import type { applyBill, Bill } from '@/lib/quickbooks/bills';
import type { Pilot } from '@/lib/quickbooks/pilot';
import { ActionButton, ErrorBox } from './ui';
type Data = Awaited<ReturnType<typeof dashboard>>;
type PilotData = Awaited<ReturnType<typeof pilotDashboard>>;
const steps = [
  'CONNECTION',
  'COMPANY',
  'DISCOVERY',
  'MAPPINGS',
  'PO',
  'TIME',
  'BILL',
  'MODIFIED_BILL',
  'DUPLICATE_RETRY',
  'FAILURE_RECOVERY',
];
const note = () => {
  const value = window.prompt('Reason / source verification evidence (required):');
  if (!value || value.trim().length < 5)
    throw new Error('A reason of at least five characters is required.');
  return value.trim();
};
export function QuickBooksPreview({
  connectionId,
  operation,
  marker,
}: {
  connectionId: string;
  operation: 'PURCHASE_ORDER' | 'TIME';
  marker: string;
}) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof previewRequest>>>();
  return (
    <>
      <ActionButton
        action={async () => {
          const form = document.getElementById(marker)!.closest('form')!;
          const entityId = String(new FormData(form).get('entityId') ?? '');
          setResult(await api('quickbooks/preview', { connectionId, operation, entityId }));
        }}
      >
        Preview QuickBooks Request
      </ActionButton>
      {result && (
        <div role="status">
          <strong>{result.ready ? 'Ready for QuickBooks' : result.blocker}</strong>
          <p>Preview sends nothing. Eligibility is checked again when queued and sent.</p>
          {result.ready && (
            <>
              <pre>
                {JSON.stringify({ references: result.references, values: result.values }, null, 2)}
              </pre>
              <details>
                <summary>Diagnostic qbXML (accounting users only)</summary>
                <pre>{result.xml}</pre>
              </details>
            </>
          )}
        </div>
      )}
    </>
  );
}
export function QuickBooksRun({ id }: { id: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof runDetail>>>();
  return (
    <>
      <ActionButton action={async () => setResult(await api('quickbooks/run', { id }))}>
        Inspect run
      </ActionButton>
      {result && (
        <div>
          <p>
            {result.run.mode} · {result.run.companyName} · {result.run.status}
          </p>
          <p>
            Started {String(result.run.startedAt)} · Completed{' '}
            {String(result.run.completedAt ?? 'Not complete')}
          </p>
          {result.requests.map((r) => (
            <div className="card" key={r.id}>
              <strong>
                {r.operation} · {r.job.entityId ?? r.job.entityType}
              </strong>
              <p>
                {r.statusCode ?? 'Awaiting response'} ·{' '}
                {r.result ?? r.job.lastError ?? r.job.status}
              </p>
            </div>
          ))}
          {result.jobs
            .filter((j) => j.status === 'BLOCKED')
            .map((j) => (
              <p key={j.id}>
                {j.operation} BLOCKED: {j.lastError}
              </p>
            ))}
        </div>
      )}
    </>
  );
}
export function QuickBooksPilot({
  connectionId,
  data,
  onDone,
}: {
  connectionId: string;
  data: Data;
  onDone: () => Promise<unknown>;
}) {
  const [result, setResult] = useState<PilotData>();
  const [error, setError] = useState('');
  const load = async () => {
    setResult(await api('quickbooks/preflight', { connectionId }));
  };
  useEffect(() => {
    let active = true;
    api<PilotData>('quickbooks/preflight', { connectionId })
      .then((x) => {
        if (active) setResult(x);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [connectionId]);
  const c = data.connections.find((c) => c.id === connectionId)!;
  const p = (c.pilotConfig ?? {}) as Partial<Pilot>;
  const done = async () => {
    await load();
    await onDone();
  };
  const options = (values: { id: string; name: string }[]) =>
    values.map((x) => (
      <option key={x.id} value={x.id}>
        {x.name}
      </option>
    ));
  return (
    <section className="card" id="live-validation">
      <h2>Live Validation</h2>
      <strong>{result?.status ?? 'Loading pre-flight'}</strong>
      <p>
        Mode: {c.mode}. Unrestricted synchronization {c.mode === 'ACTIVE' ? 'enabled' : 'disabled'}.
      </p>
      <p>
        Queue a record here, then run “Update Selected” in QuickBooks Web Connector on the
        accounting computer, or wait for the configured Auto-Run interval.
      </p>
      <ErrorBox message={error} />
      <ActionButton action={load}>Refresh pre-flight</ActionButton>
      {result && (
        <>
          <ul>
            {result.checks.map((x) => (
              <li key={x.name}>
                {x.ok ? '✓' : '□'} {x.name}: {x.detail}
              </li>
            ))}
          </ul>
          <p>
            {result.authenticatedAt ? '✓ Authenticated' : '□ Awaiting authentication'} ·{' '}
            {result.bound ? '✓ Company bound' : '□ Bind company'} — {result.companyName}
          </p>
          <p>
            Discovery:{' '}
            {['Customer', 'Vendor', 'Employee', 'Item']
              .map((t) => (result.discovered.some((x) => x.operation === t) ? '✓ ' : '□ ') + t)
              .join(' · ')}
          </p>
          <p>
            Recorded transactions: {result.exit.po ? '✓' : '□'} PO · {result.exit.time ? '✓' : '□'}{' '}
            Time · {result.exit.bill ? '✓' : '□'} Bill · {result.exit.modified ? '✓' : '□'} Modified
            Bill
          </p>
          <p>
            Live evidence still required:{' '}
            {result.exit.missing.join(', ') || 'All required steps recorded as passed'}
          </p>
        </>
      )}
      <details>
        <summary>Configure pilot allowlist (pause first)</summary>
        <form
          id="qb-pilot"
          onSubmit={(e) => e.preventDefault()}
          key={connectionId + JSON.stringify(p)}
        >
          <label>
            Pilot Project
            <select name="projectId" defaultValue={p.projectId}>
              <option value="">Choose Project</option>
              {options(data.options.PROJECT)}
            </select>
          </label>
          <label>
            Pilot Vendor Contact
            <select name="vendorContactId" defaultValue={p.vendorContactId}>
              <option value="">Choose Vendor</option>
              {options(data.options.VENDOR_CONTACT)}
            </select>
          </label>
          <label>
            Pilot Employee
            <select name="employeeId" defaultValue={p.employeeId}>
              <option value="">Choose Employee</option>
              {options(data.options.EMPLOYEE)}
            </select>
          </label>
          <label>
            Pilot Cost Codes
            <select name="costCodeIds" multiple defaultValue={p.costCodeIds ?? []}>
              {options(data.options.COST_CODE)}
            </select>
          </label>
          <label>
            Pilot Purchase Order revision
            <select name="purchasingRevisionId" defaultValue={p.purchasingRevisionId}>
              <option value="">Choose issued PO</option>
              {data.purchasing.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.document.number} Rev {x.revision}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pilot approved time
            <select multiple name="timeSegmentIds" defaultValue={p.timeSegmentIds ?? []}>
              {data.time.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.user.firstName} {x.user.lastName} {String(x.effectiveStart)} ({x.id})
                </option>
              ))}
            </select>
          </label>
          <label>
            <input name="backupConfirmed" type="checkbox" defaultChecked={!!c.backupConfirmedAt} />I
            have confirmed a recoverable backup of the selected QuickBooks company file.
          </label>
          <label>
            Reason
            <input name="reason" minLength={5} required />
          </label>
          <ActionButton
            action={async () => {
              const f = new FormData(document.getElementById('qb-pilot') as HTMLFormElement);
              await api('quickbooks/pilot', {
                connectionId,
                pilot: {
                  projectId: f.get('projectId'),
                  vendorContactId: f.get('vendorContactId'),
                  employeeId: f.get('employeeId'),
                  costCodeIds: f.getAll('costCodeIds'),
                  purchasingRevisionId: f.get('purchasingRevisionId'),
                  timeSegmentIds: f.getAll('timeSegmentIds'),
                },
                backupConfirmed: f.has('backupConfirmed'),
                reason: f.get('reason'),
              });
              await done();
            }}
          >
            Save pilot scope
          </ActionButton>
        </form>
      </details>
      <details>
        <summary>Record actual live test result</summary>
        <p>
          Only record tests performed against the stated QuickBooks company. Automated fixtures do
          not establish live compatibility. Records are append-only; add a corrected result if
          necessary.
        </p>
        <form id="qb-evidence" onSubmit={(e) => e.preventDefault()}>
          <label>
            Step
            <select name="step">
              {steps.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            QuickBooks Desktop edition/version
            <input name="desktopVersion" required />
          </label>
          <label>
            Web Connector version
            <input name="connectorVersion" required />
          </label>
          <label>
            Test record IDs
            <input name="recordIds" required />
          </label>
          <label>
            Expected / actual result and notes
            <textarea name="note" minLength={10} required />
          </label>
          <label>
            <input name="passed" type="checkbox" />
            Passed in the actual test company
          </label>
          <ActionButton
            action={async () => {
              const f = new FormData(document.getElementById('qb-evidence') as HTMLFormElement);
              await api('quickbooks/evidence', {
                ...Object.fromEntries(f),
                connectionId,
                passed: f.has('passed'),
              });
              await done();
            }}
          >
            Record live result
          </ActionButton>
        </form>
        {result?.exit.evidence.map((e) => (
          <p key={e.id}>
            {e.step} — {e.passed ? 'PASS' : 'FAIL'} · {String(e.createdAt)} · Tester {e.actorId} ·{' '}
            {e.note}
          </p>
        ))}
      </details>
      <h3>Unmapped Actual Costs / Bill review</h3>
      <p>
        Discovery and paused modes only stage Bills. In PILOT, review and apply each exact Bill
        version explicitly. Missing Job/Item/Account mappings never discard a line. Unsupported tax,
        currency, grouped or negative Bills require correction/review in QuickBooks.
      </p>
      {result?.bills.map((b) => (
        <BillReview
          key={b.id}
          bill={b}
          data={data}
          commitments={result.commitments}
          onDone={done}
        />
      ))}
    </section>
  );
}
function BillReview({
  bill: b,
  data,
  commitments,
  onDone,
}: {
  bill: PilotData['bills'][number];
  data: Data;
  commitments: PilotData['commitments'];
  onDone: () => Promise<unknown>;
}) {
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof applyBill>>>();
  const payload = b.payload as unknown as Bill;
  return (
    <details className="card">
      <summary>
        Bill {payload.reference || b.txnId} · {payload.date} · {b.status}
      </summary>
      <p>
        Vendor {payload.vendor} · TxnID {b.txnId} · EditSequence {b.editSequence}
      </p>
      <p>{b.lastError ?? payload.unsupported}</p>
      <p>
        Applied actuals:{' '}
        {b.actuals
          .map((a) => `${a.amount} ${a.reversedAt ? '(reversed)' : ''} [${a.id}]`)
          .join(', ') || 'None'}
      </p>
      {payload.lines.map((l) => (
        <form key={l.id} id={'bill-line-' + b.id + '-' + l.id} onSubmit={(e) => e.preventDefault()}>
          <h4>
            {l.description || l.id} — {l.amount}
          </h4>
          <p>
            QB Job: {l.project || 'Missing'} · {l.kind}: {l.item || 'Missing'}
          </p>
          <label>
            Reviewed Project
            <select name="projectId">
              <option value="">Use mapping</option>
              {data.options.PROJECT.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reviewed Cost Code
            <select name="costCodeId">
              <option value="">Use mapping</option>
              {data.options.COST_CODE.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Commitment allocation
            <select name="link">
              <option value="AUTO">Match reliable PO references</option>
              <option value="">Explicitly unlink commitment</option>
              {commitments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.description} ({String(p.committedAmount)} committed, {String(p.consumedAmount)}{' '}
                  consumed)
                </option>
              ))}
            </select>
          </label>
          <label>
            <input name="ignore" type="checkbox" />
            Ignore as known non-project cost
          </label>
          <ActionButton
            action={async () => {
              const f = new FormData(
                document.getElementById('bill-line-' + b.id + '-' + l.id) as HTMLFormElement,
              );
              const decisions = {
                ...((b.lineDecisions as object) ?? {}),
                [l.id]: {
                  projectId: f.get('projectId') || undefined,
                  costCodeId: f.get('costCodeId') || undefined,
                  ignore: f.has('ignore'),
                },
              };
              const links = { ...((b.lineLinks as Record<string, string>) ?? {}) };
              if (f.get('link') === 'AUTO') delete links[l.id];
              else links[l.id] = String(f.get('link'));
              await api('quickbooks/reconcile', {
                action: 'bill-allocate',
                id: b.id,
                note: note(),
                lineDecisions: decisions,
                lineLinks: links,
              });
              setPreview(undefined);
              await onDone();
            }}
          >
            Save reviewed allocation
          </ActionButton>
        </form>
      ))}
      {payload.unsupportedLines?.map((l) => (
        <p key={l.id}>
          Unsupported group: {l.description} — {l.amount}
        </p>
      ))}
      <ActionButton
        action={async () =>
          setPreview(
            await api('quickbooks/reconcile', {
              action: 'bill-preview',
              id: b.id,
              note: 'Operator requested Bill reconciliation preview.',
            }),
          )
        }
      >
        Preview Bill → ActualCost
      </ActionButton>
      {preview && (
        <div>
          <strong>{preview.ready ? 'Ready for reviewed import' : preview.blocker}</strong>
          <pre>{JSON.stringify(preview, null, 2)}</pre>
          {preview.ready && (
            <ActionButton
              action={async () => {
                await api('quickbooks/reconcile', {
                  action: 'bill',
                  id: b.id,
                  reviewedHash: preview.reviewedHash,
                  note: note(),
                });
                setPreview(undefined);
                await onDone();
              }}
            >
              Apply reviewed Bill
            </ActionButton>
          )}
        </div>
      )}
      <ActionButton
        action={async () => {
          await api('quickbooks/reconcile', {
            action: b.suppressedAt ? 'bill-restore' : 'bill-hold',
            id: b.id,
            note: note(),
          });
          setPreview(undefined);
          await onDone();
        }}
      >
        {b.suppressedAt ? 'Restore to review' : 'Reverse imported Bill / hold non-project Bill'}
      </ActionButton>
      <p>
        A hold restores consumed commitments and preserves reversal history. It never deletes the
        accounting Bill. Restore returns it to review.
      </p>
    </details>
  );
}
