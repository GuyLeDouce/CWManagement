'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, useApi } from '@/lib/client';
import type { dashboard } from '@/lib/quickbooks/admin';
import { ActionButton, ErrorBox, Loading } from './ui';
import { QuickBooksPilot, QuickBooksPreview, QuickBooksRun } from './quickbooks-pilot';
type Data = Awaited<ReturnType<typeof dashboard>>;
export function QuickBooksScreen() {
  const { data, error, refresh } = useApi<Data>('quickbooks/dashboard');
  const [selected, setSelected] = useState(''),
    [password, setPassword] = useState(''),
    [type, setType] = useState<keyof Data['options']>('PROJECT'),
    [filter, setFilter] = useState(''),
    [mappingFilter, setMappingFilter] = useState('all');
  if (!data) return error ? <ErrorBox message={error} /> : <Loading />;
  const c = data.connections.find((x) => x.id === selected) ?? data.connections[0];
  const id = c?.id;
  const candidates = data.candidates.filter(
    (x) =>
      x.connectionId === id &&
      x.type ===
        {
          PROJECT: 'Customer',
          VENDOR_CONTACT: 'Vendor',
          VENDOR_COMPANY: 'Vendor',
          EMPLOYEE: 'Employee',
          COST_CODE: 'Item',
          ACCOUNT_COST_CODE: 'Account',
        }[type],
  );
  const submit = async (form: HTMLFormElement, path: string, extra: object = {}) => {
    const values = Object.fromEntries(new FormData(form));
    await api('quickbooks/' + path, { ...values, ...extra });
    await refresh();
  };
  return (
    <div className="management-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Financials / QuickBooks Desktop</span>
          <h1>Accounting connection</h1>
          <p>Queue work here, then run QuickBooks Web Connector on the accounting computer.</p>
        </div>
        <Link href="/quickbooks/setup">Setup instructions</Link>
        <button onClick={() => void refresh()}>Refresh status</button>
      </div>
      <ErrorBox message={error} />
      {data.connections.length > 1 && (
        <select aria-label="Connection" value={id} onChange={(e) => setSelected(e.target.value)}>
          {data.connections.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      )}
      <section className="card">
        <h2>1. Configure → 2. Connect → 3. Verify → 4. Map → 5. Activate</h2>
        <p>
          Discovery is read-only in QuickBooks. Transaction export requires deliberate activation.
          Live QuickBooks validation is pending.
        </p>
        <form key={id ?? 'new'} onSubmit={(e) => e.preventDefault()}>
          <label>
            Name
            <input name="name" defaultValue={c?.name ?? 'Cedar Winds QuickBooks'} />
          </label>
          <label>
            Connector username
            <input name="username" defaultValue={c?.username ?? 'cedarwinds-qbwc'} />
          </label>
          <label>
            Interval (minutes)
            <input
              name="intervalMinutes"
              type="number"
              min="5"
              max="1440"
              defaultValue={c?.intervalMinutes ?? 30}
            />
          </label>
          <label>
            Import Bills from
            <input
              name="importStartDate"
              type="date"
              defaultValue={c?.importStartDate ? String(c.importStartDate).slice(0, 10) : ''}
            />
          </label>
          <label>
            Mode
            <select name="mode" aria-label="QuickBooks mode" defaultValue={c?.mode ?? 'DISCOVERY'}>
              <option>DISCOVERY</option>
              <option>PILOT</option>
              <option>ACTIVE</option>
              <option>PAUSED</option>
            </select>
          </label>
          <label>
            <input type="checkbox" name="confirmActivation" />I deliberately authorize unrestricted
            ACTIVE synchronization after reviewing pilot exit checks.
          </label>
          <label>
            Activation reason
            <input name="activationReason" />
          </label>
          <label>
            <input type="checkbox" name="ownerOverride" />
            Owner override of incomplete live evidence (reason required; does not mark live
            validated)
          </label>
          <label>
            <input type="checkbox" name="syncEnabled" defaultChecked={c?.syncEnabled ?? true} />
            Enable connector
          </label>
          <label>
            <input type="checkbox" name="confirmCompany" />I verified this company:{' '}
            {c?.companyName ?? 'Not connected'}
          </label>
          <p>
            Detected company file: {c?.companyFileName ?? 'Not yet observed'}. Binding:{' '}
            {c?.boundCompanyHash ? 'Bound; changes require administrative review' : 'Not bound'}.
            Confirm above to bind CWManagement to this company file.
          </p>
          <label>
            <input type="checkbox" name="rotatePassword" />
            Rotate password and expire existing tickets
          </label>
          <ActionButton
            action={async () => {
              const form = document
                .querySelector<HTMLFormElement>('#qb-config-marker')
                ?.closest('form');
              if (!form) return;
              const f = new FormData(form);
              const result = await api<{ id: string; password: string | null }>(
                'quickbooks/configure',
                {
                  id,
                  name: f.get('name'),
                  username: f.get('username'),
                  intervalMinutes: Number(f.get('intervalMinutes')),
                  importStartDate: f.get('importStartDate') || undefined,
                  mode: f.get('mode'),
                  syncEnabled: f.has('syncEnabled'),
                  confirmCompany: f.has('confirmCompany'),
                  rotatePassword: f.has('rotatePassword'),
                  confirmRotation: f.has('rotatePassword'),
                  confirmActivation: f.has('confirmActivation'),
                  activationReason: f.get('activationReason') || undefined,
                  ownerOverride: f.has('ownerOverride'),
                },
              );
              setSelected(result.id);
              setPassword(result.password ?? '');
              await refresh();
            }}
          >
            Save connection
          </ActionButton>
          <span id="qb-config-marker" />
        </form>
        {password && (
          <div role="status">
            <p>Copy this password into Web Connector now. It cannot be retrieved later.</p>
            <code>{password}</code>
            <button onClick={() => setPassword('')}>Hide password</button>
          </div>
        )}
        {id && (
          <a className="button" href={'/api/quickbooks/qwc?id=' + encodeURIComponent(id)}>
            Download CWManagement.qwc
          </a>
        )}
      </section>
      {c && (
        <>
          <QuickBooksPilot connectionId={c.id} data={data} onDone={refresh} />
          <section className="card">
            <h2>{c.health}</h2>
            <p>
              {c.companyName ?? 'Company not discovered'} · {c.mode} · qbXML{' '}
              {c.qbXmlVersion ?? 'unknown'}
            </p>
            <p>
              Last contact: {c.lastConnectedAt ? String(c.lastConnectedAt) : 'Never'} · Last
              callback: {c.lastCallback ?? 'None'}
            </p>
            <p>Last successful authentication: {String(c.lastAuthenticatedAt ?? 'Never')}</p>
            <p>Last completed run: {String(c.lastSuccessfulSyncAt ?? 'Never')}</p>
            <p>{c.lastError}</p>
            <ActionButton
              action={() => api('quickbooks/queue', { connectionId: id, operation: 'DISCOVERY' })}
              onDone={() => void refresh()}
            >
              Queue list discovery
            </ActionButton>
            <ActionButton
              action={() => api('quickbooks/queue', { connectionId: id, operation: 'BILLS' })}
              onDone={() => void refresh()}
            >
              Queue Bill import
            </ActionButton>
            <button
              onClick={() =>
                void navigator.clipboard.writeText(
                  JSON.stringify(
                    {
                      health: c.health,
                      lastCallback: c.lastCallback,
                      lastContact: c.lastConnectedAt,
                      qbXmlVersion: c.qbXmlVersion,
                      mode: c.mode,
                      blocked: data.jobs.filter(
                        (x) => x.connectionId === id && x.status === 'BLOCKED',
                      ).length,
                    },
                    null,
                    2,
                  ),
                )
              }
            >
              Copy safe diagnostics
            </button>
          </section>
          <section className="card">
            <h2>Mappings</h2>
            <select
              aria-label="Mapping type"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              {Object.keys(data.options).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select
              aria-label="Mapping status"
              value={mappingFilter}
              onChange={(e) => setMappingFilter(e.target.value)}
            >
              {['all', 'unmapped', 'mapped', 'disabled', 'conflict', 'stale'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <input
              placeholder="Search local records"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {data.options[type]
              .filter((x) => x.name.toLowerCase().includes(filter.toLowerCase()))
              .filter((x) => {
                const m = data.mappings.find(
                  (m) => m.connectionId === id && m.entityType === type && m.entityId === x.id,
                );
                return (
                  mappingFilter === 'all' ||
                  (mappingFilter === 'unmapped'
                    ? !m
                    : mappingFilter === 'mapped'
                      ? m?.enabled && m.status === 'SYNCED'
                      : mappingFilter === 'disabled'
                        ? m && !m.enabled
                        : mappingFilter === 'conflict'
                          ? m?.status === 'CONFLICT'
                          : m &&
                            data.observedAt - new Date(m.lastSeenInQuickBooksAt ?? 0).getTime() >
                              7 * 86400000)
                );
              })
              .map((x) => {
                const m = data.mappings.find(
                  (m) => m.connectionId === id && m.entityType === type && m.entityId === x.id,
                );
                return (
                  <form key={type + x.id} className="card" onSubmit={(e) => e.preventDefault()}>
                    <strong>{x.name}</strong>
                    <p>
                      {m?.quickBooksFullName ?? 'Unmapped'} {m && !m.enabled ? '(disabled)' : ''}
                    </p>
                    <select
                      name="candidateId"
                      aria-label={'QuickBooks record for ' + x.name}
                      defaultValue={
                        candidates.find((q) => q.listId === m?.quickBooksListId)?.id ?? ''
                      }
                    >
                      <option value="">Choose discovered record</option>
                      {candidates
                        .filter((q) => q.active)
                        .map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.fullName} ({q.subtype})
                          </option>
                        ))}
                    </select>
                    <ActionButton
                      action={async () => {
                        const select = document
                          .getElementById('mapping-' + x.id)
                          ?.parentElement?.querySelector('select');
                        await api('quickbooks/mapping', {
                          connectionId: id,
                          type,
                          entityId: x.id,
                          candidateId: select?.value,
                        });
                        await refresh();
                      }}
                    >
                      Confirm mapping
                    </ActionButton>
                    <span id={'mapping-' + x.id} />
                    {m && (
                      <ActionButton
                        action={() =>
                          api('quickbooks/mapping', {
                            connectionId: id,
                            type,
                            entityId: x.id,
                            enabled: false,
                          })
                        }
                        onDone={() => void refresh()}
                      >
                        Disable
                      </ActionButton>
                    )}
                  </form>
                );
              })}
          </section>
          <section className="card">
            <h2>Queue approved records</h2>
            <form onSubmit={(e) => e.preventDefault()}>
              <h3>Explicit Customer:Job / Vendor creation</h3>
              <p>
                Map an existing record first whenever possible. This action creates a QuickBooks
                name on the next connector run.
              </p>
              <select name="operation" aria-label="Create entity type">
                <option value="CREATE_PROJECT">Customer:Job</option>
                <option value="CREATE_VENDOR">Vendor</option>
              </select>
              <select name="entityId" aria-label="Local entity to create">
                <optgroup label="Projects">
                  {data.options.PROJECT.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Vendor Contacts">
                  {data.options.VENDOR_CONTACT.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <label>
                QuickBooks name
                <input name="name" maxLength={41} />
              </label>
              <label>
                Parent Customer (Projects only)
                <select name="parentListId">
                  <option value="">Create a top-level Customer</option>
                  {data.candidates
                    .filter((x) => x.connectionId === id && x.type === 'Customer' && x.active)
                    .map((x) => (
                      <option key={x.id} value={x.listId}>
                        {x.fullName}
                      </option>
                    ))}
                </select>
              </label>
              <ActionButton
                action={() =>
                  submit(document.getElementById('create-qb')!.closest('form')!, 'queue', {
                    connectionId: id,
                  })
                }
              >
                Queue explicit creation
              </ActionButton>
              <span id="create-qb" />
            </form>
            <form onSubmit={(e) => e.preventDefault()}>
              <select name="entityId" aria-label="Issued purchase order">
                {data.purchasing.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.document.number} Rev {p.revision}
                  </option>
                ))}
              </select>
              <ActionButton
                action={() =>
                  submit(document.getElementById('po-queue')!.closest('form')!, 'queue', {
                    connectionId: id,
                    operation: 'PURCHASE_ORDER',
                  })
                }
              >
                Queue Purchase Order
              </ActionButton>
              <span id="po-queue" />
              <QuickBooksPreview connectionId={c.id} operation="PURCHASE_ORDER" marker="po-queue" />
            </form>
            <form onSubmit={(e) => e.preventDefault()}>
              <select name="entityId" aria-label="Approved time">
                {data.time.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.user.firstName} {t.user.lastName} — {String(t.effectiveStart)}
                  </option>
                ))}
              </select>
              <ActionButton
                action={() =>
                  submit(document.getElementById('time-queue')!.closest('form')!, 'queue', {
                    connectionId: id,
                    operation: 'TIME',
                  })
                }
              >
                Queue approved time
              </ActionButton>
              <span id="time-queue" />
              <QuickBooksPreview connectionId={c.id} operation="TIME" marker="time-queue" />
            </form>
          </section>
          <section className="card">
            <h2>Queue and reconciliation</h2>
            {data.jobs
              .filter((x) => x.connectionId === id)
              .map((j) => (
                <div className="card" key={j.id}>
                  <strong>
                    {j.operation} — {j.status}
                  </strong>
                  <p>{j.lastError}</p>
                  {data.mappings
                    .filter(
                      (m) =>
                        m.connectionId === id &&
                        m.quickBooksTxnId &&
                        (m.entityId === j.entityId ||
                          (m.metadata as { revisionId?: string } | null)?.revisionId ===
                            j.entityId),
                    )
                    .map((m) => (
                      <p key={m.id}>
                        QuickBooks TxnID: {m.quickBooksTxnId} · EditSequence:{' '}
                        {m.quickBooksEditSequence} · {m.status} · Synchronized{' '}
                        {String(m.lastSyncedAt)}. Locate the PO by its number/Memo, or time by
                        Employee and date, in QuickBooks Desktop and compare every value.
                      </p>
                    ))}
                  {j.operation === 'PURCHASE_ORDER' && j.status === 'RECONCILIATION_REQUIRED' && (
                    <ActionButton
                      action={() =>
                        api('quickbooks/reconcile', {
                          action: 'refresh-po',
                          id: j.id,
                          note: 'Operator requested current QuickBooks transaction before review.',
                        })
                      }
                      onDone={() => void refresh()}
                    >
                      Refresh QuickBooks PO for review
                    </ActionButton>
                  )}
                  {j.status === 'RECONCILIATION_REQUIRED' && j.phase !== 'MOD_REVIEW' && (
                    <ActionButton
                      action={async () => {
                        const txnId = window.prompt(
                          'Close the old connector run. Enter the exact QuickBooks TxnID to query and verify against the original request:',
                        );
                        if (!txnId) throw new Error('Verification cancelled.');
                        await api('quickbooks/reconcile', {
                          action: 'verify-write',
                          id: j.id,
                          txnId,
                          note: 'Operator supplied transaction ID for exact verification.',
                        });
                      }}
                      onDone={() => void refresh()}
                    >
                      Verify uncertain transaction
                    </ActionButton>
                  )}
                  {j.phase === 'MOD_REVIEW' && (
                    <>
                      <pre>{JSON.stringify(j.payload, null, 2)}</pre>
                      <ActionButton
                        action={async () => {
                          const note = window.prompt(
                            'Review the latest QuickBooks PO above and the issued CW revision. Enter the reason for replacing QuickBooks scope/pricing:',
                          );
                          if (!note) throw new Error('Approval cancelled.');
                          await api('quickbooks/reconcile', {
                            action: 'approve-po',
                            id: j.id,
                            note,
                          });
                        }}
                        onDone={() => void refresh()}
                      >
                        Authorize reviewed PO modification
                      </ActionButton>
                    </>
                  )}
                  {['BLOCKED', 'FAILED'].includes(j.status) && (
                    <ActionButton
                      action={() =>
                        api('quickbooks/reconcile', {
                          action: 'retry',
                          id: j.id,
                          note: 'Operator reviewed configuration and requested retry.',
                        })
                      }
                      onDone={() => void refresh()}
                    >
                      Retry after review
                    </ActionButton>
                  )}
                </div>
              ))}
            {data.bills
              .filter((x) => x.connectionId === id)
              .map((b) => (
                <div key={b.id}>
                  <p>
                    Bill {b.txnId} — {b.status}: {b.lastError}
                  </p>
                  <ActionButton
                    action={() =>
                      api('quickbooks/reconcile', {
                        action: 'bill',
                        id: b.id,
                        note: 'Operator reviewed Bill mappings.',
                      })
                    }
                    onDone={() => void refresh()}
                  >
                    Recheck Bill mappings
                  </ActionButton>
                  <Link href="/projects">Open project actual-cost reconciliation</Link>
                </div>
              ))}
          </section>
          <section className="card">
            <h2>Actionable issues</h2>
            {data.issues
              .filter((x) => x.connectionId === id)
              .map((i) => (
                <div key={i.id}>
                  <strong>{i.code}</strong>
                  <p>{i.message}</p>
                  <ActionButton
                    action={async () => {
                      const note = window.prompt(
                        'Describe how this issue was resolved. This records a note; it does not resend or alter accounting transactions.',
                      );
                      if (!note) throw new Error('Resolution cancelled.');
                      await api('quickbooks/reconcile', { action: 'resolve', id: i.id, note });
                    }}
                    onDone={() => void refresh()}
                  >
                    Record resolution
                  </ActionButton>
                </div>
              ))}
            <h2>Recent runs</h2>
            {data.runs
              .filter((x) => x.connectionId === id)
              .map((r) => (
                <div key={r.id}>
                  {String(r.startedAt)} — {r.status}: {r.succeeded} succeeded, {r.failed} failed
                  <QuickBooksRun id={r.id} />
                </div>
              ))}
          </section>
        </>
      )}
    </div>
  );
}
