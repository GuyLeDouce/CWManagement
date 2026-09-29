'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, useApi, pretty } from '@/lib/client';
import { ActionButton, ErrorBox } from './ui';
import type { ReportRow, ReportFilters } from '@/lib/portfolio-reports';
export function BusinessDashboard() {
  const q = useApi<{ cards: { label: string; value: string; href: string }[] }>(
    'business/dashboard',
  );
  return (
    <>
      <ErrorBox message={q.error} />
      <div className="summary-grid">
        {q.data?.cards.map((c) => (
          <Link className="panel" key={c.label} href={c.href}>
            <strong>{c.value}</strong>
            <p>{c.label}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
export function ReportsWorkspace() {
  const options = useApi<{
    reports: ReportFilters['report'][];
    saved: { id: string; name: string; filters: ReportFilters }[];
  }>('business/reports');
  const projects = useApi<{ projects: { id: string; name: string }[] }>('management/projects');
  const [filters, setFilters] = useState<ReportFilters>({
      report: 'projects',
      overdue: false,
      milestones: false,
    }),
    [result, setResult] = useState<{
      rows: ReportRow[];
      basis: string;
      generatedAt: string;
    } | null>(null),
    [name, setName] = useState(''),
    [sort, setSort] = useState('');
  const columns = [...new Set((result?.rows || []).flatMap((r) => Object.keys(r)))].filter(
    (k) => k !== 'href',
  );
  const rows = [...(result?.rows || [])].sort((a, b) =>
    sort
      ? String(a[sort] ?? '').localeCompare(String(b[sort] ?? ''), undefined, { numeric: true })
      : 0,
  );
  const csv = () => {
    const escape = (v: unknown) => {
      const s = String(v ?? '');
      return (
        '"' + (/^[=+@\t\r]/.test(s) || /^-[^\d]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
      );
    };
    const content = [columns, ...rows.map((r) => columns.map((c) => r[c]))]
      .map((row) => row.map(escape).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `cw-${filters.report}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="report-workspace">
      <header>
        <span className="eyebrow">CWMANAGEMENT</span>
        <h1>Reports</h1>
        <p>Operational reports across the projects you are authorized to see.</p>
        <Link href="/how-to/business/business-reports">Reports help</Link>
      </header>
      <ErrorBox message={options.error} />
      <div className="panel report-controls">
        <div className="form-grid">
          <label>
            Report
            <select
              aria-label="Report"
              value={filters.report}
              onChange={(e) => {
                setFilters({
                  report: e.target.value as ReportFilters['report'],
                  overdue: false,
                  milestones: false,
                });
                setResult(null);
              }}
            >
              {options.data?.reports.map((r) => (
                <option value={r} key={r}>
                  {pretty(r)}
                </option>
              ))}
            </select>
          </label>
          {['time', 'crm'].includes(filters.report) && (
            <label>
              Group by
              <select
                aria-label="Group by"
                value={filters.groupBy || ''}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    groupBy: (e.target.value || undefined) as ReportFilters['groupBy'],
                  })
                }
              >
                <option value="">Individual records</option>
                {(filters.report === 'time'
                  ? ['project', 'employee', 'task', 'code']
                  : ['stage', 'source', 'owner']
                ).map((g) => (
                  <option key={g} value={g}>
                    {pretty(g)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Project
            <select
              aria-label="Project"
              value={filters.projectId || ''}
              onChange={(e) => setFilters({ ...filters, projectId: e.target.value || undefined })}
            >
              <option value="">All accessible projects</option>
              {projects.data?.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input
              value={filters.q || ''}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            />
          </label>
          <label>
            Status
            <input
              placeholder="e.g. IN_PROGRESS"
              value={filters.status || ''}
              onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
            />
          </label>
          <label>
            From (Due/date)
            <input
              type="date"
              value={filters.from || ''}
              onChange={(e) => setFilters({ ...filters, from: e.target.value || undefined })}
            />
          </label>
          <label>
            To (Due/date)
            <input
              type="date"
              value={filters.to || ''}
              onChange={(e) => setFilters({ ...filters, to: e.target.value || undefined })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={filters.overdue}
              onChange={(e) => setFilters({ ...filters, overdue: e.target.checked })}
            />
            Overdue only
          </label>
          <label>
            <input
              type="checkbox"
              checked={filters.milestones}
              onChange={(e) => setFilters({ ...filters, milestones: e.target.checked })}
            />
            Milestones only (Tasks)
          </label>
        </div>
        <div className="toolbar">
          <ActionButton action={async () => setResult(await api('business/reports/run', filters))}>
            Run report
          </ActionButton>
          <button disabled={!result} onClick={csv}>
            Export CSV
          </button>
          <button disabled={!result} onClick={() => window.print()}>
            Print report
          </button>
        </div>
        <div className="toolbar">
          <label>
            Save this view
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <ActionButton
            action={async () => {
              await api('business/reports/save', { name, filters });
              options.refresh();
            }}
          >
            Save view
          </ActionButton>
          <select
            aria-label="Saved report"
            defaultValue=""
            onChange={(e) => {
              const saved = options.data?.saved.find((s) => s.id === e.target.value);
              if (saved) {
                setFilters(saved.filters);
                setResult(null);
              }
            }}
          >
            <option value="">Choose a saved view</option>
            {options.data?.saved.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {result ? (
        <>
          <p>{result.basis}</p>
          <p>
            {rows.length} rows · {new Date(result.generatedAt).toLocaleString()}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>
                      <button className="text-button" onClick={() => setSort(c)}>
                        {pretty(c)}
                      </button>
                    </th>
                  ))}
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c}>{r[c] ?? '—'}</td>
                    ))}
                    <td>{r.href && <Link href={String(r.href)}>Open record</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <p>No records match these filters.</p>}
        </>
      ) : (
        <section className="panel">
          <h2>Choose a report to begin</h2>
          <p>
            Filter, review, then save a reusable view. Permissions are checked again each time you
            run it.
          </p>
        </section>
      )}
    </div>
  );
}
export function ReminderSettings({ projectId }: { projectId?: string }) {
  const q = useApi<{
    dailyDigestEnabled: boolean;
    settings?: { automationEnabled: boolean; automationEmailEnabled: boolean };
    runs?: {
      id: string;
      status: string;
      startedAt: string;
      generated: number;
      delivered: number;
    }[];
    deliveries?: { id: string; status: string; safeError: string }[];
  }>('business/automation');
  const p = useApi<{
    project: {
      warrantyStartDate: string | null;
      warrantyExpirationDate: string | null;
      weeklyClientSummaryEnabled: boolean;
    };
  }>(projectId ? `business/warranty/options?projectId=${projectId}` : '');
  return (
    <section className="panel">
      <h2>Reminders & summaries</h2>
      <p>
        Scheduled delivery starts only after company opt-in and cron setup. In-app notifications
        remain authoritative.
      </p>
      <ErrorBox message={q.error} />
      {q.data && (
        <ActionButton
          action={async () => {
            await api('business/automation', { dailyDigestEnabled: !q.data!.dailyDigestEnabled });
            q.refresh();
          }}
        >
          {q.data.dailyDigestEnabled ? 'Disable' : 'Enable'} my daily digest
        </ActionButton>
      )}
      {q.data?.settings && (
        <>
          <ActionButton
            action={async () => {
              await api('business/automation', {
                automationEnabled: !q.data!.settings!.automationEnabled,
              });
              q.refresh();
            }}
          >
            {q.data.settings.automationEnabled ? 'Pause' : 'Enable'} scheduled reminders
          </ActionButton>
          <ActionButton
            action={async () => {
              await api('business/automation', {
                automationEmailEnabled: !q.data!.settings!.automationEmailEnabled,
              });
              q.refresh();
            }}
          >
            {q.data.settings.automationEmailEnabled ? 'Disable' : 'Enable'} reminder email
          </ActionButton>
          <details>
            <summary>Recent runs & delivery exceptions</summary>
            {q.data.runs?.map((r) => (
              <p key={r.id}>
                {r.startedAt} · {r.status} · {r.generated} notices / {r.delivered} emails
              </p>
            ))}
            {q.data.deliveries?.map((d) => (
              <DeliveryReview key={d.id} delivery={d} refresh={q.refresh} />
            ))}
          </details>
        </>
      )}
      {p.data && (
        <form onSubmit={(e) => e.preventDefault()}>
          <h3>Project warranty dates</h3>
          <p>Dates are entered operational reminders, not a determination of legal coverage.</p>
          <label>
            Start
            <input
              name="start"
              type="date"
              defaultValue={p.data.project.warrantyStartDate?.slice(0, 10)}
            />
          </label>
          <label>
            Expiration
            <input
              name="expiration"
              type="date"
              defaultValue={p.data.project.warrantyExpirationDate?.slice(0, 10)}
            />
          </label>
          <label>
            <input
              name="summary"
              type="checkbox"
              defaultChecked={p.data.project.weeklyClientSummaryEnabled}
            />
            Enable weekly client project review
          </label>
          <button
            type="button"
            onClick={async (e) => {
              const f = new FormData(e.currentTarget.form!);
              try {
                await api('business/automation', {
                  projectId,
                  warrantyStartDate: f.get('start') || null,
                  warrantyExpirationDate: f.get('expiration') || null,
                  weeklyClientSummaryEnabled: f.get('summary') === 'on',
                });
                p.refresh();
              } catch (error) {
                window.alert(
                  error instanceof Error ? error.message : 'Settings could not be saved.',
                );
              }
            }}
          >
            Save project reminder settings
          </button>
        </form>
      )}
    </section>
  );
}
function DeliveryReview({
  delivery,
  refresh,
}: {
  delivery: { id: string; status: string; safeError: string };
  refresh: () => void;
}) {
  const [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  return (
    <div className="panel">
      <p>
        {pretty(delivery.status)}: {delivery.safeError}
      </p>
      <label>
        Review reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {delivery.status === 'REVIEW_REQUIRED' && (
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I checked the provider outcome and understand that retry could duplicate an accepted
          email.
        </label>
      )}
      <div className="toolbar">
        {(['retry', 'cancel'] as const).map((action) => (
          <ActionButton
            key={action}
            action={async () => {
              await api('business/automation/review', {
                id: delivery.id,
                action,
                reason,
                acknowledgeDuplicateRisk: confirmed,
              });
              refresh();
            }}
          >
            {action === 'retry' ? 'Retry delivery' : 'Cancel delivery'}
          </ActionButton>
        ))}
      </div>
    </div>
  );
}
