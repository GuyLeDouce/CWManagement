'use client';
import { useState, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { api, useApi, pretty } from '@/lib/client';
import { ActionButton, ErrorBox, Empty } from './ui';
import { ReminderSettings } from './business-reports';
const recentKey = 'cw-recent-project-ids';
const recentSubscribe = (callback: () => void) => {
  window.addEventListener('cw-recent', callback);
  return () => window.removeEventListener('cw-recent', callback);
};
export function RecentProjects({ projectId }: { projectId?: string }) {
  const projects = useApi<{ projects: { id: string; name: string; number: string }[] }>(
    'management/projects',
  );
  const raw = useSyncExternalStore(
    recentSubscribe,
    () => {
      try {
        return sessionStorage.getItem(recentKey) || '[]';
      } catch {
        return '[]';
      }
    },
    () => '[]',
  );
  useEffect(() => {
    if (!projectId || !projects.data?.projects.some((p) => p.id === projectId)) return;
    try {
      const old = JSON.parse(sessionStorage.getItem(recentKey) || '[]') as string[];
      if (old[0] === projectId) return;
      sessionStorage.setItem(
        recentKey,
        JSON.stringify([projectId, ...old.filter((id) => id !== projectId)].slice(0, 5)),
      );
      window.dispatchEvent(new Event('cw-recent'));
    } catch {
      /* Storage is optional; server authorization remains authoritative. */
    }
  }, [projectId, projects.data]);
  let ids: string[] = [];
  try {
    ids = JSON.parse(raw);
  } catch {
    /* Ignore malformed local preferences. */
  }
  const visible = ids.flatMap((id) => projects.data?.projects.filter((p) => p.id === id) || []);
  return visible.length ? (
    <div className="recent-projects">
      <span className="sidebar-caption">Recent projects</span>
      {visible.map((p) => (
        <Link key={p.id} href={`/projects/${p.id}`}>
          {p.number}
          <small>{p.name}</small>
        </Link>
      ))}
    </div>
  ) : null;
}
export function WorkCentre({ mine = false, projectId }: { mine?: boolean; projectId?: string }) {
  const query = useApi<{
    warranty: {id:string;projectId:string;title:string;status:string;dueAt:string|null}[];
    followUps: {id:string;title:string;dueAt:string}[];
    tasks: {
      id: string;
      projectId: string;
      name: string;
      status: string;
      endDate: string | null;
      milestone: boolean;
      project: { name: string };
    }[];
    notifications: { id: string; title: string; actionUrl: string | null }[];
    deficiencies: { id: string; projectId: string; title: string }[];
    selections: {
      id: string;
      projectId: string;
      title: string;
      deadline: string | null;
      status: string;
    }[];
  }>(
    `standards/work?mine=${mine}${projectId ? '&projectId=' + encodeURIComponent(projectId) : ''}`,
  );
  const today = new Date().toISOString().slice(0, 10);
  const data = query.data;
  return (
    <section className="work-centre">
      <div className="section-actions">
        <div>
          <span className="eyebrow">{mine ? 'Your workday' : 'Today & ahead'}</span>
          <h2>{mine ? 'My Work' : 'Attention required'}</h2>
        </div>
        <Link href="/projects">Open projects →</Link>
      </div>
      <ErrorBox message={query.error} />
      {data && (
        <div className="management-grid">
          <section className="panel">
            <h3>{mine ? 'Assigned to you' : 'Open tasks & milestones'}</h3>
            {data.tasks.map((t) => (
              <Link className="data-row" key={t.id} href={`/projects/${t.projectId}/schedule`}>
                <span>
                  <strong>
                    {t.milestone ? '◆ ' : ''}
                    {t.name}
                  </strong>
                  <small>
                    {t.project.name} · {pretty(t.status)}
                  </small>
                </span>
                <span className={t.endDate && t.endDate.slice(0, 10) < today ? 'overdue' : ''}>
                  {t.endDate?.slice(0, 10) || 'No due date'}
                </span>
              </Link>
            ))}
            {!data.tasks.length && (
              <Empty title="No open tasks">
                Assigned work will appear here with its next action.
              </Empty>
            )}
          </section>
          <section className="panel">
            <h3>Decisions & follow-up</h3>
            {data.followUps.map(f=><Link key={f.id} className="data-row" href="/leads">{f.title}<small>Sales follow-up · {f.dueAt.slice(0,10)}</small></Link>)}
            {data.warranty.map(w=><Link key={w.id} className="data-row" href={`/projects/${w.projectId}/warranty`}>{w.title}<small>Warranty · {pretty(w.status)}</small></Link>)}
            {data.selections.map((s) => (
              <Link key={s.id} className="data-row" href={`/projects/${s.projectId}/selections`}>
                <span>
                  {s.title}
                  <small>Selection · {pretty(s.status)}</small>
                </span>
                <span>{s.deadline?.slice(0, 10)}</span>
              </Link>
            ))}
            {data.deficiencies.map((d) => (
              <Link className="data-row" key={d.id} href={`/projects/${d.projectId}/trades`}>
                <span>
                  {d.title}
                  <small>Deficiency ready for review</small>
                </span>
              </Link>
            ))}
            {data.notifications.map((n) => (
              <Link className="data-row" key={n.id} href={n.actionUrl || '/notifications'}>
                {n.title}
              </Link>
            ))}
            {!data.notifications.length && !data.selections.length && !data.deficiencies.length && !data.warranty.length && !data.followUps.length && (
              <Empty title="No outstanding follow-up">
                Approvals, decisions and messages will appear as work progresses.
              </Empty>
            )}
          </section>
        </div>
      )}
      {mine && <ReminderSettings />}
    </section>
  );
}
export function GlobalSearch() {
  const [q, setQ] = useState('');
  const query = useApi<{ results: { id: string; title: string; type: string; href: string }[] }>(
    `standards/search?q=${encodeURIComponent(q)}`,
  );
  return (
    <div className="global-search">
      <input
        aria-label="Search workspace"
        placeholder="Search projects, contacts, selections, files…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {q.length >= 2 && (
        <div className="search-results">
          <ErrorBox message={query.error} />
          {query.data?.results.map((r) => (
            <Link key={`${r.type}:${r.id}`} href={r.href} onClick={() => setQ('')}>
              <small>{r.type}</small>
              {r.title}
            </Link>
          ))}
          {query.data && !query.data.results.length && <p>No accessible matches.</p>}
        </div>
      )}
    </div>
  );
}
export function CompanyDefaults() {
  const q = useApi<{
    defaultProvince: string;
    defaultMarkupMethod: string;
    defaultMarkupValue: string;
  }>('standards/defaults');
  const [edit, setEdit] = useState<{
    defaultProvince: string;
    defaultMarkupMethod: string;
    defaultMarkupValue: string;
  } | null>(null);
  const d = edit || q.data;
  return (
    <section className="panel">
      <h2>Company defaults</h2>
      <p>Starting values for new work. Existing records retain their values.</p>
      <ErrorBox message={q.error} />
      {d && (
        <div className="entity-form">
          <label>
            Province
            <input
              value={d.defaultProvince}
              onChange={(e) => setEdit({ ...d, defaultProvince: e.target.value })}
            />
          </label>
          <label>
            Default markup
            <select
              value={d.defaultMarkupMethod}
              onChange={(e) => setEdit({ ...d, defaultMarkupMethod: e.target.value })}
            >
              {['NONE', 'FIXED', 'PERCENT_ON_COST'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            Markup value
            <input
              value={d.defaultMarkupValue}
              onChange={(e) => setEdit({ ...d, defaultMarkupValue: e.target.value })}
            />
          </label>
          <ActionButton action={() => api('standards/defaults', d)}>
            Save company defaults
          </ActionButton>
          <Link href="/financials">Tax, numbering and document terms → Financials</Link>
        </div>
      )}
    </section>
  );
}
